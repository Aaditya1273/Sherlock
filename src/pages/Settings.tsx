import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthArgs, useSession } from '../lib/session';
import { PageHeader } from '../components/Shell';
import { Loading } from '../components/pieces';
import './Settings.css';

/**
 * Settings.
 *
 * Only what an operator genuinely has to do: create the inbox mail is
 * forwarded to, see which integrations are live, and set a passcode. Keys are
 * never entered here — they live in the Convex environment and the browser
 * only ever learns whether one is present.
 */
export function Settings() {
  const auth = useAuthArgs();
  const { openMode } = useSession();

  const inboxes = useQuery(api.agentMail.listInboxes, auth);
  const status = useQuery(api.agentMail.integrationStatus, auth);
  const createInbox = useAction(api.agentMail.createInbox);
  const syncInboxes = useAction(api.agentMail.syncInboxes);
  const setDefault = useMutation(api.agentMail.setDefaultInbox);

  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(label);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings">
      <PageHeader title="Settings" subtitle="Your inbox, and what Sherlock is connected to." />

      {error && <div className="banner banner-negative">{error}</div>}
      {notice && <div className="banner">{notice}</div>}

      {/* ---------------------------------------------------------- inbox */}
      <section className="card settings-block">
        <h2 className="settings-title">Your Sherlock inbox</h2>
        <p className="muted settings-note">
          This is the address you forward receipts and bookings to. Sherlock also sends claims
          from it, so merchant replies come back to the same thread.
        </p>

        {inboxes === undefined && <Loading rows={1} />}

        {inboxes?.length === 0 && (
          <div className="settings-create">
            <div>
              <label htmlFor="inbox-username">Address</label>
              <div className="settings-inline">
                <input
                  id="inbox-username"
                  value={username}
                  placeholder="yourname"
                  spellCheck={false}
                  onChange={(event) => setUsername(event.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={busy || !username.trim()}
                  onClick={() =>
                    run('Inbox created.', () =>
                      createInbox({ ...auth, username: username.trim(), displayName: 'Sherlock' })
                    )
                  }
                >
                  {busy && <span className="spinner" aria-hidden="true" />}
                  Create inbox
                </button>
              </div>
            </div>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run('Synced inboxes from AgentMail.', () => syncInboxes(auth))
              }
            >
              Or import an existing AgentMail inbox
            </button>
          </div>
        )}

        {inboxes && inboxes.length > 0 && (
          <ul className="inbox-list">
            {inboxes.map((inbox) => (
              <li key={inbox._id} className="inbox-item">
                <div>
                  <span className="mono inbox-email">{inbox.email}</span>
                  {inbox.isDefault && <span className="pill pill-positive">Default</span>}
                </div>
                {!inbox.isDefault && (
                  <button
                    className="btn btn-sm"
                    onClick={() => run('Default inbox updated.', () => setDefault({ ...auth, id: inbox._id }))}
                  >
                    Make default
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------- integrations */}
      <section className="card settings-block">
        <h2 className="settings-title">Connections</h2>
        <p className="muted settings-note">
          Keys live in the Convex environment, never in the browser. This only shows whether each
          one is present.
        </p>
        <ul className="conn-list">
          <Connection
            name="AgentMail"
            role="The inbox — receives forwarded mail, sends and threads claims"
            ready={status?.agentMail}
            env="AGENTMAIL_API_KEY"
          />
          <Connection
            name="Firecrawl"
            role="The browser — finds and reads merchant policy and price pages"
            ready={status?.firecrawl}
            env="FIRECRAWL_API_KEY"
          />
          <Connection
            name="OpenAI"
            role="The reasoning — extraction, evidence, eligibility and drafting"
            ready={status?.openai}
            env="OPENAI_API_KEY"
          />
        </ul>
      </section>

      {/* ---------------------------------------------------------- access */}
      <section className="card settings-block">
        <h2 className="settings-title">Access</h2>
        {openMode ? <PasscodeSetup /> : (
          <p className="muted settings-note">
            This deployment is passcode protected. To change it, update
            <span className="mono"> SHERLOCK_PASSCODE_HASH</span> in the Convex dashboard.
          </p>
        )}
      </section>

      {/* --------------------------------------------------------- webhook */}
      <section className="card settings-block">
        <h2 className="settings-title">Inbound webhook</h2>
        <p className="muted settings-note">
          Point your AgentMail inbound webhook at this path on your deployment, and set
          <span className="mono"> AGENTMAIL_WEBHOOK_SECRET</span> to the same value you configure
          there. Sherlock rejects unsigned deliveries.
        </p>
        <code className="webhook-path">https://&lt;your-deployment&gt;.convex.site/api/agentmail/inbound</code>
      </section>
    </div>
  );
}

function Connection({
  name,
  role,
  ready,
  env,
}: {
  name: string;
  role: string;
  ready: boolean | undefined;
  env: string;
}) {
  return (
    <li className="conn">
      <div className="conn-main">
        <strong>{name}</strong>
        <span className="muted conn-role">{role}</span>
      </div>
      {ready === undefined ? (
        <span className="pill">Checking</span>
      ) : ready ? (
        <span className="pill pill-positive">Connected</span>
      ) : (
        <span className="pill pill-negative" title={`Set ${env} in the Convex dashboard`}>
          {env} missing
        </span>
      )}
    </li>
  );
}

/**
 * Passcode bootstrap.
 *
 * Produces the hash for the operator to paste into the Convex environment.
 * The passphrase itself is never stored by the app.
 */
function PasscodeSetup() {
  const generate = useMutation(api.auth.generatePasscodeHash);
  const [passcode, setPasscode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <div className="banner banner-attention">
        No passcode is set. Anyone who can reach this deployment can read your cases, and sending
        email is disabled until you set one.
      </div>
      <div className="settings-inline">
        <input
          type="password"
          value={passcode}
          placeholder="Choose a passphrase (10+ characters)"
          onChange={(event) => setPasscode(event.target.value)}
        />
        <button
          className="btn"
          disabled={passcode.length < 10}
          onClick={async () => {
            setError(null);
            try {
              const generated = await generate({ passcode });
              setResult(generated.instructions);
              setPasscode('');
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : 'Could not generate a hash.');
            }
          }}
        >
          Generate hash
        </button>
      </div>
      {error && <div className="banner banner-negative">{error}</div>}
      {result && <pre className="passcode-result">{result}</pre>}
    </>
  );
}
