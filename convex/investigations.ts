import { query, mutation, internalQuery, internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireOwner } from './auth';
import { getOwnedInvestigation, logEvent, setStatus } from './helpers';
import { investigationStatus } from './schema';
import { ACTIVE_STATES, needsAttention, type InvestigationState } from './core/states';

/**
 * Investigations — the product's central object.
 *
 * Reads are reactive Convex queries, so the dashboard moves on its own as the
 * pipeline advances a case; nothing here polls. Every public function
 * authenticates through `requireOwner` and scopes by `ownerKey` using an
 * index, so no query ever scans the table.
 */

const LIST_LIMIT = 100;

// ------------------------------------------------------------------- queries

export const list = query({
  args: {
    token: v.optional(v.string()),
    filter: v.optional(
      v.union(v.literal('all'), v.literal('active'), v.literal('attention'), v.literal('resolved'))
    ),
  },
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);

    const rows = await ctx.db
      .query('investigations')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerKey', ownerKey))
      .order('desc')
      .take(LIST_LIMIT);

    const filter = args.filter ?? 'all';
    return rows.filter((row) => {
      const status = row.status as InvestigationState;
      if (filter === 'active') return ACTIVE_STATES.includes(status);
      if (filter === 'attention') return needsAttention(status);
      if (filter === 'resolved') return status === 'RESOLVED';
      return true;
    });
  },
});

/** Full case file: investigation, timeline, evidence, claims and emails. */
export const get = query({
  args: { token: v.optional(v.string()), id: v.id('investigations') },
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const investigation = await ctx.db.get(args.id);
    if (!investigation || investigation.ownerKey !== ownerKey) return null;

    const [events, evidence, claims, emails] = await Promise.all([
      ctx.db
        .query('events')
        .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
        .order('desc')
        .take(200),
      ctx.db
        .query('evidence')
        .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
        .take(100),
      ctx.db
        .query('claims')
        .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
        .order('desc')
        .take(20),
      ctx.db
        .query('emails')
        .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
        .take(50),
    ]);

    const monitors = await ctx.db
      .query('monitors')
      .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
      .take(10);

    return { investigation, events, evidence, claims, emails, monitors };
  },
});

/**
 * Dashboard totals.
 *
 * `potential` and `recovered` are kept strictly apart: potential is what the
 * evidence suggests might be owed, recovered is only what a merchant actually
 * confirmed. Nothing here ever promotes one into the other on its own.
 */
export const stats = query({
  args: { token: v.optional(v.string()) },
  returns: v.object({
    active: v.number(),
    needsAttention: v.number(),
    resolved: v.number(),
    potential: v.number(),
    pending: v.number(),
    recovered: v.number(),
    currency: v.string(),
  }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const rows = await ctx.db
      .query('investigations')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerKey', ownerKey))
      .order('desc')
      .take(LIST_LIMIT);

    let active = 0;
    let attention = 0;
    let resolved = 0;
    let potential = 0;
    let pending = 0;
    let recovered = 0;
    const currencies = new Map<string, number>();

    for (const row of rows) {
      const status = row.status as InvestigationState;
      if (ACTIVE_STATES.includes(status)) active++;
      if (needsAttention(status)) attention++;
      if (status === 'RESOLVED') resolved++;

      if (row.currency) currencies.set(row.currency, (currencies.get(row.currency) ?? 0) + 1);

      const amount = row.potentialAmount ?? 0;
      // Sent but not yet answered = pending. Still in draft = potential.
      if (status === 'SENT' || status === 'WAITING_FOR_REPLY' || status === 'REPLY_RECEIVED') {
        pending += amount;
      } else if (ACTIVE_STATES.includes(status)) {
        potential += amount;
      }
      recovered += row.recoveredAmount ?? 0;
    }

    const currency =
      [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';

    return { active, needsAttention: attention, resolved, potential, pending, recovered, currency };
  },
});

/** Global activity feed across all cases. */
export const activity = query({
  args: { token: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.token);
    const events = await ctx.db
      .query('events')
      .withIndex('by_createdAt')
      .order('desc')
      .take(Math.min(args.limit ?? 60, 200));

    // Attach case titles so the feed reads as prose, not ids.
    const titles = new Map<string, string>();
    for (const event of events) {
      if (!event.investigationId || titles.has(event.investigationId)) continue;
      const investigation = await ctx.db.get(event.investigationId);
      if (investigation) titles.set(event.investigationId, investigation.title);
    }

    return events.map((event) => ({
      ...event,
      investigationTitle: event.investigationId ? titles.get(event.investigationId) : undefined,
    }));
  },
});

