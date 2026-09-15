import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import './Landing.css';

/**
 * Landing page.
 *
 * Explains the mechanism rather than selling a vision: what you do, what
 * Sherlock does with it, and where a human stays in the loop. No invented
 * metrics, testimonials or customer counts — the product shot below is a live
 * render of the real case-file layout, not a screenshot that can go stale.
 */

const STEPS = [
  {
    name: 'Forward',
    detail:
      'Send any receipt, booking or billing email to your Sherlock address. That is the whole interaction.',
  },
  {
    name: 'Investigate',
    detail:
      "Firecrawl searches and reads the merchant's own refund, price-adjustment and cancellation pages — scoped to their domain.",
  },
  {
    name: 'Evidence',
    detail:
      'Every relevant clause becomes a card carrying the source URL and the exact wording, so the case is checkable.',
  },
  {
    name: 'Action',
    detail:
      'If the evidence supports a claim, Sherlock drafts the email — and stops. You read it, edit it, and decide.',
  },
];

const STACK = ['AgentMail', 'Firecrawl', 'OpenAI', 'Convex'];

const TRUST = [
  {
    title: 'A human sends every email',
    body: 'Research, reading and drafting are automatic. Contacting a company is not — and that boundary is enforced by the state machine, not by a setting.',
  },
  {
    title: 'Claims cite real sources',
    body: 'Each one links the page and quotes the clause it relies on. If no clause applies, Sherlock closes the case and tells you why.',
  },
  {
    title: 'Estimates stay estimates',
    body: 'Potential and recovered are separate figures. Money only counts as recovered once a merchant actually confirms it.',
  },
  {
    title: 'External text is data',
    body: 'Forwarded mail and scraped pages are sanitised before any model reads them. A page that tries to give instructions gets flagged, not obeyed.',
  },
];

