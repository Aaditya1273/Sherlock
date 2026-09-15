/**
 * Sherlock investigation lifecycle.
 *
 * Pure and dependency-free so it can be unit tested without a Convex runtime.
 * This module is the single source of truth for what an investigation may do
 * next — nothing else in the codebase patches `status` directly.
 */

export const INVESTIGATION_STATES = [
  'RECEIVED',
  'PARSING',
  'INVESTIGATING',
  'EVIDENCE_FOUND',
  'REASONING',
  'CLAIM_READY',
  'AWAITING_APPROVAL',
  'SENT',
  'WAITING_FOR_REPLY',
  'REPLY_RECEIVED',
  'FOLLOW_UP_READY',
  'RESOLVED',
  'PAUSED',
  'FAILED',
] as const;

export type InvestigationState = (typeof INVESTIGATION_STATES)[number];

/** Legal transitions. Anything not listed here is rejected. */
const TRANSITIONS: Record<InvestigationState, readonly InvestigationState[]> = {
  RECEIVED: ['PARSING', 'FAILED', 'PAUSED'],
  PARSING: ['INVESTIGATING', 'FAILED', 'PAUSED'],
  INVESTIGATING: ['EVIDENCE_FOUND', 'REASONING', 'FAILED', 'PAUSED'],
  EVIDENCE_FOUND: ['REASONING', 'FAILED', 'PAUSED'],
  // Reasoning may conclude there is nothing worth claiming -> RESOLVED.
  REASONING: ['CLAIM_READY', 'RESOLVED', 'FAILED', 'PAUSED'],
  CLAIM_READY: ['AWAITING_APPROVAL', 'PAUSED', 'FAILED'],
  AWAITING_APPROVAL: ['SENT', 'PAUSED', 'FAILED'],
  SENT: ['WAITING_FOR_REPLY', 'FAILED'],
  WAITING_FOR_REPLY: ['REPLY_RECEIVED', 'RESOLVED', 'PAUSED', 'FAILED'],
  REPLY_RECEIVED: ['FOLLOW_UP_READY', 'RESOLVED', 'PAUSED', 'FAILED'],
  FOLLOW_UP_READY: ['AWAITING_APPROVAL', 'RESOLVED', 'PAUSED', 'FAILED'],
  RESOLVED: [],
  // A paused case may resume at any pre-send stage, or be retired.
  PAUSED: ['INVESTIGATING', 'REASONING', 'CLAIM_READY', 'AWAITING_APPROVAL', 'RESOLVED'],
  FAILED: ['PARSING', 'INVESTIGATING', 'REASONING', 'PAUSED', 'RESOLVED'],
};

export function canTransition(from: InvestigationState, to: InvestigationState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: InvestigationState, to: InvestigationState): void {
  if (from === to) return; // idempotent re-entry is a no-op, not an error
  if (!canTransition(from, to)) {
    throw new Error(`Illegal investigation transition: ${from} -> ${to}`);
  }
}

/** States where Sherlock is working, or waiting on the outside world. */
export const ACTIVE_STATES: readonly InvestigationState[] = [
  'RECEIVED',
  'PARSING',
  'INVESTIGATING',
  'EVIDENCE_FOUND',
  'REASONING',
  'CLAIM_READY',
  'AWAITING_APPROVAL',
  'SENT',
  'WAITING_FOR_REPLY',
  'REPLY_RECEIVED',
  'FOLLOW_UP_READY',
];

export function isActive(state: InvestigationState): boolean {
  return ACTIVE_STATES.includes(state);
}

/** States where the user is the blocker, not Sherlock. */
export function needsAttention(state: InvestigationState): boolean {
  return state === 'AWAITING_APPROVAL' || state === 'FOLLOW_UP_READY';
}

/** Human-facing copy, kept beside the states so the two cannot drift apart. */
export const STATE_LABEL: Record<InvestigationState, string> = {
  RECEIVED: 'Received',
  PARSING: 'Reading the email',
  INVESTIGATING: 'Investigating the web',
  EVIDENCE_FOUND: 'Evidence found',
  REASONING: 'Weighing the evidence',
  CLAIM_READY: 'Claim drafted',
  AWAITING_APPROVAL: 'Waiting for your approval',
  SENT: 'Sent',
  WAITING_FOR_REPLY: 'Waiting for a reply',
  REPLY_RECEIVED: 'Reply received',
  FOLLOW_UP_READY: 'Follow-up ready',
  RESOLVED: 'Resolved',
  PAUSED: 'Paused',
  FAILED: 'Needs attention',
};

/** Ordered pipeline used to render progress. PAUSED/FAILED sit outside it. */
export const PIPELINE: readonly InvestigationState[] = [
  'RECEIVED',
  'PARSING',
  'INVESTIGATING',
  'EVIDENCE_FOUND',
  'REASONING',
  'CLAIM_READY',
  'AWAITING_APPROVAL',
  'SENT',
  'WAITING_FOR_REPLY',
  'RESOLVED',
];
