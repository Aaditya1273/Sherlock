import { action, query, mutation, internalAction, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { requireOwner, requireConfiguredForOutbound } from './auth';

/**
 * AgentMail — Sherlock's inbox.
 *
 * The inbox is the product surface, not a notification channel: the user
 * forwards mail to a Sherlock address, Sherlock replies to merchants from it,
 * and merchant replies come back to the same threads. This module owns the
 * AgentMail REST calls and the inbox records; routing and threading live in
 * emails.ts and claims.ts.
 */

const AGENTMAIL_API = 'https://api.agentmail.to/v0';

export class AgentMailUnavailable extends Error {}

function apiKey(): string {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) {
    throw new AgentMailUnavailable(
      'AGENTMAIL_API_KEY is not configured. Set it in the Convex dashboard to enable the inbox.'
    );
  }
  return key;
}

async function agentMailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${AGENTMAIL_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new AgentMailUnavailable(`Could not reach AgentMail: ${(error as Error).message}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new AgentMailUnavailable(`AgentMail returned ${response.status}: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

// ------------------------------------------------------------------ queries

export const listInboxes = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.token);
    return await ctx.db.query('inboxes').take(20);
  },
});

export const defaultInbox = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.token);
    return await ctx.db
      .query('inboxes')
      .withIndex('by_default', (q) => q.eq('isDefault', true))
      .first();
  },
});

export const getDefaultInboxInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<'inboxes'> | null> =>
    ctx.db
      .query('inboxes')
      .withIndex('by_default', (q) => q.eq('isDefault', true))
      .first(),
});

/** Which integrations are actually configured. Drives the Settings page. */
export const integrationStatus = query({
  args: { token: v.optional(v.string()) },
  returns: v.object({
    agentMail: v.boolean(),
    firecrawl: v.boolean(),
    openai: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.token);
    return {
      agentMail: !!process.env.AGENTMAIL_API_KEY,
      firecrawl: !!process.env.FIRECRAWL_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    };
  },
});

// ---------------------------------------------------------------- mutations

export const saveInbox = internalMutation({
  args: {
    inboxId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    makeDefault: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('inboxes')
      .withIndex('by_inboxId', (q) => q.eq('inboxId', args.inboxId))
      .first();

    const shouldDefault = args.makeDefault || (await ctx.db.query('inboxes').first()) === null;

    if (shouldDefault) {
      const current = await ctx.db
        .query('inboxes')
        .withIndex('by_default', (q) => q.eq('isDefault', true))
        .first();
      if (current && current.inboxId !== args.inboxId) {
        await ctx.db.patch(current._id, { isDefault: false });
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        displayName: args.displayName,
        isDefault: shouldDefault ? true : existing.isDefault,
      });
      return null;
    }

    await ctx.db.insert('inboxes', {
      inboxId: args.inboxId,
      email: args.email,
      displayName: args.displayName,
      isDefault: shouldDefault,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const setDefaultInbox = mutation({
  args: { token: v.optional(v.string()), id: v.id('inboxes') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.token);
    const current = await ctx.db
      .query('inboxes')
      .withIndex('by_default', (q) => q.eq('isDefault', true))
      .first();
    if (current) await ctx.db.patch(current._id, { isDefault: false });
    await ctx.db.patch(args.id, { isDefault: true });
    return null;
  },
});

// ------------------------------------------------------------------ actions

/** Create the inbox the user forwards mail to. */
export const createInbox = action({
  args: {
    token: v.optional(v.string()),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  returns: v.object({ inboxId: v.string(), email: v.string() }),
  handler: async (ctx, args): Promise<{ inboxId: string; email: string }> => {
    await ctx.runQuery(internal.agentMail.assertOwner, { token: args.token });

    const data = await agentMailFetch<{ inbox_id?: string; id?: string; email?: string; address?: string }>(
      '/inboxes',
      {
        method: 'POST',
        body: JSON.stringify({
          username: args.username,
          display_name: args.displayName ?? 'Sherlock',
        }),
      }
    );

    const inboxId = data.inbox_id ?? data.id ?? data.email ?? data.address;
    const email = data.email ?? data.address ?? inboxId;
    if (!inboxId || !email) {
      throw new AgentMailUnavailable('AgentMail did not return an inbox address.');
    }

    await ctx.runMutation(internal.agentMail.saveInbox, {
      inboxId,
      email,
      displayName: args.displayName ?? 'Sherlock',
      makeDefault: true,
    });
    return { inboxId, email };
  },
});

/** Pull existing inboxes from AgentMail into Sherlock. */
export const syncInboxes = action({
  args: { token: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    await ctx.runQuery(internal.agentMail.assertOwner, { token: args.token });

    const data = await agentMailFetch<{
      inboxes?: { inbox_id?: string; id?: string; email?: string; address?: string; display_name?: string }[];
      data?: { inbox_id?: string; id?: string; email?: string; address?: string; display_name?: string }[];
    }>('/inboxes');

    const inboxes = data.inboxes ?? data.data ?? [];
    let saved = 0;
    for (const inbox of inboxes) {
      const inboxId = inbox.inbox_id ?? inbox.id ?? inbox.email ?? inbox.address;
      const email = inbox.email ?? inbox.address ?? inboxId;
      if (!inboxId || !email) continue;
      await ctx.runMutation(internal.agentMail.saveInbox, {
        inboxId,
        email,
        displayName: inbox.display_name,
        makeDefault: false,
      });
      saved++;
    }
    return saved;
  },
});

export interface SendResult {
  messageId?: string;
  threadId?: string;
}

/**
 * Send a message from a Sherlock inbox.
 *
 * Internal only. Nothing user-facing calls this — the only caller is the
 * claim send path, which runs after an explicit human approval. Refuses to
 * run on an unconfigured deployment so a dev instance cannot mail a stranger.
 */
export const send = internalAction({
  args: {
    inboxId: v.string(),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    threadId: v.optional(v.string()),
    replyToMessageId: v.optional(v.string()),
  },
  returns: v.object({ messageId: v.optional(v.string()), threadId: v.optional(v.string()) }),
  handler: async (_ctx, args): Promise<SendResult> => {
    requireConfiguredForOutbound();

    // A reply stays in-thread; a new claim starts one.
    const path = args.replyToMessageId
      ? `/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.replyToMessageId)}/reply`
      : `/inboxes/${encodeURIComponent(args.inboxId)}/messages/send`;

    const data = await agentMailFetch<{
      message_id?: string;
      id?: string;
      thread_id?: string;
      threadId?: string;
    }>(path, {
      method: 'POST',
      body: JSON.stringify({
        to: [args.to],
        subject: args.subject,
        text: args.body,
      }),
    });

    return {
      messageId: data.message_id ?? data.id,
      threadId: data.thread_id ?? data.threadId ?? args.threadId,
    };
  },
});

/** Auth check usable from an action context. */
export const assertOwner = internalQuery({
  args: { token: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => requireOwner(ctx, args.token),
});
