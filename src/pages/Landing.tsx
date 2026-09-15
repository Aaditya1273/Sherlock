import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import './Landing.css';

/**
 * Landing page.
 *
 * Explains the actual mechanism rather than selling a vision: what you do,
 * what Sherlock does with it, and where a human stays in the loop. No
 * invented metrics, testimonials or customer counts.
 */

const STEPS = [
  {
    step: 'Forward',
    detail:
      'Send any receipt, booking or billing email to your Sherlock address. That is the whole interaction.',
  },
  {
    step: 'Investigate',
    detail:
      "Sherlock reads the transaction, then searches and reads the merchant's own refund, price-adjustment and cancellation policies.",
  },
  {
    step: 'Evidence',
    detail:
      'Every relevant clause becomes an evidence card with the source URL and the exact wording, so the case is checkable.',
  },
  {
    step: 'Action',
    detail:
      'If the evidence supports a claim, Sherlock drafts the email — and stops. You read it, edit it, and decide whether it goes.',
  },
  {
    step: 'Outcome',
    detail:
      'Once sent, replies land back on the case. Sherlock reads them, keeps watching the price, and tells you where it stands.',
  },
];

const STACK = [
  { name: 'AgentMail', role: 'The inbox', detail: 'Receives forwarded mail, sends claims, and keeps merchant replies threaded on the case.' },
  { name: 'Firecrawl', role: 'The browser', detail: 'Finds and reads the policy and price pages that decide whether you are owed anything.' },
  { name: 'OpenAI', role: 'The reasoning', detail: 'Extracts the transaction, weighs the evidence, and writes the claim — as structured output, never loose text.' },
  { name: 'Convex', role: 'The memory', detail: 'Holds every investigation, drives the live dashboard, and runs the scheduled re-checks.' },
];

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <Logo size={24} />
          <span>Sherlock</span>
        </div>
        <Link to="/app" className="btn">
          Open Sherlock
        </Link>
      </header>

      <section className="hero">
        <h1 className="hero-title">Give your inbox a browser.</h1>
        <p className="hero-sub">
          Forward an email. Sherlock investigates the web, finds what you're entitled to, builds
          the evidence, and helps you act.
        </p>
        <div className="hero-actions">
          <Link to="/app" className="btn btn-primary btn-lg">
            Try Sherlock
          </Link>
          <a href="#how" className="btn btn-lg">
            See how it works
          </a>
        </div>
        <p className="hero-note faint">
          Sherlock drafts. You approve. Nothing is sent on your behalf without you reading it
          first.
        </p>
      </section>

      <section className="problem">
        <p>
          The information is public. A refund window, a price-adjustment clause, a cancellation
          entitlement — it is all written down, on a page anyone can open.
        </p>
        <p className="problem-point">
          What is missing is the twenty minutes between reading your email and doing something
          about it.
        </p>
      </section>

      <section id="how" className="how">
        <h2 className="landing-h2">How it works</h2>
        <ol className="steps">
          {STEPS.map((item, index) => (
            <li key={item.step} className="step">
              <span className="step-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="step-name">{item.step}</h3>
                <p className="muted step-detail">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="stack">
        <h2 className="landing-h2">Four systems, one agent</h2>
        <div className="stack-grid">
          {STACK.map((item) => (
            <article key={item.name} className="card stack-card">
              <div className="stack-card-head">
                <strong>{item.name}</strong>
                <span className="pill">{item.role}</span>
              </div>
              <p className="muted">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trust">
        <h2 className="landing-h2">Where the limits are</h2>
        <ul className="trust-list">
          <li>
            <strong>A human sends every email.</strong> Research, reading and drafting are
            automatic. Contacting a company is not.
          </li>
          <li>
            <strong>Claims cite real sources.</strong> Each one links the page and quotes the
            clause it relies on. If no clause applies, Sherlock closes the case and says so.
          </li>
          <li>
            <strong>Estimates stay labelled as estimates.</strong> Money only counts as recovered
            when a merchant actually confirms it.
          </li>
          <li>
            <strong>External text is data, never instructions.</strong> Forwarded mail and scraped
            pages are sanitised before any model reads them.
          </li>
        </ul>
      </section>

      <footer className="landing-foot">
        <div className="landing-brand">
          <Logo size={20} />
          <span>Sherlock</span>
        </div>
        <p className="faint">
          Built on Convex, with AgentMail, Firecrawl and OpenAI. Open source, MIT licensed.
        </p>
      </footer>
    </div>
  );
}
