import Link from 'next/link';
import { Logo } from '../components/Logo';
import './Landing.css';

/**
 * Landing page.
 *
 * A long-form marketing page: hero with a product frame, a logo cloud, a
 * manifesto, alternating feature chapters with a visual and three
 * sub-features each, an integrations grid, a "built with limits" block, a
 * changelog, a dark closing call to action, and a columned footer.
 *
 * Everything shown is true of the product. Product visuals are rendered UI,
 * not screenshots, so they theme and cannot go stale. Where a page of this
 * shape would normally carry customer quotes and usage numbers, Sherlock
 * carries its operating principles and its real, bounded constants instead —
 * there are no invented customers, metrics or testimonials here.
 *
 * A server component: no hooks, no browser APIs, prerendered to static HTML.
 */

// ------------------------------------------------------------------ content

const NAV = [
  { href: '#inbox', label: 'Product' },
  { href: '#stack', label: 'Stack' },
  { href: '#limits', label: 'Trust' },
  { href: '#changelog', label: 'Changelog' },
  { href: 'https://github.com', label: 'GitHub', external: true },
];

const HERO_CHIPS = [
  { label: 'Inbox', icon: '✉' },
  { label: 'Investigation', icon: '⌕' },
  { label: 'Evidence', icon: '¶' },
];

/** Logos that resolve on the public simple-icons CDN; the rest are wordmarks. */
const LOGO_ROWS: { name: string; slug?: string }[][] = [
  [{ name: 'AgentMail' }, { name: 'Firecrawl' }, { name: 'OpenAI' }, { name: 'Convex', slug: 'convex' }],
  [
    { name: 'Next.js', slug: 'nextdotjs' },
    { name: 'React', slug: 'react' },
    { name: 'TypeScript', slug: 'typescript' },
    { name: 'GitHub', slug: 'github' },
  ],
];

const CHAPTERS = [
  {
    id: 'inbox',
    eyebrow: 'Inbox',
    title: 'It starts with an email',
    lede: 'Forward any receipt, booking or billing email to your Sherlock address. That is the whole interaction — there is no form to fill and nothing to install.',
    link: 'Explore the inbox',
    visual: 'inbox' as const,
    minis: [
      { title: 'Forward anything', body: 'Purchase confirmations, cancellations, subscription changes, billing notices. If it cost you money, it can be investigated.' },
      { title: 'Replies stay threaded', body: 'Claims go out from your Sherlock inbox, so a merchant reply lands back on the case that started it, not in a new one.' },
      { title: 'Retries are harmless', body: 'Every inbound message is deduplicated by id. A webhook delivered twice opens one case, not two.' },
    ],
    principle: {
      quote: 'Sherlock drafts. You approve. Nothing is sent without you reading it first.',
      source: 'Operating rule, enforced by the state machine',
    },
  },
  {
    id: 'investigation',
    eyebrow: 'Investigation',
    title: 'Read what the merchant published',
    lede: "Firecrawl searches for and reads the merchant's own refund, price-adjustment and cancellation pages — scoped to their domain, so the source is the policy, not a blog's summary of it.",
    link: 'See how evidence is built',
    visual: 'evidence' as const,
    minis: [
      { title: 'Three targeted searches', body: 'Refund policy, price adjustment, support contact. Not a crawl of the whole site — the clause lives on a known kind of page.' },
      { title: 'Verbatim excerpts', body: 'Each evidence card carries the source URL and the exact wording it relies on. Click through and read the page Sherlock read.' },
      { title: 'Allowed to find nothing', body: 'A policy that exists but does not cover your case is a no. A closed window is a no. Sherlock closes the case and says so.' },
    ],
    principle: {
      quote: 'Assessment and drafting are separate model calls. The first is allowed to say no; the second only runs after a yes.',
      source: 'Why a thin case never becomes a confident letter',
    },
  },
  {
    id: 'approval',
    eyebrow: 'Approval and follow-through',
    title: 'Approve, send, and keep the case alive',
    lede: 'When the evidence supports a claim, Sherlock drafts the email and stops. You read it, edit it, and decide. Once sent, the case stays open until it reaches an outcome.',
    link: 'See the approval boundary',
    visual: 'approval' as const,
    minis: [
      { title: 'A human sends every email', body: 'The only path to an outbound message is an authenticated approve action on a case sitting in AWAITING_APPROVAL. There is no other edge.' },
      { title: 'Nothing is optimistic', body: 'The case is marked sent only after AgentMail confirms. A failed send leaves the draft intact and tells you nothing was delivered.' },
      { title: 'Watched pages, chased claims', body: 'A monitored price page is re-read daily and compared by hash. An unanswered claim gets a drafted nudge — never an automatic one.' },
    ],
    principle: {
      quote: 'Potential and recovered are separate figures. Money only counts as recovered once a merchant actually confirms it.',
      source: 'How the dashboard avoids counting hope as cash',
    },
  },
];

