import { STATE_LABEL, PIPELINE, type InvestigationState } from '../../convex/core/states';

/**
 * Status presentation.
 *
 * Imports the state machine directly from the backend so the labels the user
 * reads and the states the server enforces can never drift apart.
 */

export { STATE_LABEL, PIPELINE };
export type { InvestigationState };

export type PillTone = 'working' | 'attention' | 'positive' | 'negative' | 'neutral';

export function statusTone(status: string): PillTone {
  switch (status) {
    case 'AWAITING_APPROVAL':
    case 'FOLLOW_UP_READY':
      return 'attention';
    case 'RESOLVED':
      return 'positive';
    case 'FAILED':
      return 'negative';
    case 'PAUSED':
      return 'neutral';
    default:
      return 'working';
  }
}

export function statusLabel(status: string): string {
  return STATE_LABEL[status as InvestigationState] ?? status;
}

/** How far along the pipeline a case is, for the progress rail. */
export function pipelinePosition(status: string): number {
  const index = PIPELINE.indexOf(status as InvestigationState);
  if (index >= 0) return index;
  // PAUSED and FAILED sit outside the rail.
  return -1;
}

/**
 * Money formatting.
 *
 * Amounts are never rounded up and an absent amount renders as an em dash
 * rather than as zero — "$0" reads like a finding, "—" reads like "unknown".
 */
export function formatMoney(amount: number | undefined, currency = 'USD'): string {
  if (amount === undefined || amount === null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Event type -> short human phrase for the timeline. */
export const EVENT_LABEL: Record<string, string> = {
  EMAIL_RECEIVED: 'Email received',
  INVESTIGATION_CREATED: 'Investigation opened',
  TRANSACTION_EXTRACTED: 'Transaction read',
  SOURCE_DISCOVERED: 'Sources found',
  SOURCE_UNREADABLE: 'Source unreadable',
  EVIDENCE_ADDED: 'Evidence',
  ANALYSIS_COMPLETED: 'Analysis',
  CLAIM_PREPARED: 'Claim drafted',
  CLAIM_EDITED: 'Draft edited',
  CLAIM_APPROVED: 'Approved',
  CLAIM_SENT: 'Sent',
  CLAIM_SEND_FAILED: 'Send failed',
  CLAIM_REJECTED: 'Rejected',
  REPLY_RECEIVED: 'Reply received',
  REPLY_ANALYZED: 'Reply analysed',
  FOLLOW_UP_PREPARED: 'Follow-up drafted',
  MONITOR_SCHEDULED: 'Monitoring started',
  MONITOR_DETECTED_CHANGE: 'Change detected',
  CONTACT_SET: 'Contact set',
  INJECTION_ATTEMPT_NEUTRALISED: 'Suspicious content blocked',
  RESOLVED: 'Resolved',
  FAILED: 'Stopped',
  STATUS_CHANGED: 'Status',
};

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.toLowerCase().replace(/_/g, ' ');
}
