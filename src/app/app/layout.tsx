'use client';

import type { ReactNode } from 'react';
import { AppProviders } from '../providers';
import { useSession } from '../../lib/session';
import { Shell } from '../../components/Shell';
import { SignIn } from '../../screens/SignIn';

/**
 * Everything under /app is the authenticated product.
 *
 * `Protected` hides signed-out UI; it is not the security boundary — every
 * Convex function re-authorises on the server (see convex/auth.ts).
 */
function Protected({ children }: { children: ReactNode }) {
  const { isAuthed, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="boot">
        <span className="spinner" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  return isAuthed ? <Shell>{children}</Shell> : <SignIn />;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <Protected>{children}</Protected>
    </AppProviders>
  );
}
