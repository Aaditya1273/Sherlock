'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import type { ReactNode } from 'react';
import { api } from '../../convex/_generated/api';
import { useAuthArgs, useSession } from '../lib/session';
import { Logo } from './Logo';
import './Shell.css';

/**
 * Application shell.
 *
 * Six destinations, in the order a case moves through them: what arrived,
 * what is being worked, what needs a decision, what happened, asking about
 * it, and configuration. Admin surfaces are not part of the product.
 */

const NAV = [
  { to: '/app', label: 'Inbox', end: true },
  { to: '/app/investigations', label: 'Investigations' },
  { to: '/app/claims', label: 'Claims', badge: 'pending' as const },
  { to: '/app/activity', label: 'Activity' },
  { to: '/app/chat', label: 'Ask Sherlock' },
  { to: '/app/settings', label: 'Settings' },
];

export function Shell({ children }: { children: ReactNode }) {
  const auth = useAuthArgs();
  const { openMode, setToken, token } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const signOut = useMutation(api.auth.signOut);

  const pending = useQuery(api.claims.listPending, auth);
  const pendingCount = pending?.length ?? 0;

  async function handleSignOut() {
    if (token) await signOut({ token });
    setToken(undefined);
    router.push('/');
  }

  return (
    <div className="shell">
      <aside className="shell-nav">
        <Link href="/" className="shell-brand">
          <Logo size={28} />
          <span>Sherlock</span>
        </Link>

        <nav>
          {NAV.map((item) => {
            const isActive = item.end ? pathname === item.to : pathname.startsWith(item.to);
            return (
            <Link
              key={item.to}
              href={item.to}
              className={`shell-link${isActive ? ' is-active' : ''}`}
            >
              <span>{item.label}</span>
              {item.badge === 'pending' && pendingCount > 0 && (
                <span className="shell-badge" aria-label={`${pendingCount} awaiting approval`}>
                  {pendingCount}
                </span>
              )}
            </Link>
            );
          })}
        </nav>

        <div className="shell-foot">
          {openMode ? (
            <p className="faint shell-note">
              Open mode — no passcode set. Outbound email is disabled.
            </p>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={handleSignOut}>
              Sign out
            </button>
          )}
        </div>
      </aside>

      <main className="shell-main">{children}</main>
    </div>
  );
}

/** Consistent page header. Title left, actions right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
