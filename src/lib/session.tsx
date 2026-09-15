import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

/**
 * Session state.
 *
 * The token here is a convenience, not the security boundary — every Convex
 * function re-checks it on the server (see convex/auth.ts). Hiding a screen
 * in React protects nobody; this just avoids showing a logged-out user a
 * dashboard full of errors.
 */

const STORAGE_KEY = 'sherlock.token';

interface SessionValue {
  token: string | undefined;
  /** True when the deployment has no passcode set (local development). */
  openMode: boolean;
  isAuthed: boolean;
  isLoading: boolean;
  setToken: (token: string | undefined) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

function readStored(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    // Private browsing, or storage disabled. Sign-in still works per-session.
    return undefined;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | undefined>(readStored);
  const verification = useQuery(api.auth.verify, { token });

  const setToken = useCallback((next: string | undefined) => {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Non-fatal: keep it in memory for this tab.
    }
    setTokenState(next);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      token,
      openMode: verification?.openMode ?? false,
      isAuthed: verification?.valid ?? false,
      isLoading: verification === undefined,
      setToken,
    }),
    [token, verification, setToken]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/** Args every authenticated Convex call needs. */
export function useAuthArgs(): { token: string | undefined } {
  const { token } = useSession();
  return useMemo(() => ({ token }), [token]);
}
