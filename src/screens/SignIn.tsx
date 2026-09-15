'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSession } from '../lib/session';
import { Logo } from '../components/Logo';

/**
 * Sign-in.
 *
 * The passcode is checked on the server and exchanged for a session token.
 * This screen is convenience only — the real boundary is `requireOwner` in
 * convex/auth.ts, which every case-data function calls.
 */
export function SignIn() {
  const signIn = useMutation(api.auth.signIn);
  const { setToken } = useSession();

  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ passcode });
      if (result.success && result.token) setToken(result.token);
      else setError(result.error ?? 'Could not sign in.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-wrap">
      <form className="card signin" onSubmit={submit}>
        <div className="signin-brand">
          <Logo size={26} />
          <span>Sherlock</span>
        </div>
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          Your investigations contain forwarded mail and order details. Enter your passcode to
          continue.
        </p>

        <div>
          <label htmlFor="passcode">Passcode</label>
          <input
            id="passcode"
            type="password"
            value={passcode}
            autoFocus
            autoComplete="current-password"
            onChange={(event) => setPasscode(event.target.value)}
          />
        </div>

        {error && <div className="banner banner-negative">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy || !passcode}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
