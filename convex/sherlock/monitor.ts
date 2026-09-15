import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import type { ActionCtx } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { scrape, search, FirecrawlUnavailable } from './firecrawl';
import { contentHash, logEvent, setStatus } from '../helpers';
import { hostFromUrl, rootDomain } from '../core/email';

/**
 * Scheduled monitoring — the part that keeps an investigation alive after the
 * first pass.
 *
 * A cron sweeps for monitors whose `nextRunAt` has passed; each one re-reads
 * one page with Firecrawl and compares a content hash against the last run.
 * Unchanged page, no action and no model call — change detection is what
 * makes daily re-crawling affordable rather than a bill.
 *
 * Every monitor is bounded by `remainingRuns`, tied to exactly one
 * investigation, and switched off the moment that case resolves or pauses, so
 * background work can never accumulate unattended.
 */

const MAX_MONITORS_PER_SWEEP = 10;
const PRICE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PRICE_CHECK_RUNS = 14;

/** Set up price watching once a case has produced a claim worth watching. */
export const scheduleForInvestigation = internalMutation({
  args: { investigationId: v.id('investigations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const investigation = await ctx.db.get(args.investigationId);
    if (!investigation) return null;

    const existing = await ctx.db
      .query('monitors')
      .withIndex('by_investigation', (q) => q.eq('investigationId', args.investigationId))
      .first();
    if (existing) return null;

    // Watch the page the price evidence came from, if there is one.
    const priceEvidence = await ctx.db
      .query('evidence')
      .withIndex('by_investigation_kind', (q) =>
        q.eq('investigationId', args.investigationId).eq('kind', 'price')
      )
      .first();

    const url = priceEvidence?.sourceUrl;
    if (!url) return null;

    await ctx.db.insert('monitors', {
      investigationId: args.investigationId,
      kind: 'price',
      url,
      intervalMs: PRICE_CHECK_INTERVAL_MS,
      nextRunAt: Date.now() + PRICE_CHECK_INTERVAL_MS,
      remainingRuns: PRICE_CHECK_RUNS,
      active: true,
      createdAt: Date.now(),
    });

    await logEvent(ctx, {
      investigationId: args.investigationId,
      type: 'MONITOR_SCHEDULED',
      summary: `Watching ${hostFromUrl(url)} daily for ${PRICE_CHECK_RUNS} days`,
      detail: { url },
    });
    return null;
  },
});

export const due = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<'monitors'>[]> =>
    ctx.db
      .query('monitors')
      .withIndex('by_active_nextRunAt', (q) => q.eq('active', true).lte('nextRunAt', Date.now()))
      .take(MAX_MONITORS_PER_SWEEP),
});

/** Cron entry point. Bounded per sweep so a backlog cannot stampede. */
export const sweep = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const monitors: Doc<'monitors'>[] = await ctx.runQuery(internal.sherlock.monitor.due, {});

    let processed = 0;
    for (const monitor of monitors) {
      try {
        if (monitor.kind === 'claim_followup') {
          await ctx.runMutation(internal.sherlock.monitor.chaseClaim, { monitorId: monitor._id });
        } else if (monitor.url) {
          await recheckPage(ctx, monitor);
        }
      } catch (error) {
        await ctx.runMutation(internal.sherlock.monitor.recordRun, {
          monitorId: monitor._id,
          result:
            error instanceof FirecrawlUnavailable
              ? `Could not read the page: ${error.message.slice(0, 120)}`
              : `Check failed: ${(error as Error).message.slice(0, 120)}`,
        });
      }
      processed++;
    }
    return processed;
  },
});

/**
 * Re-read a watched page. The hash comparison is the whole trick: only a
 * genuinely changed page costs a model call or produces an event.
 */
async function recheckPage(
  ctx: ActionCtx,
  monitor: Doc<'monitors'>
): Promise<void> {
  // maxAge 0 so Firecrawl re-fetches rather than serving us our own cache.
  const result = await scrape(monitor.url!, 0);
  const hash = contentHash(result.markdown);

  if (monitor.lastContentHash && monitor.lastContentHash === hash) {
    await ctx.runMutation(internal.sherlock.monitor.recordRun, {
      monitorId: monitor._id,
      contentHash: hash,
      result: 'No change',
    });
    return;
  }

  await ctx.runMutation(internal.sherlock.monitor.recordRun, {
    monitorId: monitor._id,
    contentHash: hash,
    result: monitor.lastContentHash ? 'Page changed' : 'Baseline captured',
    changed: !!monitor.lastContentHash,
  });

  if (monitor.lastContentHash) {
    await ctx.runMutation(internal.sherlock.research.saveSource, {
      url: monitor.url!,
      title: result.title,
      content: result.markdown.slice(0, 30_000),
    });
  }
}

