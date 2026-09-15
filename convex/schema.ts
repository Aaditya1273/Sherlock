import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { INVESTIGATION_STATES } from './core/states';

/**
 * Sherlock data model.
 *
 * Everything hangs off one durable object: the Investigation. Emails,
 * evidence, claims, threads, scheduled checks and events all reference it, so
 * a case has exactly one source of truth and one timeline.
 */

export const investigationStatus = v.union(
  ...INVESTIGATION_STATES.map((s) => v.literal(s))
);

export const claimStatus = v.union(
  v.literal('draft'),
  v.literal('awaiting_approval'),
  v.literal('approved'),
  v.literal('sent'),
  v.literal('rejected'),
  v.literal('answered'),
  v.literal('succeeded'),
  v.literal('declined')
);

export const evidenceKind = v.union(
  v.literal('policy'),
  v.literal('price'),
  v.literal('terms'),
  v.literal('contact'),
  v.literal('receipt'),
  v.literal('reply'),
  v.literal('other')
);

export default defineSchema({
  // ---------------------------------------------------------------- identity
  /**
   * Sherlock is operated behind a single owner session today (see auth.ts).
   * Investigations still carry an ownerKey so multi-user is a data change,
   * not a rewrite.
   */
  sessions: defineTable({
    tokenHash: v.string(),
    ownerKey: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_expiresAt', ['expiresAt']),

  // ------------------------------------------------------------------- inbox
  /** AgentMail inboxes Sherlock owns. One is the default forwarding target. */
  inboxes: defineTable({
    inboxId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    isDefault: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_inboxId', ['inboxId'])
    .index('by_default', ['isDefault']),

  /**
   * Every email Sherlock has seen, inbound or outbound.
   * `dedupeKey` is unique per inbound message and is what makes webhook
   * delivery idempotent under AgentMail retries.
   */
  emails: defineTable({
    dedupeKey: v.string(),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    inboxId: v.string(),
    direction: v.union(v.literal('inbound'), v.literal('outbound')),
    fromEmail: v.string(),
    toEmail: v.string(),
    subject: v.string(),
    /** Sanitized plain text. Never raw external content. */
    body: v.string(),
    /** Injection patterns detected in the original body, if any. */
    threatFlags: v.array(v.string()),
    investigationId: v.optional(v.id('investigations')),
    /** Set once the ingestion pipeline has consumed this message. */
    processedAt: v.optional(v.number()),
    receivedAt: v.number(),
  })
    .index('by_dedupeKey', ['dedupeKey'])
    .index('by_investigation', ['investigationId', 'receivedAt'])
    .index('by_thread', ['threadId'])
    .index('by_messageId', ['messageId'])
    .index('by_receivedAt', ['receivedAt'])
    .index('by_direction_receivedAt', ['direction', 'receivedAt']),

  // ----------------------------------------------------------- investigation
  investigations: defineTable({
    ownerKey: v.string(),
    status: investigationStatus,

    /** Short human title, e.g. "Sony WH-1000XM5 — Amazon". */
    title: v.string(),
    sourceEmailId: v.optional(v.id('emails')),

    // Merchant / counterparty
    merchantName: v.optional(v.string()),
    merchantDomain: v.optional(v.string()),
    /** Address the claim will be sent to once approved. */
    contactEmail: v.optional(v.string()),

    // Transaction facts extracted from the email
    productName: v.optional(v.string()),
    orderId: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    purchasedAt: v.optional(v.number()),

    // Outcome accounting. Kept as distinct fields so the UI can never
    // present a hypothetical as money in the bank.
    potentialAmount: v.optional(v.number()),
    recoveredAmount: v.optional(v.number()),

    /** Model's own summary of why this case does or does not have legs. */
    assessment: v.optional(v.string()),
    confidence: v.optional(v.number()),

    /** User-facing explanation when status is FAILED. */
    failureReason: v.optional(v.string()),

    /** Set while a pipeline action holds the case, to avoid double-runs. */
    lockedUntil: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_owner_updatedAt', ['ownerKey', 'updatedAt'])
    .index('by_owner_status', ['ownerKey', 'status'])
    .index('by_status', ['status'])
    .index('by_merchantDomain', ['merchantDomain']),

  /** Append-only case timeline. Powers the detail view, feed and audit trail. */
  events: defineTable({
    investigationId: v.optional(v.id('investigations')),
    type: v.string(),
    summary: v.string(),
    /** Small JSON blob; never raw external content. */
    detail: v.optional(v.string()),
    fromStatus: v.optional(investigationStatus),
    toStatus: v.optional(investigationStatus),
    createdAt: v.number(),
  })
    .index('by_investigation', ['investigationId', 'createdAt'])
    .index('by_createdAt', ['createdAt']),

  // -------------------------------------------------------------- web layer
  /**
   * Firecrawl results, cached by URL. Doubles as Sherlock's browser history:
   * a monitored page is re-fetched here and compared against `contentHash`.
   */
  webSources: defineTable({
    url: v.string(),
    domain: v.string(),
    title: v.optional(v.string()),
    /** Markdown returned by Firecrawl, sanitized and length-capped. */
    content: v.string(),
    contentHash: v.string(),
    fetchedAt: v.number(),
    /** Set when a fetch failed, so we do not hammer a dead URL. */
    error: v.optional(v.string()),
  })
    .index('by_url', ['url'])
    .index('by_domain', ['domain'])
    .index('by_fetchedAt', ['fetchedAt']),

  /**
   * A fact Sherlock extracted from a source, tied to the investigation it
   * supports. Every claim sentence must be traceable to one of these rows.
   */
  evidence: defineTable({
    investigationId: v.id('investigations'),
    kind: evidenceKind,
    /** The extracted fact, in Sherlock's own words. */
    fact: v.string(),
    /** Why this fact matters to this case. */
    relevance: v.string(),
    /** Verbatim supporting passage from the source. */
    excerpt: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    confidence: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_investigation', ['investigationId', 'createdAt'])
    .index('by_investigation_kind', ['investigationId', 'kind']),

  // ------------------------------------------------------------------ claims
  claims: defineTable({
    investigationId: v.id('investigations'),
    status: claimStatus,
    /** e.g. "price_adjustment", "refund", "cancellation_compensation". */
    claimType: v.string(),
    toEmail: v.string(),
    subject: v.string(),
    body: v.string(),
    /** Plain-language case for the claim, shown above the draft. */
    reasoning: v.string(),
    evidenceIds: v.array(v.id('evidence')),
    potentialAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    /** True when this claim chases an earlier one. */
    isFollowUp: v.boolean(),

    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    rejectionNote: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    /** AgentMail ids, set only after the send actually succeeded. */
    sentMessageId: v.optional(v.string()),
    threadId: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_investigation', ['investigationId', 'createdAt'])
    .index('by_status', ['status'])
    .index('by_thread', ['threadId']),

  // ------------------------------------------------------- alive monitoring
  /**
   * Scheduled re-checks. Bounded by `remainingRuns` so a monitor can never
   * run forever, and carries `lastContentHash` so it only acts on real change.
   */
  monitors: defineTable({
    investigationId: v.id('investigations'),
    kind: v.union(v.literal('price'), v.literal('policy'), v.literal('claim_followup')),
    url: v.optional(v.string()),
    intervalMs: v.number(),
    nextRunAt: v.number(),
    remainingRuns: v.number(),
    lastRunAt: v.optional(v.number()),
    lastContentHash: v.optional(v.string()),
    lastResult: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_active_nextRunAt', ['active', 'nextRunAt'])
    .index('by_investigation', ['investigationId']),

  // -------------------------------------------------------------------- chat
  /** "Talk to Sherlock" — grounded in investigation state, not a free chatbot. */
  chatMessages: defineTable({
    ownerKey: v.string(),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    /** Investigations the answer was drawn from, for citation in the UI. */
    citedInvestigationIds: v.optional(v.array(v.id('investigations'))),
    createdAt: v.number(),
  }).index('by_owner_createdAt', ['ownerKey', 'createdAt']),

  // ------------------------------------------------------------------ config
  settings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
});
