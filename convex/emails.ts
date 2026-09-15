import { query, internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireOwner, SINGLE_OWNER_KEY } from './auth';
import { logEvent } from './helpers';
import { sanitizeExternal } from './core/untrusted';
import {
  extractUrls,
  inboundKey,
  inferMerchantDomain,
  isReplyableAddress,
  normalizeEmail,
  parseForwarded,
  stripForwardPrefixes,
  stripQuotedReply,
} from './core/email';

/**
 * Email ingestion.
 *
 * Inbound mail arrives from the AgentMail webhook (http.ts) and lands here.
 * Two things matter and are both handled in a single mutation, so they are
 * atomic:
 *
 *   1. Idempotency. AgentMail retries deliveries. `dedupeKey` is unique per
 *      message; a repeat delivery returns the existing row and does NOT open
 *      a second investigation or re-run the pipeline.
 *   2. Routing. A reply on a thread Sherlock already owns updates that case;
 *      anything else opens a new one.
 *
 * Bodies are sanitized before they are stored, so no raw attacker-controlled
 * text is ever persisted or rendered.
 */

const MAX_BODY_CHARS = 20_000;

export const listInbox = query({
  args: { token: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.token);
    const emails = await ctx.db
      .query('emails')
      .withIndex('by_receivedAt')
      .order('desc')
      .take(Math.min(args.limit ?? 50, 200));

    const titles = new Map<string, { title: string; status: string }>();
    for (const email of emails) {
      if (!email.investigationId || titles.has(email.investigationId)) continue;
      const investigation = await ctx.db.get(email.investigationId);
      if (investigation) {
        titles.set(email.investigationId, {
          title: investigation.title,
          status: investigation.status,
        });
      }
    }

    return emails.map((email) => ({
      ...email,
      // Full bodies belong on the case page, not the list.
      body: email.body.slice(0, 400),
      investigation: email.investigationId ? titles.get(email.investigationId) : undefined,
    }));
  },
});

export const getByDedupeKey = internalQuery({
  args: { dedupeKey: v.string() },
  handler: async (ctx, args): Promise<Doc<'emails'> | null> =>
    ctx.db
      .query('emails')
      .withIndex('by_dedupeKey', (q) => q.eq('dedupeKey', args.dedupeKey))
      .first(),
});

export const getInternal = internalQuery({
  args: { id: v.id('emails') },
  handler: async (ctx, args): Promise<Doc<'emails'> | null> => ctx.db.get(args.id),
});

/**
 * Accept one inbound message.
 *
 * Returns what the caller should do next so the HTTP handler stays dumb:
 * `duplicate` means the webhook was a retry and nothing should be scheduled.
 */
