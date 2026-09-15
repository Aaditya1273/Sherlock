import { Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthArgs } from '../lib/session';
import { PageHeader } from '../components/Shell';
import { Empty, Loading } from '../components/pieces';
import { formatMoney } from '../lib/status';
import { formatRelativeTime } from '../lib/utils';
import './Claims.css';

/**
 * Claims — the approval queue.
 *
 * The one screen where a person decides that a real email goes to a real
 * company. Drafts are opened on the case page, where the full text and the
 * evidence behind it sit side by side.
 */

const CLAIM_TONE: Record<string, string> = {
  awaiting_approval: 'pill-attention',
  approved: 'pill-working',
  sent: 'pill-working',
  answered: 'pill-working',
  succeeded: 'pill-positive',
  declined: 'pill-negative',
  rejected: 'pill',
  draft: 'pill',
};

const CLAIM_LABEL: Record<string, string> = {
  awaiting_approval: 'Needs approval',
  approved: 'Approved',
  sent: 'Sent',
  answered: 'They replied',
  succeeded: 'Accepted',
  declined: 'Declined',
  rejected: 'You rejected',
  draft: 'Draft',
};

export function Claims() {
  const auth = useAuthArgs();
  const rows = useQuery(api.claims.listAll, auth);

  const pending = rows?.filter((row) => row.claim.status === 'awaiting_approval') ?? [];
  const rest = rows?.filter((row) => row.claim.status !== 'awaiting_approval') ?? [];

  return (
    <>
      <PageHeader
        title="Claims"
        subtitle="Nothing here is sent until you approve it."
      />

      {rows === undefined && <Loading rows={4} />}

      {rows?.length === 0 && (
        <Empty
          title="No claims yet"
          body="When Sherlock finds a policy that entitles you to something, it drafts the email here and waits for you."
          action={
            <Link to="/app" className="btn btn-primary">
              Go to inbox
            </Link>
          }
        />
      )}

      {pending.length > 0 && (
        <section className="claims-section">
          <h2 className="claims-title">Waiting for you · {pending.length}</h2>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {pending.map(({ claim, investigation }) => (
              <Link
                key={claim._id}
                to={`/app/investigations/${investigation._id}`}
                className="card claim-row is-pending"
              >
                <div className="claim-main">
                  <span className="claim-subject">{claim.subject}</span>
                  <span className="faint claim-meta">
                    To {claim.toEmail} · drafted {formatRelativeTime(claim.createdAt)}
                  </span>
                </div>
                <div className="claim-side">
                  {claim.potentialAmount !== undefined && (
                    <span className="claim-amount">
                      {formatMoney(claim.potentialAmount, claim.currency)}
                    </span>
                  )}
                  <span className="pill pill-attention">Review and send</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="claims-section">
          <h2 className="claims-title">History</h2>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {rest.map(({ claim, investigation }) => (
              <Link
                key={claim._id}
                to={`/app/investigations/${investigation._id}`}
                className="card claim-row"
              >
                <div className="claim-main">
                  <span className="claim-subject">{claim.subject}</span>
                  <span className="faint claim-meta">
                    To {claim.toEmail}
                    {claim.sentAt ? ` · sent ${formatRelativeTime(claim.sentAt)}` : ''}
                  </span>
                </div>
                <div className="claim-side">
                  {claim.potentialAmount !== undefined && (
                    <span className="claim-amount muted">
                      {formatMoney(claim.potentialAmount, claim.currency)}
                    </span>
                  )}
                  <span className={`pill ${CLAIM_TONE[claim.status] ?? ''}`}>
                    {CLAIM_LABEL[claim.status] ?? claim.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