export const recordRun = internalMutation({
  args: {
    monitorId: v.id('monitors'),
    contentHash: v.optional(v.string()),
    result: v.string(),
    changed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const monitor = await ctx.db.get(args.monitorId);
    if (!monitor) return null;

    const remaining = monitor.remainingRuns - 1;
    await ctx.db.patch(args.monitorId, {
      lastRunAt: Date.now(),
      lastContentHash: args.contentHash ?? monitor.lastContentHash,
      lastResult: args.result.slice(0, 300),
      remainingRuns: Math.max(0, remaining),
      nextRunAt: Date.now() + monitor.intervalMs,
      active: remaining > 0,
    });

    // Only a real change is worth the user's attention.
    if (args.changed) {
      await logEvent(ctx, {
        investigationId: monitor.investigationId,
        type: 'MONITOR_DETECTED_CHANGE',
        summary: `${hostFromUrl(monitor.url ?? '')} changed since the last check`,
        detail: { url: monitor.url },
      });
    }
    return null;
  },
});

/**
 * Nobody answered. Move the case to FOLLOW_UP_READY so the user decides
 * whether to chase — Sherlock does not chase on its own.
 */
export const chaseClaim = internalMutation({
  args: { monitorId: v.id('monitors') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const monitor = await ctx.db.get(args.monitorId);
    if (!monitor) return null;

    const investigation = await ctx.db.get(monitor.investigationId);
    const remaining = monitor.remainingRuns - 1;
    await ctx.db.patch(args.monitorId, {
      lastRunAt: Date.now(),
      remainingRuns: Math.max(0, remaining),
      nextRunAt: Date.now() + monitor.intervalMs,
      active: remaining > 0,
      lastResult: 'Checked for a reply',
    });

    if (!investigation || investigation.status !== 'WAITING_FOR_REPLY') return null;

    const claim = await ctx.db
      .query('claims')
      .withIndex('by_investigation', (q) => q.eq('investigationId', monitor.investigationId))
      .order('desc')
      .first();
    if (!claim || claim.status !== 'sent') return null;

    const days = Math.round((Date.now() - (claim.sentAt ?? Date.now())) / 86_400_000);
    await ctx.runMutation(internal.claims.createDraft, {
      investigationId: monitor.investigationId,
      claimType: 'follow_up',
      toEmail: claim.toEmail,
      subject: `Re: ${claim.subject}`.slice(0, 200),
      body:
        `Hello,\n\nI wrote ${days} day${days === 1 ? '' : 's'} ago about ${investigation.title} ` +
        `and have not had a reply yet. Could you let me know where this stands?\n\n` +
        `Thank you.\n\nSent via Sherlock.`,
      reasoning: `No reply after ${days} days. This chases the original claim in the same thread.`,
      evidenceIds: [],
      potentialAmount: claim.potentialAmount,
      currency: claim.currency,
      isFollowUp: true,
      threadId: claim.threadId,
    });

    await setStatus(ctx, investigation, 'REPLY_RECEIVED', {
      summary: `No reply after ${days} days`,
    });
    const current = await ctx.db.get(monitor.investigationId);
    if (current) {
      await setStatus(ctx, current, 'FOLLOW_UP_READY', {
        summary: 'Drafted a nudge for your approval',
      });
    }
    return null;
  },
});

/** Let the user watch a specific product page from the case view. */
export const addPriceWatch = internalMutation({
  args: { investigationId: v.id('investigations'), url: v.string() },
  returns: v.id('monitors'),
  handler: async (ctx, args): Promise<Id<'monitors'>> => {
    const id = await ctx.db.insert('monitors', {
      investigationId: args.investigationId,
      kind: 'price',
      url: args.url,
      intervalMs: PRICE_CHECK_INTERVAL_MS,
      nextRunAt: Date.now() + 60_000,
      remainingRuns: PRICE_CHECK_RUNS,
      active: true,
      createdAt: Date.now(),
    });
    await logEvent(ctx, {
      investigationId: args.investigationId,
      type: 'MONITOR_SCHEDULED',
      summary: `Watching ${hostFromUrl(args.url)} daily`,
      detail: { url: args.url },
    });
    return id;
  },
});

/**
 * Find the merchant's live product page so there is something to watch when
 * the policy pages did not yield a price source.
 */
export const discoverPricePage = internalAction({
  args: { investigationId: v.id('investigations') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const investigation = await ctx.runQuery(internal.investigations.getInternal, {
      id: args.investigationId,
    });
    if (!investigation?.productName || !investigation.merchantDomain) return null;

    try {
      const hits = await search(
        `${investigation.productName} site:${investigation.merchantDomain}`,
        3
      );
      const hit = hits.find(
        (candidate) => rootDomain(hostFromUrl(candidate.url)) === investigation.merchantDomain
      );
      if (!hit) return null;
      await ctx.runMutation(internal.sherlock.monitor.addPriceWatch, {
        investigationId: args.investigationId,
        url: hit.url,
      });
      return hit.url;
    } catch {
      return null;
    }
  },
});