export const ingestInbound = internalMutation({
  args: {
    inboxId: v.string(),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    fromEmail: v.string(),
    toEmail: v.string(),
    subject: v.string(),
    body: v.string(),
    receivedAt: v.optional(v.number()),
  },
  returns: v.object({
    emailId: v.id('emails'),
    investigationId: v.optional(v.id('investigations')),
    outcome: v.union(
      v.literal('duplicate'),
      v.literal('new_investigation'),
      v.literal('reply')
    ),
  }),
  handler: async (ctx, args) => {
    const receivedAt = args.receivedAt ?? Date.now();
    const dedupeKey = inboundKey({
      messageId: args.messageId,
      inboxId: args.inboxId,
      fromEmail: args.fromEmail,
      subject: args.subject,
      receivedAt,
    });

    // --- idempotency gate -------------------------------------------------
    const existing = await ctx.db
      .query('emails')
      .withIndex('by_dedupeKey', (q) => q.eq('dedupeKey', dedupeKey))
      .first();
    if (existing) {
      return {
        emailId: existing._id,
        investigationId: existing.investigationId,
        outcome: 'duplicate' as const,
      };
    }

    const sanitized = sanitizeExternal(args.body, MAX_BODY_CHARS);
    const fromEmail = normalizeEmail(args.fromEmail);

    const emailId = await ctx.db.insert('emails', {
      dedupeKey,
      messageId: args.messageId,
      threadId: args.threadId,
      inboxId: args.inboxId,
      direction: 'inbound',
      fromEmail,
      toEmail: normalizeEmail(args.toEmail),
      subject: args.subject.slice(0, 300),
      body: sanitized.text,
      threatFlags: sanitized.flags,
      receivedAt,
    });

    if (sanitized.flags.length) {
      await logEvent(ctx, {
        type: 'INJECTION_ATTEMPT_NEUTRALISED',
        summary: `Inbound mail from ${fromEmail} contained instruction-like text`,
        detail: { flags: sanitized.flags },
      });
    }

    // --- is this a reply on a case we already own? ------------------------
    const existingCaseId = args.threadId
      ? await findInvestigationByThread(ctx, args.threadId)
      : null;

    if (existingCaseId) {
      await ctx.db.patch(emailId, { investigationId: existingCaseId });
      await logEvent(ctx, {
        investigationId: existingCaseId,
        type: 'REPLY_RECEIVED',
        summary: `Reply from ${fromEmail}`,
      });
      return { emailId, investigationId: existingCaseId, outcome: 'reply' as const };
    }

    // --- otherwise open a new investigation -------------------------------
    const forwarded = parseForwarded(args.subject, sanitized.text);
    const merchantDomain = inferMerchantDomain({
      fromEmail,
      forwardedFrom: forwarded.originalFrom,
      bodyUrls: extractUrls(sanitized.text),
    });

    const title =
      forwarded.originalSubject?.slice(0, 160) ||
      stripForwardPrefixes(args.subject).slice(0, 160) ||
      'Untitled investigation';

    const investigationId: Id<'investigations'> = await ctx.runMutation(
      internal.investigations.create,
      {
        ownerKey: SINGLE_OWNER_KEY,
        title,
        sourceEmailId: emailId,
        merchantDomain,
        merchantName: merchantDomain ? merchantDomain.split('.')[0] : undefined,
      }
    );

    await logEvent(ctx, {
      investigationId,
      type: 'EMAIL_RECEIVED',
      summary: `Forwarded by ${fromEmail}: ${title}`,
      detail: {
        merchantDomain,
        forwardedFrom: forwarded.originalFrom,
        replyable: forwarded.originalFrom ? isReplyableAddress(forwarded.originalFrom) : false,
      },
    });

    return { emailId, investigationId, outcome: 'new_investigation' as const };
  },
});

export const markProcessed = internalMutation({
  args: { id: v.id('emails') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { processedAt: Date.now() });
    return null;
  },
});

/** Record an email Sherlock actually sent. Only called after a real send. */
export const recordOutbound = internalMutation({
  args: {
    investigationId: v.id('investigations'),
    inboxId: v.string(),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    toEmail: v.string(),
    fromEmail: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  returns: v.id('emails'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('emails', {
      dedupeKey: `out:${args.messageId ?? `${args.investigationId}:${Date.now()}`}`,
      messageId: args.messageId,
      threadId: args.threadId,
      inboxId: args.inboxId,
      direction: 'outbound',
      fromEmail: normalizeEmail(args.fromEmail),
      toEmail: normalizeEmail(args.toEmail),
      subject: args.subject.slice(0, 300),
      body: args.body.slice(0, MAX_BODY_CHARS),
      threatFlags: [],
      investigationId: args.investigationId,
      processedAt: Date.now(),
      receivedAt: Date.now(),
    });
  },
});

/** Newest inbound text on a case, with quoted history removed. */
export const latestReplyText = internalQuery({
  args: { investigationId: v.id('investigations') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query('emails')
      .withIndex('by_investigation', (q) => q.eq('investigationId', args.investigationId))
      .order('desc')
      .take(10);
    const inbound = emails.find((email) => email.direction === 'inbound' && email.processedAt);
    const newest = inbound ?? emails.find((email) => email.direction === 'inbound');
    return newest ? stripQuotedReply(newest.body) : null;
  },
});

/**
 * A thread belongs to a case if Sherlock sent a claim on it. This is what
 * makes a merchant's reply land on the right investigation instead of
 * opening a duplicate.
 */
async function findInvestigationByThread(
  ctx: MutationCtx,
  threadId: string
): Promise<Id<'investigations'> | null> {
  const claim = await ctx.db
    .query('claims')
    .withIndex('by_thread', (q) => q.eq('threadId', threadId))
    .first();
  if (claim) return claim.investigationId;

  const priorEmail = await ctx.db
    .query('emails')
    .withIndex('by_thread', (q) => q.eq('threadId', threadId))
    .filter((q) => q.neq(q.field('investigationId'), undefined))
    .first();
  return priorEmail?.investigationId ?? null;
}
