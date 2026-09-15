import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { statusLabel, statusTone, pipelinePosition, PIPELINE, formatMoney } from '../lib/status';
import { formatRelativeTime } from '../lib/utils';
import './pieces.css';

/** Status pill. The one way a status is ever rendered. */
export function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span className={`pill pill-${tone}`}>
      <span className="pill-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

/**
 * Progress rail.
 *
 * Reflects the case's real persisted status. There is no timer and no
 * simulated advance — if it moves, the backend moved.
 */
export function ProgressRail({ status }: { status: string }) {
  const position = pipelinePosition(status);
  if (position < 0) {
    return (
      <p className="faint" style={{ fontSize: 'var(--text-xs)' }}>
        {status === 'PAUSED' ? 'Paused — outside the normal flow.' : 'Stopped before completion.'}
      </p>
    );
  }
  return (
    <ol className="rail" aria-label="Investigation progress">
      {PIPELINE.map((step, index) => (
        <li
          key={step}
          className={`rail-step${index < position ? ' is-done' : ''}${index === position ? ' is-current' : ''}`}
        >
          <span className="rail-dot" aria-hidden="true" />
          <span className="rail-label">{statusLabel(step)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Empty state. Always says what to do next, never just "nothing here". */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton" style={{ height: 64 }} />
      ))}
    </div>
  );
}

/**
 * Money figure.
 *
 * `tone` is required so a caller has to decide whether a number is an
 * estimate or real. Nothing in the UI shows an amount without that label.
 */
export function Amount({
  value,
  currency,
  tone,
  label: caption,
}: {
  value: number | undefined;
  currency?: string;
  tone: 'potential' | 'pending' | 'recovered';
  label: string;
}) {
  return (
    <div className={`amount amount-${tone}`}>
      <span className="amount-value">{formatMoney(value, currency)}</span>
      <span className="amount-label">{caption}</span>
    </div>
  );
}

/** One row in the investigations list. */
export function CaseRow({
  id,
  title,
  merchant,
  status,
  updatedAt,
  potentialAmount,
  recoveredAmount,
  currency,
}: {
  id: string;
  title: string;
  merchant?: string;
  status: string;
  updatedAt: number;
  potentialAmount?: number;
  recoveredAmount?: number;
  currency?: string;
}) {
  return (
    <Link to={`/app/investigations/${id}`} className="case-row card">
      <div className="case-row-main">
        <span className="case-row-title">{title}</span>
        <span className="faint case-row-meta">
          {merchant ? `${merchant} · ` : ''}
          {formatRelativeTime(updatedAt)}
        </span>
      </div>
      <div className="case-row-side">
        {recoveredAmount ? (
          <span className="case-row-money positive">
            {formatMoney(recoveredAmount, currency)} recovered
          </span>
        ) : potentialAmount ? (
          <span className="case-row-money muted">
            {formatMoney(potentialAmount, currency)} potential
          </span>
        ) : null}
        <StatusPill status={status} />
      </div>
    </Link>
  );
}
