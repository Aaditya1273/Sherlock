import { Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthArgs } from '../lib/session';
import { PageHeader } from '../components/Shell';
import { Empty, Loading } from '../components/pieces';
import { eventLabel } from '../lib/status';
import { formatRelativeTime } from '../lib/utils';

/**
 * Activity — everything Sherlock has done, newest first.
 *
 * A live Convex subscription, so this is also the honest answer to "is it
 * actually doing anything right now".
 */
export function Activity() {
  const auth = useAuthArgs();
  const events = useQuery(api.investigations.activity, { ...auth, limit: 80 });

  return (
    <>
      <PageHeader title="Activity" subtitle="Every step, across every case." />

      {events === undefined && <Loading rows={6} />}

      {events?.length === 0 && (
        <Empty
          title="Nothing has happened yet"
          body="Once you forward an email, every step Sherlock takes shows up here — sources read, evidence found, claims drafted and sent."
        />
      )}

      <ol className="timeline" style={{ maxWidth: 'var(--content-max)' }}>
        {events?.map((event) => (
          <li key={event._id} className="timeline-item">
            <span className="timeline-dot" aria-hidden="true" />
            <div className="timeline-body">
              <div className="timeline-head">
                <span className="timeline-type">{eventLabel(event.type)}</span>
                <span className="faint">{formatRelativeTime(event.createdAt)}</span>
              </div>
              <p className="timeline-summary">{event.summary}</p>
              {event.investigationId && event.investigationTitle && (
                <Link
                  to={`/app/investigations/${event.investigationId}`}
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {event.investigationTitle}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