const STACK = [
  { name: 'AgentMail', role: 'The inbox', body: 'Receives forwarded mail, sends claims, and keeps merchant replies threaded on the case.' },
  { name: 'Firecrawl', role: 'The browser', body: 'Finds and reads the policy and price pages that decide whether you are owed anything.' },
  { name: 'OpenAI', role: 'The reasoning', body: 'Extracts the transaction, weighs the evidence and writes the claim — as strict structured output.' },
  { name: 'Convex', role: 'The memory', body: 'Holds every case, drives the live dashboard, runs the pipeline and the scheduled re-checks.' },
];

/** True constants from the codebase, not usage figures. */
const LIMITS = [
  { value: '14', label: 'investigation states' },
  { value: '1', label: 'edge into SENT — from approval' },
  { value: '4', label: 'pages read per case, at most' },
  { value: '25', label: 'outbound emails per day, at most' },
];

const SECURITY = [
  { title: 'External text is data', body: 'Forwarded mail, scraped pages and merchant replies are sanitised before any model reads them — zero-width characters stripped, instruction-shaped spans neutralised, the block labelled untrusted.' },
  { title: 'Authorised on the server', body: 'Every case-data function checks the session on the server. The React guard hides UI; it protects nothing and is not relied upon.' },
  { title: 'Keys never reach the browser', body: 'Credentials live in the Convex environment. The client learns only whether one is present. Logged details are redacted before storage.' },
];

const FAQ = [
  { q: 'Will it email a company without asking me?', a: 'No. The state machine has exactly one edge into SENT and it starts from AWAITING_APPROVAL. Research and drafting are automatic; contacting anyone is not.' },
  { q: 'What if I am not actually owed anything?', a: 'That is a normal outcome. Reasoning can conclude there is no case, close the investigation, and tell you why — with the evidence it used.' },
  { q: 'Does it need my bank or card?', a: 'No. Sherlock reads one forwarded email and public policy pages. It has no access to your finances.' },
  { q: 'What happens if a page tells the agent to do something?', a: 'It gets classified as a fact about the page and flagged in your inbox as suspicious content. It is never followed.' },
  { q: 'How does a merchant reply reach the right case?', a: 'By thread id. Claims are sent from your Sherlock inbox, so the reply arrives on the same thread and is routed to the case that opened it.' },
  { q: 'What does "recovered" actually mean?', a: 'A figure a merchant confirmed in a reply, or one you entered by hand on the case. Estimates are labelled as estimates everywhere.' },
];

/** Mirrors the repository's git log. */
const CHANGELOG = [
  { date: 'Sep 15, 2026', title: 'Rebuilt the landing page and moved the frontend to Next.js' },
  { date: 'Sep 15, 2026', title: 'README, build log and environment template' },
  { date: 'Sep 15, 2026', title: 'Product screens: inbox, investigations, case file, claims, activity, chat, settings' },
  { date: 'Sep 15, 2026', title: 'Ask Sherlock — answers grounded in real case data' },
  { date: 'Sep 15, 2026', title: 'Scheduled monitoring: watched pages and chased claims' },
];

const FOOTER = [
  { heading: 'Product', links: [['Inbox', '/app'], ['Investigations', '/app/investigations'], ['Claims', '/app/claims'], ['Ask Sherlock', '/app/chat']] },
  { heading: 'Stack', links: [['AgentMail', 'https://agentmail.to'], ['Firecrawl', 'https://firecrawl.dev'], ['OpenAI', 'https://openai.com'], ['Convex', 'https://convex.dev']] },
  { heading: 'Resources', links: [['README', 'https://github.com'], ['Build log', 'https://github.com'], ['Source', 'https://github.com']] },
  { heading: 'Legal', links: [['MIT License', 'https://github.com']] },
];

// ---------------------------------------------------------------- page

