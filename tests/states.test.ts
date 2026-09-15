import { describe, expect, it } from 'vitest';
import {
  INVESTIGATION_STATES,
  PIPELINE,
  STATE_LABEL,
  assertTransition,
  canTransition,
  isActive,
  needsAttention,
  type InvestigationState,
} from '../convex/core/states';

/**
 * The state machine decides when a real email may be sent to a real company,
 * so its edges are tested rather than assumed.
 */

describe('investigation state machine', () => {
  it('walks the happy path from received to resolved', () => {
    const path: InvestigationState[] = [
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
      'RESOLVED',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('refuses to jump straight to SENT', () => {
    // The single most important edge: nothing reaches a merchant without
    // passing through AWAITING_APPROVAL first.
    for (const from of INVESTIGATION_STATES) {
      if (from === 'SENT') continue;
      if (from === 'AWAITING_APPROVAL') {
        expect(canTransition(from, 'SENT')).toBe(true);
      } else {
        expect(canTransition(from, 'SENT')).toBe(false);
      }
    }
  });

  it('treats RESOLVED as terminal', () => {
    for (const to of INVESTIGATION_STATES) {
      if (to === 'RESOLVED') continue;
      expect(canTransition('RESOLVED', to)).toBe(false);
    }
  });

  it('throws on an illegal transition and allows idempotent re-entry', () => {
    expect(() => assertTransition('RECEIVED', 'SENT')).toThrow(/Illegal/);
    expect(() => assertTransition('SENT', 'SENT')).not.toThrow();
    expect(() => assertTransition('RESOLVED', 'RESOLVED')).not.toThrow();
  });

  it('lets reasoning conclude there is no case', () => {
    expect(canTransition('REASONING', 'RESOLVED')).toBe(true);
  });

  it('flags only the states where the user is the blocker', () => {
    expect(needsAttention('AWAITING_APPROVAL')).toBe(true);
    expect(needsAttention('FOLLOW_UP_READY')).toBe(true);
    expect(needsAttention('INVESTIGATING')).toBe(false);
    expect(needsAttention('RESOLVED')).toBe(false);
  });

  it('does not count terminal states as active', () => {
    expect(isActive('RESOLVED')).toBe(false);
    expect(isActive('FAILED')).toBe(false);
    expect(isActive('PAUSED')).toBe(false);
    expect(isActive('INVESTIGATING')).toBe(true);
  });

  it('can resume or retire every non-terminal state', () => {
    // A case must never be strandable with no legal move left.
    for (const state of INVESTIGATION_STATES) {
      if (state === 'RESOLVED') continue;
      const hasExit = INVESTIGATION_STATES.some(
        (target) => target !== state && canTransition(state, target)
      );
      expect(hasExit, `${state} has no exit`).toBe(true);
    }
  });

  it('labels every state and keeps the pipeline a real subset', () => {
    for (const state of INVESTIGATION_STATES) {
      expect(STATE_LABEL[state]).toBeTruthy();
    }
    for (const step of PIPELINE) {
      expect(INVESTIGATION_STATES).toContain(step);
    }
  });
});