export function Landing() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand">
            <Logo size={22} />
            <span>Sherlock</span>
          </Link>
          <div className="landing-nav-links">
            <a href="#how">How it works</a>
            <a href="#evidence">Evidence</a>
            <a href="#trust">Trust</a>
          </div>
          <Link to="/app" className="lbtn lbtn-primary lbtn-sm">
            Open Sherlock
          </Link>
        </div>
      </nav>

      {/* ------------------------------------------------------------ hero */}
      <header className="hero">
        <div className="landing-shell">
          <div className="hero-inner">
            <span className="eyebrow rise">Email-native agent</span>
            <h1 className="rise" style={{ '--delay': '100ms' } as React.CSSProperties}>
              Give your inbox a browser.
            </h1>
            <p className="hero-sub rise" style={{ '--delay': '200ms' } as React.CSSProperties}>
              Forward an email. Sherlock investigates the web, finds what you're entitled to,
              builds the evidence, and helps you act.
            </p>
            <div
              className="hero-actions rise"
              style={{ '--delay': '300ms' } as React.CSSProperties}
            >
              <Link to="/app" className="lbtn lbtn-primary">
                Try Sherlock
              </Link>
              <a href="#how" className="lbtn lbtn-secondary">
                See how it works
              </a>
            </div>
            <p className="hero-note rise" style={{ '--delay': '400ms' } as React.CSSProperties}>
              Sherlock drafts. You approve. Nothing is sent without you reading it first.
            </p>
          </div>

          <div className="rise" style={{ '--delay': '500ms' } as React.CSSProperties}>
            <ProductShot />
          </div>

          <div className="stack-strip">
            <span className="stack-strip-label">Built on</span>
            {STACK.map((name) => (
              <span key={name} className="stack-strip-item">
                {name}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------- how it works */}
      <section id="how" className="landing-section">
        <div className="landing-shell">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Four steps, and you only do the first one.</h2>
            <p>
              The information is public — a refund window, a price-adjustment clause, a
              cancellation right. What is missing is the twenty minutes between reading your email
              and acting on it.
            </p>
          </div>

          <div className="steps-grid">
            {STEPS.map((step, index) => (
              <article key={step.name} className="step-card">
                <span className="step-num">{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.name}</h3>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- features */}
      <section id="evidence" className="landing-section">
        <div className="landing-shell">
          <div className="section-head">
            <span className="eyebrow">What you get</span>
            <h2>A case you can check, not an answer you have to trust.</h2>
          </div>

          <div className="feature-grid">
            <article className="feature">
              <div className="feature-visual">
                <div className="mini-stack">
                  <span className="mini-chip">
                    policy · 14-day price adjustment
                  </span>
                  <span className="mini-chip">price · now £229, was £284</span>
                  <span className="mini-chip">contact · support@merchant.com</span>
                </div>
              </div>
              <div className="feature-copy">
                <h3>Traceable evidence</h3>
                <p>
                  Every fact carries its source URL and a verbatim quote. Click through and read
                  the page Sherlock read.
                </p>
              </div>
            </article>

            <article className="feature">
              <div className="feature-visual">
                <div className="mini-stack">
                  <div className="mini-rail">
                    <span className="mini-node is-on" />
                    <span className="mini-node is-on" />
                    <span className="mini-node is-on" />
                    <span className="mini-node is-brand" />
                    <span className="mini-node" />
                    <span className="mini-node" />
                  </div>
                  <span className="mini-chip">Waiting for your approval</span>
                </div>
              </div>
              <div className="feature-copy">
                <h3>A live case file</h3>
                <p>
                  The status moves as the backend moves — reading, investigating, weighing,
                  drafting. No timers, no fake progress.
                </p>
              </div>
            </article>

            <article className="feature">
              <div className="feature-visual">
                <div className="mini-stack">
                  <span className="mini-chip">Day 1 · baseline captured</span>
                  <span className="mini-chip">Day 6 · no change</span>
                  <span className="mini-chip">Day 9 · price changed →</span>
                </div>
              </div>
              <div className="feature-copy">
                <h3>Cases that stay alive</h3>
                <p>
                  Watched pages are re-read on a schedule and compared by content hash. An
                  unanswered claim gets a drafted nudge, never an automatic one.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- trust */}
      <section id="trust" className="landing-section">
        <div className="landing-shell">
          <div className="section-head">
            <span className="eyebrow">Where the limits are</span>
            <h2>It writes to companies on your behalf. That deserves hard edges.</h2>
          </div>

          <div className="trust-grid">
            {TRUST.map((item) => (
              <div key={item.title} className="trust-item">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- cta */}
      <section className="cta">
        <div className="landing-shell">
          <div className="cta-inner">
            <span className="eyebrow">Get started</span>
            <h2>Forward one email.</h2>
            <p>
              Sherlock opens a case, reads the merchant's policy, and tells you whether you are
              owed anything — or that you are not.
            </p>
            <Link to="/app" className="lbtn lbtn-primary">
              Try Sherlock
            </Link>
          </div>
        </div>
        <div className="glow" style={{ bottom: 0, transform: 'translate(-50%, 50%) scaleX(1.6)' }}>
          <div className="glow-layer" />
          <div className="glow-layer is-soft" />
        </div>
      </section>

      <footer className="landing-foot">
        <div className="landing-foot-inner">
          <Link to="/" className="landing-brand">
            <Logo size={20} />
            <span>Sherlock</span>
          </Link>
          <p>Built on Convex, with AgentMail, Firecrawl and OpenAI. Open source, MIT licensed.</p>
        </div>
      </footer>
    </div>
  );
}

/**
 * The product shot.
 *
 * Rendered rather than captured, so it themes correctly, stays sharp at any
 * width, and cannot drift out of date when the case page changes. The content
 * is illustrative and labelled as an example — no real merchant is named.
 */
function ProductShot() {
  return (
    <div className="shot" role="img" aria-label="An example Sherlock case file">
      <div className="shot-bar">
        <span className="shot-dot" />
        <span className="shot-dot" />
        <span className="shot-dot" />
        <span className="shot-title">sherlock — case file</span>
      </div>

      <div className="shot-body">
        <div className="shot-pane">
          <div className="shot-case-title">Wireless headphones — example merchant</div>
          <div className="shot-case-meta">Order #112-9988 · paid £284.00 · 9 days ago</div>

          <ol className="shot-steps">
            <li className="shot-step is-done">
              <span className="shot-tick">✓</span> Read the email
            </li>
            <li className="shot-step is-done">
              <span className="shot-tick">✓</span> Investigated the merchant
            </li>
            <li className="shot-step is-done">
              <span className="shot-tick">✓</span> Found 3 pieces of evidence
            </li>
            <li className="shot-step is-live">
              <span className="shot-tick" /> Waiting for your approval
            </li>
            <li className="shot-step">
              <span className="shot-tick" /> Sent
            </li>
          </ol>

          <div className="shot-approve">
            <span>Claim drafted · asking for £55.00</span>
            <span className="shot-approve-btn">Approve and send</span>
          </div>
        </div>

        <div className="shot-pane">
          <span className="shot-tag">Evidence</span>
          <div className="shot-evidence" style={{ marginTop: 'var(--space-2)' }}>
            <span className="shot-tag">policy</span>
            <span className="shot-fact">
              Price adjustments are honoured within 14 days of purchase.
            </span>
            <span className="shot-quote">
              "If an item you bought goes on sale within 14 days, contact us for a refund of the
              difference."
            </span>
            <span className="shot-src">merchant.example/returns ↗</span>
          </div>
          <div className="shot-evidence">
            <span className="shot-tag">price</span>
            <span className="shot-fact">Now listed at £229.00 — £55.00 below what was paid.</span>
            <span className="shot-src">merchant.example/product ↗</span>
          </div>
        </div>
      </div>
    </div>
  );
}
