import { query, mutation, action, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireOwner } from './auth';
import { getOwnedInvestigation, logEvent, setStatus } from './helpers';

/**
 * Claims and the approval boundary.
 *
 * This is the one place in Sherlock where the product touches someone else's
 * inbox, so the rule is enforced structurally rather than by prompt: a claim
 * is drafted by the model, but only `approveAndSend` can dispatch it, it is
 * an authenticated user action, and the investigation must be sitting in
 * AWAITING_APPROVAL for it to run.
 *
 * A send is also never optimistic — `sentAt` and the SENT transition are
 * written after AgentMail confirms, so a failed send leaves a case the user
 * can retry rather than a case that lies about having been sent.
 */

/** Ceiling on outbound mail, so a bug cannot turn into a mailing campaign. */
const MAX_SENDS_PER_DAY = 25;

export const listPending = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const claims = await ctx.db
      .query('claims')
      .withIndex('by_status', (q) => q.eq('status', 'awaiting_approval'))
      .order('desc')
      .take(50);

    const enriched = [];
    for (const claim of claims) {
      const investigation = await ctx.db.get(claim.investigationId);
      if (!investigation || investigation.ownerKey !== ownerKey) continue;
      enriched.push({ claim, investigation });
    }
    return enriched;
  },
});

export const listAll = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const claims = await ctx.db.query('claims').order('desc').take(100);

    const enriched = [];
    for (const claim of claims) {
      const investigation = await ctx.db.get(claim.investigationId);
      if (!investigation || investigation.ownerKey !== ownerKey) continue;
      enriched.push({ claim, investigation });
    }
    return enriched;
  },
});

/** Edit a draft before approving it. The user has the last word on wording. */
export const editDraft = mutation({
  args: {
    token: v.optional(v.string()),
    claimId: v.id('claims'),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    toEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const claim = await ctx.db.get(args.claimId);
    if (!claim) throw new Error('Claim not found.');
    await getOwnedInvestigation(ctx, claim.investigationId, ownerKey);

    if (claim.status === 'sent' || claim.status === 'succeeded') {
      throw new Error('That claim has already been sent.');
    }
    if (args.toEmail !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.toEmail)) {
      throw new Error('That is not a valid email address.');
    }

    await ctx.db.patch(args.claimId, {
      subject: args.subject?.slice(0, 200) ?? claim.subject,
      body: args.body?.slice(0, 8_000) ?? claim.body,
      toEmail: args.toEmail ?? claim.toEmail,
      updatedAt: Date.now(),
    });
    await logEvent(ctx, {
      investigationId: claim.investigationId,
      type: 'CLAIM_EDITED',
      summary: 'You edited the draft',
    });
    return null;
  },
});

export const reject = mutation({
  args: { token: v.optional(v.string()), claimId: v.id('claims'), note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const claim = await ctx.db.get(args.claimId);
    if (!claim) throw new Error('Claim not found.');
    const investigation = await getOwnedInvestigation(ctx, claim.investigationId, ownerKey);

    await ctx.db.patch(args.claimId, {
      status: 'rejected',
      rejectedAt: Date.now(),
      rejectionNote: args.note?.slice(0, 500),
      updatedAt: Date.now(),
    });
    await setStatus(ctx, investigation, 'PAUSED', {
      eventType: 'CLAIM_REJECTED',
      summary: args.note ? `Rejected: ${args.note.slice(0, 150)}` : 'You rejected this draft',
    });
    return null;
  },
});

/**
 * Approve a draft and send it.
 *
 * An action because it reaches AgentMail. The ordering matters: authorize,
 * re-read state, mark approved, send, and only then record the send.
 */
