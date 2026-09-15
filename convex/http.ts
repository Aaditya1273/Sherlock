import { httpRouter } from 'convex/server';
import { registerStaticRoutes } from '@convex-dev/self-static-hosting';
import { httpAction } from './_generated/server';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

/**
 * HTTP surface.
 *
 * Exactly two public endpoints: a health probe and the AgentMail inbound
 * webhook. Everything else Sherlock does is a Convex function behind
 * `requireOwner` — there is no general-purpose REST API to leave open.
 *
 * The webhook is the front door of the whole product, so it is treated as
 * hostile:
 *   - verified with a shared secret before the body is parsed,
 *   - deduplicated by message id (AgentMail retries on non-2xx),
 *   - always answered 200 once accepted, so a downstream failure produces a
 *     visible failed investigation instead of an infinite retry storm.
 */

const http = httpRouter();

http.route({
  path: '/api/health',
  method: 'GET',
  handler: httpAction(async () => {
    return Response.json({
      service: 'sherlock',
      status: 'ok',
      integrations: {
        agentmail: !!process.env.AGENTMAIL_API_KEY,
        firecrawl: !!process.env.FIRECRAWL_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
      },
      time: new Date().toISOString(),
    });
  }),
});

/**
 * Constant-time-ish secret comparison. Not cryptographically perfect in JS,
 * but it removes the trivial early-exit prefix oracle.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

interface InboundPayload {
  message?: Record<string, unknown>;
  data?: Record<string, unknown>;
  event?: string;
  type?: string;
  [key: string]: unknown;
}

/** AgentMail has shipped several payload shapes; read whichever is present. */
function readField(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return undefined;
}

http.route({
  path: '/api/agentmail/inbound',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    // ---- 1. authenticate the webhook before touching the body ------------
    const expected = process.env.AGENTMAIL_WEBHOOK_SECRET;
    if (!expected) {
      // Refuse rather than accept unauthenticated mail into the pipeline.
      return Response.json(
        { error: 'AGENTMAIL_WEBHOOK_SECRET is not configured on this deployment.' },
        { status: 503 }
      );
    }
    const provided =
      request.headers.get('x-agentmail-signature') ??
      request.headers.get('x-webhook-secret') ??
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      null;

    if (!secretMatches(provided, expected)) {
      return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
    }

    // ---- 2. parse ---------------------------------------------------------
    let payload: InboundPayload;
    try {
      payload = (await request.json()) as InboundPayload;
    } catch {
      return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
    }

    const message = (payload.message ?? payload.data ?? payload) as Record<string, unknown>;
    const eventType = payload.event ?? payload.type ?? 'message.received';
    if (typeof eventType === 'string' && !eventType.includes('received')) {
      // Delivery receipts and the like are acknowledged and dropped.
      return Response.json({ ok: true, ignored: eventType });
    }

    const fromEmail = readField(message, 'from', 'from_email', 'sender');
    const toEmail = readField(message, 'to', 'to_email', 'recipient');
    const inboxId = readField(message, 'inbox_id', 'inboxId') ?? toEmail;
    const subject = readField(message, 'subject') ?? '(no subject)';
    const body =
      readField(message, 'text', 'plain_text', 'body', 'html') ?? '';
    const messageId = readField(message, 'message_id', 'messageId', 'id');
    const threadId = readField(message, 'thread_id', 'threadId');

    if (!fromEmail || !inboxId) {
      return Response.json(
        { error: 'Payload is missing a sender or an inbox.' },
        { status: 400 }
      );
    }

    // ---- 3. ingest idempotently ------------------------------------------
    const result: {
      emailId: Id<'emails'>;
      investigationId?: Id<'investigations'>;
      outcome: 'duplicate' | 'new_investigation' | 'reply';
    } = await ctx.runMutation(internal.emails.ingestInbound, {
      inboxId,
      messageId,
      threadId,
      fromEmail,
      toEmail: toEmail ?? inboxId,
      subject,
      body,
    });

    // A retry of something we already have: acknowledge, change nothing.
    if (result.outcome === 'duplicate') {
      return Response.json({ ok: true, duplicate: true });
    }

    // ---- 4. hand off to the pipeline --------------------------------------
    if (result.outcome === 'new_investigation' && result.investigationId) {
      await ctx.scheduler.runAfter(0, internal.sherlock.pipeline.investigate, {
        investigationId: result.investigationId,
      });
    } else if (result.outcome === 'reply' && result.investigationId) {
      await ctx.runMutation(internal.emails.markProcessed, { id: result.emailId });
      await ctx.runMutation(internal.investigations.advance, {
        id: result.investigationId,
        to: 'REPLY_RECEIVED',
        summary: `Reply from ${fromEmail}`,
      });
      await ctx.scheduler.runAfter(0, internal.sherlock.replies.analyze, {
        investigationId: result.investigationId,
      });
    }

    return Response.json({ ok: true, outcome: result.outcome });
  }),
});

/**
 * The frontend, served from this same deployment.
 *
 * Registered last and deliberately: it is a catch-all, and Convex gives exact
 * routes precedence, so /api/health and /api/agentmail/inbound above keep
 * their paths while everything else falls through to the SPA.
 */
registerStaticRoutes(http, components.selfStaticHosting);

export default http;
