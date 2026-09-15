'use client';

import { useMemo, type ReactNode } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { getConvexUrl } from '@convex-dev/self-static-hosting';
import { SessionProvider } from '../lib/session';

/**
 * Convex + session context for the authenticated application.
 *
 * NEXT_PUBLIC_CONVEX_URL during local development; in production the URL is
 * derived from the .convex.site host serving the page, so frontend and backend
 * ship as one deployment. The client is created lazily inside the component
 * because a static export prerenders client components on the server, where
 * `window` does not exist.
 */
function resolveConvexUrl(): string {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return process.env.NEXT_PUBLIC_CONVEX_URL;
  if (typeof window !== 'undefined') return getConvexUrl();
  // Prerender only: nothing subscribes until the page hydrates in a browser.
  return 'https://prerender.convex.cloud';
}

export function AppProviders({ children }: { children: ReactNode }) {
  const client = useMemo(() => new ConvexReactClient(resolveConvexUrl()), []);
  return (
    <ConvexProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </ConvexProvider>
  );
}
