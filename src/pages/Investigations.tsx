import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthArgs } from '../lib/session';
import { PageHeader } from '../components/Shell';
import { CaseRow, Empty, Loading } from '../components/pieces';

type Filter = 'all' | 'active' | 'attention' | 'resolved';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Open' },
  { value: 'attention', label: 'Needs you' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

export function Investigations() {
  const auth = useAuthArgs();
  const [filter, setFilter] = useState<Filter>('active');
  const rows = useQuery(api.investigations.list, { ...auth, filter });

  return (
    <>
      <PageHeader
        title="Investigations"
        subtitle="Every case Sherlock has opened from your forwarded mail."
        actions={
          <div className="filter-group" role="group" aria-label="Filter investigations">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                className={`btn btn-sm${filter === option.value ? ' is-selected' : ''}`}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {rows === undefined && <Loading rows={5} />}

      {rows?.length === 0 && (
        <Empty
          title={filter === 'active' ? 'Nothing open' : 'Nothing here'}
          body={
            filter === 'active'
              ? 'Forward a purchase or booking email to your Sherlock address and a case will appear here within a minute.'
              : 'Try a different filter, or forward a new email to open a case.'
          }
          action={
            <Link to="/app" className="btn btn-primary">
              Go to inbox
            </Link>
          }
        />
      )}

      <div className="stack" style={{ gap: 'var(--space-2)', maxWidth: 'var(--content-max)' }}>
        {rows?.map((row) => (
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
    </>
  );
}
