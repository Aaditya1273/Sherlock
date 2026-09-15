import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { assertTransition, type InvestigationState } from './core/states';
import { redactSecrets } from './core/untrusted';

/**
 * Shared write helpers.
 *
 * Status changes and the event timeline always move together — a transition
 * that is not recorded is a transition that cannot be debugged or audited.
 */

export async function logEvent(
  ctx: MutationCtx,
  args: {
    investigationId?: Id<'investigations'>;
    type: string;
    summary: string;
    detail?: unknown;
    fromStatus?: InvestigationState;
    toStatus?: InvestigationState;
  }
): Promise<void> {
  let detail: string | undefined;
  if (args.detail !== undefined) {
    const serialized = typeof args.detail === 'string' ? args.detail : JSON.stringify(args.detail);
    detail = redactSecrets(serialized).slice(0, 2_000);
  }

  await ctx.db.insert('events', {
    investigationId: args.investigationId,
    type: args.type,
    summary: args.summary.slice(0, 300),
    detail,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    createdAt: Date.now(),
  });
}

/**
 * The only way an investigation's status changes.
 *
 * Validates the transition against the state machine, patches any extra
 * fields in the same write, and records the move on the timeline.
 */
export async function setStatus(
  ctx: MutationCtx,
  investigation: Doc<'investigations'>,
  to: InvestigationState,
  options?: {
    summary?: string;
    detail?: unknown;
    patch?: Partial<Doc<'investigations'>>;
    eventType?: string;
  }
): Promise<void> {
  const from = investigation.status;
  assertTransition(from, to);

  const patch: Record<string, unknown> = {
    ...(options?.patch ?? {}),
    status: to,
    updatedAt: Date.now(),
  };
  if (to === 'RESOLVED') patch.resolvedAt = Date.now();
  // Leaving FAILED clears the stale explanation.
  if (from === 'FAILED' && to !== 'FAILED' && patch.failureReason === undefined) {
    patch.failureReason = undefined;
  }

  await ctx.db.patch(investigation._id, patch);

  if (from !== to) {
    await logEvent(ctx, {
      investigationId: investigation._id,
      type: options?.eventType ?? 'STATUS_CHANGED',
      summary: options?.summary ?? `${from} → ${to}`,
      detail: options?.detail,
      fromStatus: from,
      toStatus: to,
    });
  }
}

/** Load an investigation, enforcing that it belongs to the caller. */
export async function getOwnedInvestigation(
  ctx: MutationCtx,
  id: Id<'investigations'>,
  ownerKey: string
): Promise<Doc<'investigations'>> {
  const investigation = await ctx.db.get(id);
  if (!investigation) throw new Error('Investigation not found.');
  if (investigation.ownerKey !== ownerKey) throw new Error('Investigation not found.');
  return investigation;
}

/** Stable digest used to detect that a monitored page actually changed. */
export function contentHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}
