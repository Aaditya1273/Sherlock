'use client';

import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthArgs } from '../lib/session';
import { PageHeader } from '../components/Shell';
import { Amount, CaseRow, Empty, Loading, StatusPill } from '../components/pieces';
import { formatRelativeTime } from '../lib/utils';
import './Inbox.css';

/**
 * Inbox — the home screen.
 *
 * An inbox that can act: what arrived, what Sherlock did with it, and what is
 * waiting on the user. Every figure here is a live Convex subscription, so
 * the screen moves on its own while an investigation runs.
 */
export function Inbox() {
  const auth = useAuthArgs();
  const stats = useQuery(api.investigations.stats, auth);
  const emails = useQuery(api.emails.listInbox, { ...auth, limit: 25 });
  const attention = useQuery(api.investigations.list, { ...auth, filter: 'attention' });
  const inbox = useQuery(api.agentMail.defaultInbox, auth);

  const loading = stats === undefined || emails === undefined;

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={
          inbox
            ? `Forward any receipt or booking to ${inbox.email}`
            : 'Set up your Sherlock address in Settings to start forwarding'
        }
      />

      <section className="stat-row" aria-label="Totals">
        <div className="card stat">
          <Amount
            value={stats?.recovered}
            currency={stats?.currency}
            tone="recovered"
            label="Confirmed recovered"
          />
        </div>
        <div className="card stat">
          <Amount
            value={stats?.pending}
            currency={stats?.currency}
            tone="pending"
            label="Claimed, awaiting a reply"
          />
        </div>
        <div className="card stat">
          <Amount
            value={stats?.potential}
            currency={stats?.currency}
            tone="potential"
            label="Potential, not yet claimed"
          />
        </div>
        <div className="card stat">
          <div className="amount">
            <span className="amount-value">{stats?.active ?? '—'}</span>
            <span className="amount-label">Open investigations</span>
          </div>
        </div>
      </section>

      {attention && attention.length > 0 && (
        <section className="attention-block">
          <div className="banner banner-attention">
            <span>
              {attention.length} {attention.length === 1 ? 'claim needs' : 'claims need'} your
              approval before anything is sent.
            </span>
            <Link href="/app/claims" className="attention-link">
              Review
            </Link>
          </div>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {attention.slice(0, 3).map((row) => (
              <CaseRow
                key={row._id}
                id={row._id}
                title={row.title}
                merchant={row.merchantName ?? row.merchantDomain}
                status={row.status}
                updatedAt={row.updatedAt}
                potentialAmount={row.potentialAmount}
                recoveredAmount={row.recoveredAmount}
                currency={row.currency}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Mail</h2>

        {loading && <Loading rows={4} />}

        {!loading && emails.length === 0 && (
          <Empty
            title="No mail yet"
            body={
              inbox
                ? `Forward a purchase, booking or billing email to ${inbox.email}. Sherlock reads it, researches the merchant's policy, and tells you if you're owed anything.`
                : 'Create your Sherlock inbox in Settings, then forward a purchase or booking email to it.'
            }
            action={
              <Link href="/app/settings" className="btn btn-primary">
                {inbox ? 'View inbox settings' : 'Set up your inbox'}
              </Link>
            }
          />
        )}

        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {emails?.map((email) => {
            const body = (
              <>
                <div className="mail-row-head">
                  <span className={`mail-dir mail-dir-${email.direction}`}>
                    {email.direction === 'inbound' ? 'In' : 'Out'}
                  </span>
                  <span className="mail-subject">{email.subject}</span>
                  {email.threatFlags.length > 0 && (
                    <span
                      className="pill pill-negative"
                      title={`Neutralised: ${email.threatFlags.join(', ')}`}
                    >
                      Suspicious content blocked
                    </span>
                  )}
                </div>
                <div className="mail-row-meta faint">
                  {email.direction === 'inbound' ? email.fromEmail : `to ${email.toEmail}`} ·{' '}
                  {formatRelativeTime(email.receivedAt)}
                </div>
              </>
            );

            return email.investigationId ? (
              <Link
                key={email._id}
                href={`/app/case?id=${email.investigationId}`}
                className="card mail-row"
              >
                <div className="mail-row-main">{body}</div>
                {email.investigation && <StatusPill status={email.investigation.status} />}
              </Link>
            ) : (
              <div key={email._id} className="card mail-row is-static">
                <div className="mail-row-main">{body}</div>
                <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                  No investigation
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