export const approveAndSend = action({
  args: { token: v.optional(v.string()), claimId: v.id('claims') },
  returns: v.object({ sent: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ sent: boolean; error?: string }> => {
    const prepared = await ctx.runMutation(internal.claims.markApproved, {
      token: args.token,
      claimId: args.claimId,
    });

    let result: { messageId?: string; threadId?: string };
    try {
      result = await ctx.runAction(internal.agentMail.send, {
        inboxId: prepared.inboxId,
        to: prepared.toEmail,
        subject: prepared.subject,
        body: prepared.body,
        threadId: prepared.threadId,
        replyToMessageId: prepared.replyToMessageId,
      });
    } catch (error) {
      // The send failed, so nothing is marked sent. The case returns to
      // AWAITING_APPROVAL and the user can try again.
      await ctx.runMutation(internal.claims.markSendFailed, {
        claimId: args.claimId,
        message: (error as Error).message,
      });
      return { sent: false, error: (error as Error).message };
    }

    await ctx.runMutation(internal.claims.markSent, {
      claimId: args.claimId,
      messageId: result.messageId,
      threadId: result.threadId,
      inboxId: prepared.inboxId,
      fromEmail: prepared.fromEmail,
    });
    return { sent: true };
  },
});

// ------------------------------------------------------------- internal API

export const createDraft = internalMutation({
  args: {
    investigationId: v.id('investigations'),
    claimType: v.string(),
    toEmail: v.string(),
    subject: v.string(),
    body: v.string(),
    reasoning: v.string(),
    evidenceIds: v.array(v.id('evidence')),
    potentialAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    isFollowUp: v.boolean(),
    threadId: v.optional(v.string()),
  },
  returns: v.id('claims'),
  handler: async (ctx, args) => {
    const now = Date.now();
    const claimId = await ctx.db.insert('claims', {
      investigationId: args.investigationId,
      status: 'awaiting_approval',
      claimType: args.claimType,
      toEmail: args.toEmail,
      subject: args.subject,
      body: args.body,
      reasoning: args.reasoning,
      evidenceIds: args.evidenceIds,
      potentialAmount: args.potentialAmount,
      currency: args.currency,
      isFollowUp: args.isFollowUp,
      threadId: args.threadId,
      createdAt: now,
      updatedAt: now,
    });

    await logEvent(ctx, {
      investigationId: args.investigationId,
      type: args.isFollowUp ? 'FOLLOW_UP_PREPARED' : 'CLAIM_PREPARED',
      summary: `Drafted a ${args.isFollowUp ? 'follow-up' : 'claim'} to ${args.toEmail}`,
      detail: { subject: args.subject, potentialAmount: args.potentialAmount },
    });
    return claimId;
  },
});

/**
 * Authorize the send and reserve it, inside one transaction.
 * Returns everything the action needs so it never re-reads mutable state.
 */
export const markApproved = internalMutation({
  args: { token: v.optional(v.string()), claimId: v.id('claims') },
  returns: v.object({
    inboxId: v.string(),
    fromEmail: v.string(),
    toEmail: v.string(),
    subject: v.string(),
    body: v.string(),
    threadId: v.optional(v.string()),
    replyToMessageId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const claim = await ctx.db.get(args.claimId);
    if (!claim) throw new Error('Claim not found.');
    const investigation = await getOwnedInvestigation(ctx, claim.investigationId, ownerKey);

    if (claim.status === 'sent' || claim.status === 'succeeded') {
      throw new Error('That claim has already been sent.');
    }
    if (claim.status !== 'awaiting_approval' && claim.status !== 'approved') {
      throw new Error(`This claim is ${claim.status} and cannot be sent.`);
    }
    // The state machine is the gate, not the button.
    if (investigation.status !== 'AWAITING_APPROVAL') {
      throw new Error(
        `This case is "${investigation.status}" and is not waiting for approval.`
      );
    }

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recentSends = await ctx.db
      .query('emails')
      .withIndex('by_direction_receivedAt', (q) =>
        q.eq('direction', 'outbound').gt('receivedAt', since)
      )
      .take(MAX_SENDS_PER_DAY + 1);
    if (recentSends.length >= MAX_SENDS_PER_DAY) {
      throw new Error(`Daily outbound limit reached (${MAX_SENDS_PER_DAY}). Try again tomorrow.`);
    }

    const inbox = await ctx.db
      .query('inboxes')
      .withIndex('by_default', (q) => q.eq('isDefault', true))
      .first();
    if (!inbox) {
      throw new Error('No Sherlock inbox is set up yet. Create one in Settings first.');
    }

    // If this is a follow-up we reply into the thread the original started.
    let replyToMessageId: string | undefined;
    if (claim.threadId) {
      const priorSend = await ctx.db
        .query('emails')
        .withIndex('by_thread', (q) => q.eq('threadId', claim.threadId))
        .filter((q) => q.eq(q.field('direction'), 'inbound'))
        .order('desc')
        .first();
      replyToMessageId = priorSend?.messageId;
    }

    await ctx.db.patch(args.claimId, {
      status: 'approved',
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logEvent(ctx, {
      investigationId: claim.investigationId,
      type: 'CLAIM_APPROVED',
      summary: `You approved the claim to ${claim.toEmail}`,
    });

    return {
      inboxId: inbox.inboxId,
      fromEmail: inbox.email,
      toEmail: claim.toEmail,
      subject: claim.subject,
      body: claim.body,
      threadId: claim.threadId,
      replyToMessageId,
    };
  },
});

export const markSent = internalMutation({
  args: {
    claimId: v.id('claims'),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    inboxId: v.string(),
    fromEmail: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return null;
    const investigation = await ctx.db.get(claim.investigationId);
    if (!investigation) return null;

    await ctx.db.patch(args.claimId, {
      status: 'sent',
      sentAt: Date.now(),
      sentMessageId: args.messageId,
      threadId: args.threadId ?? claim.threadId,
      updatedAt: Date.now(),
    });

    await ctx.runMutation(internal.emails.recordOutbound, {
      investigationId: claim.investigationId,
      inboxId: args.inboxId,
      messageId: args.messageId,
      threadId: args.threadId ?? claim.threadId,
      toEmail: claim.toEmail,
      fromEmail: args.fromEmail,
      subject: claim.subject,
      body: claim.body,
    });

    await setStatus(ctx, investigation, 'SENT', {
      eventType: 'CLAIM_SENT',
      summary: `Sent to ${claim.toEmail}`,
      detail: { messageId: args.messageId, threadId: args.threadId },
    });

    // Now wait for a human on the other end.
    const sent = await ctx.db.get(claim.investigationId);
    if (sent) {
      await setStatus(ctx, sent, 'WAITING_FOR_REPLY', {
        summary: 'Waiting for a reply',
      });
    }

    // Chase it if nobody answers.
    await ctx.db.insert('monitors', {
      investigationId: claim.investigationId,
      kind: 'claim_followup',
      intervalMs: 5 * 24 * 60 * 60 * 1000,
      nextRunAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
      remainingRuns: 2,
      active: true,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const markSendFailed = internalMutation({
  args: { claimId: v.id('claims'), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return null;
    // Back to awaiting_approval: the draft is intact and the user can retry.
    await ctx.db.patch(args.claimId, {
      status: 'awaiting_approval',
      approvedAt: undefined,
      updatedAt: Date.now(),
    });
    await logEvent(ctx, {
      investigationId: claim.investigationId,
      type: 'CLAIM_SEND_FAILED',
      summary: 'The send failed; nothing was delivered',
      detail: { message: args.message.slice(0, 300) },
    });
    return null;
  },
});

export const latestForInvestigation = internalQuery({
  args: { investigationId: v.id('investigations') },
  handler: async (ctx, args): Promise<Doc<'claims'> | null> =>
    ctx.db
      .query('claims')
      .withIndex('by_investigation', (q) => q.eq('investigationId', args.investigationId))
      .order('desc')
      .first(),
});

export const setOutcome = internalMutation({
  args: {
    claimId: v.id('claims'),
    status: v.union(v.literal('answered'), v.literal('succeeded'), v.literal('declined')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.claimId, { status: args.status, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Manual contact override. Research cannot always find a support address,
 * and the user usually can — this unblocks a case without a code change.
 */
export const setContactEmail = mutation({
  args: {
    token: v.optional(v.string()),
    investigationId: v.id('investigations'),
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const investigation = await getOwnedInvestigation(ctx, args.investigationId, ownerKey);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email)) {
      throw new Error('That is not a valid email address.');
    }
    await ctx.db.patch(investigation._id, {
      contactEmail: args.email.toLowerCase(),
      updatedAt: Date.now(),
    });
    await logEvent(ctx, {
      investigationId: args.investigationId,
      type: 'CONTACT_SET',
      summary: `You set the contact address to ${args.email}`,
    });
    return null;
  },
});

export type ClaimId = Id<'claims'>;
