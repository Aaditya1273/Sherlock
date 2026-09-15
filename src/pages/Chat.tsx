import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthArgs } from '../lib/session';
import { PageHeader } from '../components/Shell';
import './Chat.css';

/**
 * Ask Sherlock.
 *
 * A window onto the user's own case data, not a general assistant. The server
 * answers from investigations, evidence and claims only, and the chat has no
 * ability to approve or send anything — that stays on the Claims screen.
 */

const SUGGESTIONS = [
  'What are you working on right now?',
  'Why do you think I am eligible on my latest case?',
  'How much have I actually recovered?',
  'Which cases are waiting on me?',
];

export function Chat() {
  const auth = useAuthArgs();
  const messages = useQuery(api.chat.history, auth);
  const ask = useAction(api.chat.ask);
  const clear = useAction(api.chat.clear);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages?.length, sending]);

  async function submit(text: string) {
    const question = text.trim();
    if (!question || sending) return;
    setInput('');
    setSending(true);
    setError(null);
    try {
      await ask({ ...auth, message: question });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not get an answer.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-page">
      <PageHeader
        title="Ask Sherlock"
        subtitle="Answers come from your cases — not from the open web."
        actions={
          messages && messages.length > 0 ? (
            <button className="btn btn-sm" onClick={() => clear(auth)}>
              Clear
            </button>
          ) : undefined
        }
      />

      <div className="chat-log" role="log" aria-live="polite">
        {messages?.length === 0 && (
          <div className="chat-intro">
            <p className="muted">
              Sherlock can only tell you what its investigations actually found. If the case data
              does not answer a question, it will say so rather than guess.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} className="btn btn-sm" onClick={() => submit(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages?.map((message) => (
          <div key={message._id} className={`bubble bubble-${message.role}`}>
            <p>{message.content}</p>
            {message.citedInvestigationIds && message.citedInvestigationIds.length > 0 && (
              <div className="bubble-cites">
                {message.citedInvestigationIds.map((id) => (
                  <Link key={id} to={`/app/investigations/${id}`}>
                    Open case
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="bubble bubble-assistant is-thinking">
            <span className="spinner" aria-hidden="true" />
            <span className="muted">Reading your cases…</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {error && <div className="banner banner-negative">{error}</div>}

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Ask Sherlock a question
        </label>
        <input
          id="chat-input"
          value={input}
          placeholder="Ask about your investigations…"
          onChange={(event) => setInput(event.target.value)}
          disabled={sending}
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit" disabled={sending || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