// ----------------------------------------------------------------- mutations

/** Pause a case. Sherlock stops working it and monitors go quiet. */
export const pause = mutation({
  args: { token: v.optional(v.string()), id: v.id('investigations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const investigation = await getOwnedInvestigation(ctx, args.id, ownerKey);
    await setStatus(ctx, investigation, 'PAUSED', { summary: 'Paused by you' });
    await deactivateMonitors(ctx, args.id);
    return null;
  },
});

export const resume = mutation({
  args: { token: v.optional(v.string()), id: v.id('investigations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const investigation = await getOwnedInvestigation(ctx, args.id, ownerKey);
    if (investigation.status !== 'PAUSED') throw new Error('That case is not paused.');

    // Resume where the evidence says we are, rather than restarting the work.
    const hasEvidence = await ctx.db
      .query('evidence')
      .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
      .first();
    const openClaim = await ctx.db
      .query('claims')
      .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
      .order('desc')
      .first();

    const target: InvestigationState =
      openClaim && openClaim.status === 'awaiting_approval'
        ? 'AWAITING_APPROVAL'
        : hasEvidence
          ? 'REASONING'
          : 'INVESTIGATING';

    await setStatus(ctx, investigation, target, { summary: 'Resumed by you' });
    return null;
  },
});

/** Close a case by hand, optionally recording what was actually recovered. */
export const resolve = mutation({
  args: {
    token: v.optional(v.string()),
    id: v.id('investigations'),
    recoveredAmount: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const investigation = await getOwnedInvestigation(ctx, args.id, ownerKey);

    if (args.recoveredAmount !== undefined && args.recoveredAmount < 0) {
      throw new Error('Recovered amount cannot be negative.');
    }

    await setStatus(ctx, investigation, 'RESOLVED', {
      eventType: 'RESOLVED',
      summary: args.note?.slice(0, 200) ?? 'Marked resolved',
      patch:
        args.recoveredAmount !== undefined
          ? { recoveredAmount: args.recoveredAmount }
          : undefined,
    });
    await deactivateMonitors(ctx, args.id);
    return null;
  },
});

/** Delete a case and everything attached to it. */
export const remove = mutation({
  args: { token: v.optional(v.string()), id: v.id('investigations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    await getOwnedInvestigation(ctx, args.id, ownerKey);

    for (const table of ['evidence', 'claims', 'monitors', 'events'] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
        .take(500);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    const emails = await ctx.db
      .query('emails')
      .withIndex('by_investigation', (q) => q.eq('investigationId', args.id))
      .take(500);
    for (const email of emails) await ctx.db.patch(email._id, { investigationId: undefined });

    await ctx.db.delete(args.id);
    return null;
  },
});

// ----------------------------------------------------- internal (pipeline)

export const create = internalMutation({
  args: {
    ownerKey: v.string(),
    title: v.string(),
    sourceEmailId: v.id('emails'),
    merchantDomain: v.optional(v.string()),
    merchantName: v.optional(v.string()),
  },
  returns: v.id('investigations'),
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert('investigations', {
      ownerKey: args.ownerKey,
      status: 'RECEIVED',
      title: args.title.slice(0, 160),
      sourceEmailId: args.sourceEmailId,
      merchantDomain: args.merchantDomain,
      merchantName: args.merchantName,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.sourceEmailId, { investigationId: id });
    await logEvent(ctx, {
      investigationId: id,
      type: 'INVESTIGATION_CREATED',
      summary: `Opened investigation: ${args.title.slice(0, 120)}`,
      toStatus: 'RECEIVED',
    });
    return id;
  },
});

export const getInternal = internalQuery({
  args: { id: v.id('investigations') },
  handler: async (ctx, args): Promise<Doc<'investigations'> | null> => ctx.db.get(args.id),
});

/** Status transition from a pipeline action. */
export const advance = internalMutation({
  args: {
    id: v.id('investigations'),
    to: investigationStatus,
    summary: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const investigation = await ctx.db.get(args.id);
    if (!investigation) return null;
    await setStatus(ctx, investigation, args.to as InvestigationState, {
      summary: args.summary,
      detail: args.detail,
    });
    return null;
  },
});

/** Record a failure honestly rather than leaving a case stuck mid-pipeline. */
export const fail = internalMutation({
  args: { id: v.id('investigations'), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const investigation = await ctx.db.get(args.id);
    if (!investigation) return null;
    // Terminal states stay terminal; a late failure must not reopen them.
    if (investigation.status === 'RESOLVED' || investigation.status === 'FAILED') return null;
    await setStatus(ctx, investigation, 'FAILED', {
      eventType: 'FAILED',
      summary: args.reason.slice(0, 200),
      patch: { failureReason: args.reason.slice(0, 400), lockedUntil: undefined },
    });
    return null;
  },
});

/** Write extracted transaction facts onto the case. */
export const applyExtraction = internalMutation({
  args: {
    id: v.id('investigations'),
    title: v.optional(v.string()),
    merchantName: v.optional(v.string()),
    merchantDomain: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    productName: v.optional(v.string()),
    orderId: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    purchasedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const investigation = await ctx.db.get(id);
    if (!investigation) return null;

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(id, patch);

    await logEvent(ctx, {
      investigationId: id,
      type: 'TRANSACTION_EXTRACTED',
      summary: fields.productName
        ? `Identified ${fields.productName}${fields.amount ? ` at ${fields.amount}` : ''}`
        : 'Read the transaction details',
      detail: fields,
    });
    return null;
  },
});

/** Write the reasoning verdict. */
export const applyAssessment = internalMutation({
  args: {
    id: v.id('investigations'),
    assessment: v.string(),
    confidence: v.optional(v.number()),
    potentialAmount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      assessment: args.assessment.slice(0, 2_000),
      confidence: args.confidence,
      potentialAmount: args.potentialAmount,
      updatedAt: Date.now(),
    });
    await logEvent(ctx, {
      investigationId: args.id,
      type: 'ANALYSIS_COMPLETED',
      summary: args.assessment.slice(0, 200),
    });
    return null;
  },
});

export const recordRecovery = internalMutation({
  args: { id: v.id('investigations'), amount: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const investigation = await ctx.db.get(args.id);
    if (!investigation) return null;
    await ctx.db.patch(args.id, {
      recoveredAmount: (investigation.recoveredAmount ?? 0) + args.amount,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Cooperative lock so a retried scheduled run cannot process the same case
 * twice in parallel. Returns false when another run already holds it.
 */
export const acquireLock = internalMutation({
  args: { id: v.id('investigations'), ttlMs: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const investigation = await ctx.db.get(args.id);
    if (!investigation) return false;
    const now = Date.now();
    if (investigation.lockedUntil && investigation.lockedUntil > now) return false;
    await ctx.db.patch(args.id, { lockedUntil: now + (args.ttlMs ?? 5 * 60_000) });
    return true;
  },
});

export const releaseLock = internalMutation({
  args: { id: v.id('investigations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const investigation = await ctx.db.get(args.id);
    if (investigation) await ctx.db.patch(args.id, { lockedUntil: undefined });
    return null;
  },
});

// ------------------------------------------------------------------ helpers

async function deactivateMonitors(
  ctx: MutationCtx,
  investigationId: Id<'investigations'>
): Promise<void> {
  const monitors = await ctx.db
    .query('monitors')
    .withIndex('by_investigation', (q) => q.eq('investigationId', investigationId))
    .take(20);
  for (const monitor of monitors) {
    if (monitor.active) await ctx.db.patch(monitor._id, { active: false });
  }
}

/** Retry a failed case from the top of the pipeline. */
export const retry = mutation({
  args: { token: v.optional(v.string()), id: v.id('investigations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const investigation = await getOwnedInvestigation(ctx, args.id, ownerKey);
    if (investigation.status !== 'FAILED') throw new Error('That case has not failed.');

    await setStatus(ctx, investigation, 'PARSING', { summary: 'Retrying' });
    await ctx.scheduler.runAfter(0, internal.sherlock.pipeline.investigate, {
      investigationId: args.id,
    });
    return null;
  },
});
