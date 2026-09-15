import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthArgs } from '../lib/session';
import { Amount, Loading, ProgressRail, StatusPill } from '../components/pieces';
import { eventLabel, formatMoney } from '../lib/status';
import { formatRelativeTime } from '../lib/utils';
import { hostOf } from '../lib/utils';
import './CaseDetail.css';

/**
 * The case file.
 *
 * Reads top to bottom as an argument: what Sherlock found, why it matters,
 * what it proposes, and exactly what will be sent. The draft is shown in full
 * and is editable — nothing leaves without the user having seen the words.
 */
export function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuthArgs();
  const navigate = useNavigate();

  const data = useQuery(
    api.investigations.get,
    id ? { ...auth, id: id as Id<'investigations'> } : 'skip'
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pause = useMutation(api.investigations.pause);
  const resume = useMutation(api.investigations.resume);
  const retry = useMutation(api.investigations.retry);
  const resolve = useMutation(api.investigations.resolve);
  const remove = useMutation(api.investigations.remove);

  if (data === undefined) return <Loading rows={6} />;
  if (data === null) {
    return (
      <div className="empty">
        <h3>Case not found</h3>
        <p>It may have been deleted, or it belongs to another account.</p>
        <Link to="/app/investigations" className="btn">
          Back to investigations
        </Link>
      </div>
    );
  }

  const { investigation, events, evidence, claims, emails, monitors } = data;
  const openClaim = claims.find((claim) => claim.status === 'awaiting_approval');
  const currency = investigation.currency;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="case">
      <Link to="/app/investigations" className="case-back faint">
        ← Investigations
      </Link>

      {/* ---------------------------------------------------------- header */}
      <header className="case-head">
        <div className="case-head-main">
          <div className="case-head-title">
            <h1>{investigation.title}</h1>
            <StatusPill status={investigation.status} />
          </div>
          <p className="muted">
            {investigation.merchantName ?? investigation.merchantDomain ?? 'Merchant unknown'}
            {investigation.orderId && (
              <>
                {' · '}
                <span className="mono">Order {investigation.orderId}</span>
              </>
            )}
            {investigation.amount !== undefined && (
              <> · Paid {formatMoney(investigation.amount, currency)}</>
            )}
          </p>
        </div>

        <div className="case-head-money">
          {investigation.recoveredAmount ? (
            <Amount
              value={investigation.recoveredAmount}
              currency={currency}
              tone="recovered"
              label="Confirmed recovered"
            />
          ) : investigation.potentialAmount !== undefined ? (
            <Amount
              value={investigation.potentialAmount}
              currency={currency}
              tone={investigation.status === 'SENT' || investigation.status === 'WAITING_FOR_REPLY' ? 'pending' : 'potential'}
              label={
                investigation.status === 'SENT' || investigation.status === 'WAITING_FOR_REPLY'
                  ? 'Claimed, awaiting reply'
                  : 'Potential — not yet claimed'
              }
            />
          ) : null}
        </div>
      </header>

      <ProgressRail status={investigation.status} />

      {error && <div className="banner banner-negative case-error">{error}</div>}

      {investigation.status === 'FAILED' && investigation.failureReason && (
        <div className="banner banner-negative">
          <div>
            <strong>Sherlock stopped.</strong> {investigation.failureReason}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- what found */}
      {investigation.assessment && (
        <section className="card case-block">
          <h2 className="case-block-title">What Sherlock found</h2>
          <p className="case-assessment">{investigation.assessment}</p>
          {investigation.confidence !== undefined && (
            <p className="faint case-confidence">
              Confidence {Math.round(investigation.confidence * 100)}% — based on{' '}
              {evidence.length} source{evidence.length === 1 ? '' : 's'} below.
            </p>
          )}
        </section>
      )}

      {/* --------------------------------------------------------- evidence */}
      <section className="case-block">
        <h2 className="case-block-title">
          Evidence{evidence.length > 0 && <span className="faint"> · {evidence.length}</span>}
        </h2>
        {evidence.length === 0 ? (
          <p className="muted case-note">
            Nothing collected yet. Sherlock adds a card here for every fact it can trace to a
            published source.
          </p>
        ) : (
          <div className="evidence-grid">
            {evidence.map((item) => (
              <article key={item._id} className="card evidence">
                <div className="evidence-head">
                  <span className="pill">{item.kind}</span>
                  {item.confidence !== undefined && (
                    <span className="faint evidence-conf">
                      {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="evidence-fact">{item.fact}</p>
                <p className="muted evidence-relevance">{item.relevance}</p>
                {item.excerpt && <blockquote className="evidence-quote">{item.excerpt}</blockquote>}
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="evidence-source"
                  >
                    {item.sourceTitle ?? hostOf(item.sourceUrl)} ↗
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ draft */}
      {openClaim && (
        <ClaimApproval
          claim={openClaim}
          investigationId={investigation._id}
          contactEmail={investigation.contactEmail}
        />
      )}

      {!openClaim && !investigation.contactEmail && investigation.status === 'FAILED' && (
        <ContactPrompt investigationId={investigation._id} />
      )}

      {/* ------------------------------------------------------ conversation */}
      {emails.length > 0 && (
        <section className="case-block">
          <h2 className="case-block-title">Conversation</h2>
          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            {[...emails]
              .sort((a, b) => a.receivedAt - b.receivedAt)
              .map((email) => (
                <article key={email._id} className={`card thread thread-${email.direction}`}>
                  <div className="thread-head">
                    <strong>
                      {email.direction === 'inbound' ? email.fromEmail : `To ${email.toEmail}`}
                    </strong>
                    <span className="faint">{formatRelativeTime(email.receivedAt)}</span>
                  </div>
                  <div className="thread-subject">{email.subject}</div>
                  <pre className="thread-body">{email.body}</pre>
                </article>
              ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- monitors */}
      {monitors.length > 0 && (
        <section className="case-block">
          <h2 className="case-block-title">Monitoring</h2>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {monitors.map((monitor) => (
              <div key={monitor._id} className="card monitor">
                <div>
                  <strong>{monitor.kind === 'claim_followup' ? 'Reply chase' : 'Page watch'}</strong>
                  {monitor.url && <span className="faint"> · {hostOf(monitor.url)}</span>}
                </div>
                <div className="faint monitor-meta">
                  {monitor.active
                    ? `${monitor.remainingRuns} check${monitor.remainingRuns === 1 ? '' : 's'} left`
                    : 'Finished'}
                  {monitor.lastResult && ` · ${monitor.lastResult}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- timeline */}
      <section className="case-block">
        <h2 className="case-block-title">Timeline</h2>
        <ol className="timeline">
          {events.map((event) => (
            <li key={event._id} className="timeline-item">
              <span className="timeline-dot" aria-hidden="true" />
              <div className="timeline-body">
                <div className="timeline-head">
                  <span className="timeline-type">{eventLabel(event.type)}</span>
                  <span className="faint">{formatRelativeTime(event.createdAt)}</span>
                </div>
                <p className="timeline-summary">{event.summary}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------- actions */}
      <footer className="case-actions">
        {investigation.status === 'PAUSED' ? (
          <button
            className="btn"
            disabled={busy}
            onClick={() => run(() => resume({ ...auth, id: investigation._id }))}
          >
            Resume
          </button>
        ) : investigation.status !== 'RESOLVED' ? (
          <button
            className="btn"
            disabled={busy}
            onClick={() => run(() => pause({ ...auth, id: investigation._id }))}
          >
            Pause
          </button>
        ) : null}

        {investigation.status === 'FAILED' && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => run(() => retry({ ...auth, id: investigation._id }))}
          >
            Try again
          </button>
        )}

        {investigation.status !== 'RESOLVED' && (
          <ResolveButton
            busy={busy}
            currency={currency}
            onResolve={(amount) =>
              run(() => resolve({ ...auth, id: investigation._id, recoveredAmount: amount }))
            }
          />
        )}

        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await remove({ ...auth, id: investigation._id });
              navigate('/app/investigations');
            })
          }
        >
          Delete case
        </button>
      </footer>
    </div>
  );
}

/**
 * The approval boundary, rendered.
 *
 * The full outbound text is shown and editable. "Approve and send" is the
 * only path to an outbound email in the entire product.
 */
function ClaimApproval({
  claim,
  investigationId,
  contactEmail,
}: {
  claim: {
    _id: Id<'claims'>;
    subject: string;
    body: string;
    toEmail: string;
    reasoning: string;
    potentialAmount?: number;
    currency?: string;
    isFollowUp: boolean;
  };
  investigationId: Id<'investigations'>;
  contactEmail?: string;
}) {
  const auth = useAuthArgs();
  const editDraft = useMutation(api.claims.editDraft);
  const reject = useMutation(api.claims.reject);
  const approveAndSend = useAction(api.claims.approveAndSend);

  const [subject, setSubject] = useState(claim.subject);
  const [body, setBody] = useState(claim.body);
  const [to, setTo] = useState(claim.toEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edited = subject !== claim.subject || body !== claim.body || to !== claim.toEmail;

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      if (edited) {
        await editDraft({ ...auth, claimId: claim._id, subject, body, toEmail: to });
      }
      const result = await approveAndSend({ ...auth, claimId: claim._id });
      if (!result.sent) setError(result.error ?? 'The message was not sent.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The message was not sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card case-block approval">
      <div className="approval-head">
        <h2 className="case-block-title" style={{ margin: 0 }}>
          {claim.isFollowUp ? 'Follow-up ready' : 'Claim ready'} — your approval needed
        </h2>
        {claim.potentialAmount !== undefined && (
          <span className="pill pill-attention">
            Asking for {formatMoney(claim.potentialAmount, claim.currency)}
          </span>
        )}
      </div>

      <p className="approval-reasoning">{claim.reasoning}</p>

      <div className="approval-fields">
        <div>
          <label htmlFor="claim-to">To</label>
          <input
            id="claim-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            spellCheck={false}
          />
        </div>
        <div>
          <label htmlFor="claim-subject">Subject</label>
          <input
            id="claim-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
      </div>

      <label htmlFor="claim-body">Message</label>
      <textarea
        id="claim-body"
        value={body}
        rows={14}
        onChange={(event) => setBody(event.target.value)}
      />

      {error && <div className="banner banner-negative">{error}</div>}

      <div className="approval-actions">
        <button className="btn btn-primary" onClick={handleSend} disabled={busy || !to}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? 'Sending…' : edited ? 'Save and send' : 'Approve and send'}
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await reject({ ...auth, claimId: claim._id, note: 'Rejected from the case page' });
            } finally {
              setBusy(false);
            }
          }}
        >
          Reject
        </button>
        <span className="faint approval-note">
          Nothing is sent until you press approve. {contactEmail && `Replies come back here.`}
        </span>
      </div>

      <input type="hidden" value={investigationId} readOnly />
    </section>
  );
}

/** Unblocks a case whose research could not find a support address. */
function ContactPrompt({ investigationId }: { investigationId: Id<'investigations'> }) {
  const auth = useAuthArgs();
  const setContact = useMutation(api.claims.setContactEmail);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="card case-block">
      <h2 className="case-block-title">Add a contact address</h2>
      <p className="muted case-note">
        Sherlock could not find a support address for this merchant. Add one and retry the
        investigation.
      </p>
      <div className="contact-row">
        <input
          value={email}
          placeholder="support@merchant.com"
          onChange={(event) => setEmail(event.target.value)}
          spellCheck={false}
        />
        <button
          className="btn"
          disabled={!email}
          onClick={async () => {
            setError(null);
            try {
              await setContact({ ...auth, investigationId, email });
              setEmail('');
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Could not save that address.');
            }
          }}
        >
          Save
        </button>
      </div>
      {error && <p className="banner banner-negative">{error}</p>}
    </section>
  );
}

/** Resolving asks for the real recovered amount rather than assuming one. */
function ResolveButton({
  busy,
  currency,
  onResolve,
}: {
  busy: boolean;
  currency?: string;
  onResolve: (amount: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');

  if (!open) {
    return (
      <button className="btn" disabled={busy} onClick={() => setOpen(true)}>
        Mark resolved
      </button>
    );
  }

  return (
    <div className="resolve-row">
      <label htmlFor="resolve-amount" className="sr-only">
        Amount actually recovered
      </label>
      <input
        id="resolve-amount"
        inputMode="decimal"
        placeholder={`Amount recovered (${currency ?? 'USD'}), or leave blank`}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() => {
          const parsed = amount.trim() === '' ? undefined : Number(amount);
          onResolve(Number.isFinite(parsed) ? parsed : undefined);
          setOpen(false);
        }}
      >
        Confirm
      </button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