export function Landing() {
  return (
    <div className="landing">
      <Nav />

      {/* ------------------------------------------------------------ hero */}
      <header className="hero">
        <div className="wrap hero-inner">
          <Link href="/app" className="badge rise">
            <span className="badge-dot" />
            Built for the Convex All Gas Hackathon
            <span aria-hidden="true">→</span>
          </Link>
          <h1 className="rise" style={delay(80)}>
            Give your inbox a browser.
          </h1>
          <p className="hero-lede rise" style={delay(160)}>
            Forward an email. Sherlock investigates the web, finds what you&apos;re entitled to,
            builds the evidence, and helps you act.
          </p>
          <div className="hero-actions rise" style={delay(240)}>
            <Link href="/app" className="lbtn lbtn-primary">
              Try Sherlock
            </Link>
            <a href="#inbox" className="lbtn lbtn-secondary">
              See how it works
            </a>
          </div>
          <ul className="chips rise" style={delay(320)}>
            {HERO_CHIPS.map((chip) => (
              <li key={chip.label} className="chip">
                <span className="chip-icon" aria-hidden="true">
                  {chip.icon}
                </span>
                {chip.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="wrap rise" style={delay(420)}>
          <div className="frame-wrap">
            <div className="frame-glow" aria-hidden="true" />
            <DashboardFrame />
            <div className="float-card" aria-hidden="true">
              <div className="float-card-head">
                <span className="pillmark" />
                <strong>Claim approved</strong>
              </div>
              <p>Sent to support@merchant.example · asking for £55.00</p>
              <span className="float-card-meta">Waiting for a reply</span>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------ logo cloud */}
      <section className="logos" aria-label="Built with">
        <div className="wrap">
          {LOGO_ROWS.map((row, index) => (
            <div key={index} className="logo-row">
              {row.map((logo) => (
                <div key={logo.name} className="logo">
                  {logo.slug ? (
                    // Public CDN, greyscale so it sits quietly on light and dark grounds.
                    // Plain <img>: static export has no image optimiser to route through.
                    <img
                      src={`https://cdn.simpleicons.org/${logo.slug}/8a8a8a`}
                      alt=""
                      width={22}
                      height={22}
                      loading="lazy"
                    />
                  ) : null}
                  <span>{logo.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- manifesto */}
      <section className="manifesto">
        <div className="wrap manifesto-inner">
          <aside className="manifesto-side is-left" aria-hidden="true">
            <div className="tilt-card" style={{ '--tilt': '-6deg' } as React.CSSProperties}>
              <span className="mini-eyebrow">Forwarded</span>
              <strong>Your order has shipped</strong>
              <span>orders@merchant.example</span>
            </div>
            <div className="tilt-card is-small" style={{ '--tilt': '4deg' } as React.CSSProperties}>
              <span className="mini-eyebrow">Policy</span>
              <span>&ldquo;…within 14 days of purchase.&rdquo;</span>
            </div>
          </aside>

          <div className="manifesto-copy">
            <h2>
              The information is public.
              <br />
              The workflow is the problem.
            </h2>
            <p className="manifesto-mark">
              A refund window, a price-adjustment clause, a cancellation right — all written down on
              a page anyone can open. What is missing is the twenty minutes between reading your
              email and acting on it.
            </p>
            <p>Nobody spends that on £14. So the £14 stays with the merchant.</p>
            <p>
              Sherlock closes the gap between information and action. You forward. It investigates.
              You approve.
            </p>
          </div>

          <aside className="manifesto-side is-right" aria-hidden="true">
            <div className="tilt-card is-small" style={{ '--tilt': '5deg' } as React.CSSProperties}>
              <span className="mini-eyebrow">Evidence</span>
              <span>Now £229 · was £284</span>
            </div>
            <div className="tilt-card" style={{ '--tilt': '-4deg' } as React.CSSProperties}>
              <span className="mini-eyebrow">Draft</span>
              <strong>Price adjustment request</strong>
              <span>Waiting for your approval</span>
            </div>
          </aside>
        </div>
      </section>

      {/* -------------------------------------------------------- chapters */}
      {CHAPTERS.map((chapter) => (
        <section key={chapter.id} id={chapter.id} className="chapter">
          <div className="wrap">
            <div className="chapter-head">
              <span className="eyebrow">
                <span className="eyebrow-dot" />
                {chapter.eyebrow}
              </span>
              <h2>{chapter.title}</h2>
              <p>{chapter.lede}</p>
              <Link href="/app" className="text-link">
                {chapter.link} <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="visual">
              {chapter.visual === 'inbox' && <InboxVisual />}
              {chapter.visual === 'evidence' && <EvidenceVisual />}
              {chapter.visual === 'approval' && <ApprovalVisual />}
            </div>

            <div className="minis">
              {chapter.minis.map((mini) => (
                <div key={mini.title} className="mini">
                  <h3>{mini.title}</h3>
                  <p>{mini.body}</p>
                </div>
              ))}
            </div>

            <figure className="principle">
              <blockquote>&ldquo;{chapter.principle.quote}&rdquo;</blockquote>
              <figcaption>
                <Logo size={18} />
                <span>{chapter.principle.source}</span>
              </figcaption>
            </figure>
          </div>
        </section>
      ))}

      {/* ----------------------------------------------------------- stack */}
      <section id="stack" className="chapter is-muted">
        <div className="wrap">
          <div className="chapter-head">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Stack
            </span>
            <h2>Four systems, one agent</h2>
            <p>
              Each does real work in the product. None of them sits in the README as decoration.
            </p>
          </div>
          <div className="stack-grid">
            {STACK.map((item) => (
              <article key={item.name} className="stack-tile">
                <div className="stack-tile-head">
                  <span className="stack-mark">{item.name.slice(0, 1)}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <span className="stack-role">{item.role}</span>
                  </div>
                </div>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- limits */}
      <section id="limits" className="chapter">
        <div className="wrap limits">
          <div className="limits-copy">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Built with limits
            </span>
            <h2>Bounded by construction</h2>
            <p>
              It writes to companies on your behalf. That deserves hard edges — enforced in the state
              machine and the schema, not in a prompt.
            </p>
            <dl className="limit-list">
              {LIMITS.map((limit) => (
                <div key={limit.label} className="limit">
                  <dt>{limit.value}</dt>
                  <dd>{limit.label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <StateMachineVisual />
        </div>
      </section>

      {/* -------------------------------------------------------- security */}
      <section className="chapter is-muted">
        <div className="wrap">
          <div className="chapter-head">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Security
            </span>
            <h2>Untrusted by default</h2>
            <p>
              Sherlock&apos;s whole job is to read text written by strangers and then act on it.
              That shapes the design more than anything else.
            </p>
          </div>
          <div className="minis">
            {SECURITY.map((item) => (
              <div key={item.title} className="mini">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- faq */}
      <section className="chapter">
        <div className="wrap">
          <div className="chapter-head is-centered">
            <h2>Straight answers</h2>
            <p>The questions worth asking of anything that emails people for you.</p>
          </div>
          <div className="faq-grid">
            {FAQ.map((item) => (
              <article key={item.q} className="faq">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- changelog */}
      <section id="changelog" className="chapter is-muted">
        <div className="wrap changelog">
          <div className="changelog-copy">
            <h2>We ship fast</h2>
            <p>The build log is the git history. This mirrors it.</p>
            <Link href="/app" className="lbtn lbtn-secondary lbtn-sm">
              Open Sherlock
            </Link>
          </div>
          <ol className="changelog-list">
            {CHANGELOG.map((entry) => (
              <li key={entry.title} className="changelog-item">
                <span className="changelog-dot" aria-hidden="true" />
                <div>
                  <strong>{entry.title}</strong>
                  <span>{entry.date}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="cta">
        <div className="cta-glow" aria-hidden="true">
          <div className="glow-layer" />
          <div className="glow-layer is-soft" />
        </div>
        <div className="wrap cta-inner">
          <h2>Forward one email.</h2>
          <p>
            Sherlock opens a case, reads the merchant&apos;s policy, and tells you whether you are
            owed anything — or that you are not.
          </p>
          <Link href="/app" className="lbtn lbtn-invert">
            Try Sherlock
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ------------------------------------------------------------- fragments

function delay(ms: number): React.CSSProperties {
  return { '--delay': `${ms}ms` } as React.CSSProperties;
}

function Nav() {
  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          <Logo size={22} />
          <span>Sherlock</span>
        </Link>
        <div className="nav-links">
          {NAV.map((item) =>
            item.external ? (
              <a key={item.label} href={item.href} target="_blank" rel="noreferrer noopener">
                {item.label}
              </a>
            ) : (
              <a key={item.label} href={item.href}>
                {item.label}
              </a>
            )
          )}
        </div>
        <div className="nav-actions">
          <Link href="/app" className="nav-signin">
            Sign in
          </Link>
          <Link href="/app" className="lbtn lbtn-primary lbtn-sm">
            Open Sherlock
          </Link>
        </div>
      </div>
    </nav>
  );
}

/** The hero product frame: a rendered Sherlock inbox, not a screenshot. */
function DashboardFrame() {
  const rows = [
    { title: 'Wireless headphones — example merchant', meta: 'Order #112-9988 · £284.00', status: 'Waiting for your approval', tone: 'attention' },
    { title: 'Flight LHR → CDG, 14 Oct', meta: 'Booking REF 7K2Q1 · £186.40', status: 'Investigating the web', tone: 'working' },
    { title: 'Annual plan renewal', meta: 'Invoice 2026-0912 · £96.00', status: 'Resolved', tone: 'positive' },
    { title: 'Standing desk — example store', meta: 'Order #41-2201 · £349.00', status: 'Waiting for a reply', tone: 'working' },
  ];
  return (
    <div className="frame" role="img" aria-label="An example Sherlock inbox">
      <div className="frame-side">
        <div className="frame-brand">
          <Logo size={16} />
          <span>Sherlock</span>
        </div>
        {['Inbox', 'Investigations', 'Claims', 'Activity', 'Ask Sherlock', 'Settings'].map((item, i) => (
          <span key={item} className={`frame-nav${i === 0 ? ' is-active' : ''}`}>
            {item}
            {item === 'Claims' && <span className="frame-badge">1</span>}
          </span>
        ))}
      </div>
      <div className="frame-main">
        <div className="frame-title">Inbox</div>
        <div className="frame-sub">Forward any receipt or booking to you@sherlock.example</div>
        <div className="frame-stats">
          <div className="frame-stat">
            <span className="is-positive">£96.00</span>
            <small>Confirmed recovered</small>
          </div>
          <div className="frame-stat">
            <span className="is-attention">£55.00</span>
            <small>Claimed, awaiting reply</small>
          </div>
          <div className="frame-stat">
            <span>£38.00</span>
            <small>Potential, not yet claimed</small>
          </div>
          <div className="frame-stat">
            <span>3</span>
            <small>Open investigations</small>
          </div>
        </div>
        <div className="frame-rows">
          {rows.map((row) => (
            <div key={row.title} className="frame-row">
              <div>
                <strong>{row.title}</strong>
                <small>{row.meta}</small>
              </div>
              <span className={`frame-pill is-${row.tone}`}>
                <span className="frame-pill-dot" />
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InboxVisual() {
  return (
    <div className="vcard">
      <div className="vcard-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="vcard-bar-title">you@sherlock.example</span>
      </div>
      <div className="thread">
        <div className="msg is-in">
          <div className="msg-head">
            <strong>you@gmail.example</strong>
            <span>Fwd: Your order has shipped</span>
          </div>
          <p>
            ---------- Forwarded message ---------
            <br />
            From: orders@merchant.example
            <br />
            Order #112-9988 · Total £284.00
          </p>
        </div>
        <div className="msg is-system">
          <span className="pillmark" />
          Investigation opened · merchant.example
        </div>
        <div className="msg is-out">
          <div className="msg-head">
            <strong>To support@merchant.example</strong>
            <span>Price adjustment request — order #112-9988</span>
          </div>
          <p>
            Your returns page states that price adjustments are honoured within 14 days of purchase.
            The item is now listed at £229.00 …
          </p>
          <em>Sent via Sherlock.</em>
        </div>
        <div className="msg is-in">
          <div className="msg-head">
            <strong>support@merchant.example</strong>
            <span>Re: Price adjustment request</span>
          </div>
          <p>We&apos;ve refunded the £55.00 difference to your original payment method.</p>
        </div>
        <div className="msg is-system is-positive">
          <span className="pillmark" />
          Resolved · £55.00 confirmed recovered
        </div>
      </div>
    </div>
  );
}

function EvidenceVisual() {
  return (
    <div className="vcard">
      <div className="vcard-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="vcard-bar-title">merchant.example · 3 sources read</span>
      </div>
      <div className="funnel">
        <div className="funnel-col">
          <span className="mini-eyebrow">Searches</span>
          <div className="funnel-item">merchant refund policy <em>site:merchant.example</em></div>
          <div className="funnel-item">merchant price adjustment <em>site:merchant.example</em></div>
          <div className="funnel-item">merchant support contact <em>site:merchant.example</em></div>
        </div>
        <div className="funnel-arrow" aria-hidden="true">
          →
        </div>
        <div className="funnel-col">
          <span className="mini-eyebrow">Pages</span>
          <div className="funnel-item">/help/returns</div>
          <div className="funnel-item">/help/price-promise</div>
          <div className="funnel-item is-muted">/help/contact</div>
        </div>
        <div className="funnel-arrow" aria-hidden="true">
          →
        </div>
        <div className="funnel-col is-wide">
          <span className="mini-eyebrow">Evidence</span>
          <div className="ev">
            <span className="ev-kind">policy</span>
            <strong>Price adjustments honoured within 14 days.</strong>
            <span className="ev-quote">
              &ldquo;If an item goes on sale within 14 days, contact us for a refund of the difference.&rdquo;
            </span>
            <span className="ev-src">merchant.example/help/returns ↗</span>
          </div>
          <div className="ev">
            <span className="ev-kind">price</span>
            <strong>Now £229.00 — £55.00 below what was paid.</strong>
            <span className="ev-src">merchant.example/product ↗</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalVisual() {
  return (
    <div className="vcard">
      <div className="vcard-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="vcard-bar-title">case · waiting for your approval</span>
      </div>
      <div className="approval">
        <div className="approval-draft">
          <div className="approval-field">
            <label>To</label>
            <span>support@merchant.example</span>
          </div>
          <div className="approval-field">
            <label>Subject</label>
            <span>Price adjustment request — order #112-9988</span>
          </div>
          <pre>
{`Hello,

I bought a pair of wireless headphones on 6 September (order #112-9988) for £284.00. Your returns page states that price adjustments are honoured within 14 days of purchase, and the same item is now listed at £229.00.

Could you refund the £55.00 difference to my original payment method?

Thank you.

Sent via Sherlock.`}
          </pre>
          <div className="approval-actions">
            <span className="lbtn lbtn-primary lbtn-sm">Approve and send</span>
            <span className="lbtn lbtn-secondary lbtn-sm">Reject</span>
            <small>Nothing is sent until you press approve.</small>
          </div>
        </div>
        <div className="approval-side">
          <span className="mini-eyebrow">After sending</span>
          <div className="monitor-row">
            <strong>Reply chase</strong>
            <span>in 5 days · 2 checks left</span>
          </div>
          <div className="monitor-row">
            <strong>Page watch</strong>
            <span>merchant.example/product · daily</span>
          </div>
          <div className="monitor-log">
            <span>Day 1 · baseline captured</span>
            <span>Day 6 · no change</span>
            <span className="is-brand">Day 9 · page changed →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StateMachineVisual() {
  const chain = ['RECEIVED', 'PARSING', 'INVESTIGATING', 'EVIDENCE_FOUND', 'REASONING', 'CLAIM_READY', 'AWAITING_APPROVAL', 'SENT', 'WAITING_FOR_REPLY', 'RESOLVED'];
  return (
    <div className="sm" role="img" aria-label="The investigation state machine">
      <ol className="sm-chain">
        {chain.map((state) => (
          <li
            key={state}
            className={`sm-node${state === 'AWAITING_APPROVAL' ? ' is-gate' : ''}${state === 'SENT' ? ' is-sent' : ''}`}
          >
            {state}
          </li>
        ))}
      </ol>
      <div className="sm-note">
        <span className="sm-gate-mark" aria-hidden="true" />
        <span>
          <strong>AWAITING_APPROVAL → SENT</strong> is the only edge into SENT. It is a tested
          invariant, and the send function has no public caller.
        </span>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-inner">
        <div className="foot-brand">
          <Logo size={22} />
          <span>Sherlock</span>
          <p>Give your inbox a browser.</p>
        </div>
        <div className="foot-cols">
          {FOOTER.map((col) => (
            <div key={col.heading} className="foot-col">
              <h4>{col.heading}</h4>
              <ul>
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith('/') ? (
                      <Link href={href}>{label}</Link>
                    ) : (
                      <a href={href} target="_blank" rel="noreferrer noopener">
                        {label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="wrap foot-bottom">
        <span className="foot-status">
          <span className="foot-status-dot" aria-hidden="true" />
          Static export, served by Convex
        </span>
        <span>MIT licensed · Built on Convex with AgentMail, Firecrawl and OpenAI</span>
      </div>
    </footer>
  );
}
