import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Logo } from '../components/Logo';
import { CountUp, Reveal } from '../components/landing/motion';
import './Landing.css';

/**
 * Landing page.
 *
 * Long-form marketing page, light-only. Section order and rhythm follow a
 * conventional SaaS marketing layout: hero with a framed product shot and a
 * floating status card, logo cloud, manifesto with a marker highlight and
 * tilted detail cards, feature chapters (visual on a soft panel, three
 * sub-features, a principle card), an integrations grid on a dot field, a
 * stats block beside a rotating globe, a network diagram, an FAQ bento, a
 * changelog, a curved-top dark call to action, and a columned footer.
 *
 * Everything shown is true of the product. Visuals are rendered UI rather
 * than screenshots; the numbers are constants from the codebase; the quote
 * cards carry operating principles, not invented customers.
 *
 * Server component. Motion is handled by CSS plus two small client
 * primitives (Reveal, CountUp) in components/landing/motion.tsx.
 */

// ------------------------------------------------------------------ content

const NAV = [
  { href: '#inbox', label: 'Product' },
  { href: '#stack', label: 'Stack' },
  { href: '#limits', label: 'Trust' },
  { href: '#changelog', label: 'Changelog' },
  { href: 'https://github.com', label: 'GitHub', external: true },
];

const CHIPS = [
  { label: 'Inbox', glyph: '✉' },
  { label: 'Investigation', glyph: '⌕' },
  { label: 'Evidence', glyph: '¶' },
];

const LOGO_ROWS: { name: string; slug?: string }[][] = [
  [
    { name: 'AgentMail' },
    { name: 'Firecrawl' },
    { name: 'OpenAI' },
    { name: 'Convex', slug: 'convex' },
    { name: 'Next.js', slug: 'nextdotjs' },
  ],
  [
    { name: 'React', slug: 'react' },
    { name: 'TypeScript', slug: 'typescript' },
    { name: 'GitHub', slug: 'github' },
    { name: 'Vercel', slug: 'vercel' },
    { name: 'Geist' },
  ],
];

type Chapter = {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  link: string;
  visual: 'inbox' | 'evidence' | 'approval' | 'network';
  minis: { title: string; body: string }[];
  principle: { quote: string; source: string; tag: string };
};

const CHAPTERS: Chapter[] = [
  {
    id: 'inbox',
    eyebrow: 'Inbox',
    title: 'It starts with an email',
    lede: 'Forward any receipt, booking or billing email to your Sherlock address. That is the whole interaction — there is no form to fill and nothing to install.',
    link: 'Explore the inbox',
    visual: 'inbox',
    minis: [
      { title: 'Forward anything', body: 'Purchase confirmations, cancellations, subscription changes, billing notices. If it cost you money, it can be investigated.' },
      { title: 'Replies stay threaded', body: 'Claims go out from your Sherlock inbox, so a merchant reply lands back on the case that started it — never in a new one.' },
      { title: 'Retries are harmless', body: 'Every inbound message is deduplicated by id. A webhook delivered twice opens one case, not two.' },
    ],
    principle: {
      quote: 'Sherlock drafts. You approve. Nothing is sent without you reading it first.',
      source: 'Operating rule',
      tag: 'Enforced by the state machine',
    },
  },
  {
    id: 'investigation',
    eyebrow: 'Investigation',
    title: 'Read what the merchant published',
    lede: "Firecrawl searches for and reads the merchant's own refund, price-adjustment and cancellation pages — scoped to their domain, so the source is the policy, not a blog's summary of it.",
    link: 'See how evidence is built',
    visual: 'evidence',
    minis: [
      { title: 'Three targeted searches', body: 'Refund policy, price adjustment, support contact. Not a crawl of the whole site — the clause lives on a known kind of page.' },
      { title: 'Verbatim excerpts', body: 'Each evidence card carries the source URL and the exact wording it relies on. Click through and read the page Sherlock read.' },
      { title: 'Allowed to find nothing', body: 'A policy that exists but does not cover your case is a no. A closed window is a no. Sherlock closes the case and says so.' },
    ],
    principle: {
      quote: 'Assessment and drafting are separate model calls. The first is allowed to say no; the second only runs after a yes.',
      source: 'Reasoning design',
      tag: 'Why a thin case never becomes a confident letter',
    },
  },
  {
    id: 'approval',
    eyebrow: 'Approval and follow-through',
    title: 'Approve, send, and keep the case alive',
    lede: 'When the evidence supports a claim, Sherlock drafts the email and stops. You read it, edit it, and decide. Once sent, the case stays open until it reaches an outcome.',
    link: 'See the approval boundary',
    visual: 'approval',
    minis: [
      { title: 'A human sends every email', body: 'The only path to an outbound message is an authenticated approve action on a case in AWAITING_APPROVAL. There is no other edge.' },
      { title: 'Nothing is optimistic', body: 'The case is marked sent only after AgentMail confirms. A failed send leaves the draft intact and tells you nothing was delivered.' },
      { title: 'Watched pages, chased claims', body: 'A monitored price page is re-read daily and compared by hash. An unanswered claim gets a drafted nudge — never an automatic one.' },
    ],
    principle: {
      quote: 'Potential and recovered are separate figures. Money only counts as recovered once a merchant actually confirms it.',
      source: 'Dashboard rule',
      tag: 'How the totals avoid counting hope as cash',
    },
  },
  {
    id: 'security',
    eyebrow: 'Security',
    title: 'Untrusted by default',
    lede: "Sherlock's whole job is to read text written by strangers and then act on it. Every external input passes one boundary before any model sees it, and every case-data function authorises on the server.",
    link: 'Read the trust model',
    visual: 'network',
    minis: [
      { title: 'External text is data', body: 'Forwarded mail, scraped pages and replies are sanitised: zero-width characters stripped, instruction-shaped spans neutralised, the block labelled untrusted.' },
      { title: 'Authorised on the server', body: 'requireOwner is the single gate. The React guard hides UI; it protects nothing and is not relied upon.' },
      { title: 'Keys never reach the browser', body: 'Credentials live in the Convex environment. The client learns only whether one is present. Logged details are redacted first.' },
    ],
    principle: {
      quote: 'A page that tries to give the agent instructions gets classified as a fact about the page, flagged in your inbox, and never followed.',
      source: 'Injection boundary',
      tag: 'core/untrusted.ts, unit tested',
    },
  },
];

const STACK_TILES = [
  { name: 'AgentMail', slug: undefined, x: 8, y: 14, d: 0 },
  { name: 'Firecrawl', slug: undefined, x: 62, y: 6, d: 1.2 },
  { name: 'OpenAI', slug: undefined, x: 34, y: 42, d: 0.6 },
  { name: 'Convex', slug: 'convex', x: 70, y: 52, d: 1.8 },
  { name: 'Next.js', slug: 'nextdotjs', x: 12, y: 72, d: 0.9 },
  { name: 'TypeScript', slug: 'typescript', x: 48, y: 82, d: 1.5 },
];

const LIMITS = [
  { value: 14, label: 'investigation states' },
  { value: 1, label: 'edge into SENT — from approval' },
  { value: 4, label: 'pages read per case, at most' },
  { value: 25, label: 'outbound emails per day, at most' },
];

const FAQ = [
  { q: 'Will it email a company without asking me?', a: 'No. The state machine has exactly one edge into SENT and it starts from AWAITING_APPROVAL. Research and drafting are automatic; contacting anyone is not.' },
  { q: 'What if I am not actually owed anything?', a: 'That is a normal outcome. Reasoning can conclude there is no case, close the investigation, and tell you why — with the evidence it used.' },
  { q: 'Does it need my bank or card?', a: 'No. Sherlock reads one forwarded email and public policy pages. It has no access to your finances.' },
  { q: 'What happens if a page tells the agent to do something?', a: 'It gets classified as a fact about the page and flagged in your inbox as suspicious content. It is never followed.' },
  { q: 'How does a merchant reply reach the right case?', a: 'By thread id. Claims are sent from your Sherlock inbox, so the reply arrives on the same thread and is routed to the case that opened it.' },
  { q: 'What does "recovered" actually mean?', a: 'A figure a merchant confirmed in a reply, or one you entered by hand on the case. Estimates are labelled as estimates everywhere.' },
];

const CHANGELOG = [
  { date: 'Sep 15, 2026', title: 'Landing page rebuilt; frontend moved to Next.js' },
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

const css = (vars: Record<string, string | number>) => vars as CSSProperties;

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
            <span className="badge-arrow" aria-hidden="true">→</span>
          </Link>
          <h1 className="rise" style={css({ '--delay': '80ms' })}>
            Give your inbox a browser.
          </h1>
          <p className="hero-lede rise" style={css({ '--delay': '160ms' })}>
            Forward an email. Sherlock investigates the web, finds what you&apos;re entitled to,
            builds the evidence, and helps you act.
          </p>
          <div className="hero-actions rise" style={css({ '--delay': '240ms' })}>
            <Link href="/app" className="lbtn lbtn-primary">Try Sherlock</Link>
            <a href="#inbox" className="lbtn lbtn-secondary">See how it works</a>
          </div>
          <ul className="chips rise" style={css({ '--delay': '320ms' })}>
            {CHIPS.map((chip) => (
              <li key={chip.label} className="chip">
                <span className="chip-glyph" aria-hidden="true">{chip.glyph}</span>
                {chip.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-frame rise" style={css({ '--delay': '440ms', '--offset': '18px' })}>
          <div className="hero-aurora" aria-hidden="true" />
          <div className="wrap">
            <div className="frame-shell">
              <DashboardFrame />
              <div className="float-card" aria-hidden="true">
                <div className="float-card-head">
                  <span className="okmark" />
                  <strong>Claim approved</strong>
                </div>
                <p>Sent to support@merchant.example · asking for £55.00</p>
                <span className="float-card-meta">Waiting for a reply · reply chase in 5 days</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------ logo cloud */}
      <section className="logos" aria-label="Built with">
        <div className="wrap">
          {LOGO_ROWS.map((row, index) => (
            <Reveal key={index} className="logo-row" delay={index * 120}>
              {row.map((logo) => (
                <span key={logo.name} className="logo">
                  {logo.slug && (
                                        <img src={`https://cdn.simpleicons.org/${logo.slug}/9a9a9a`} alt="" width={20} height={20} loading="lazy" />
                  )}
                  {logo.name}
                </span>
              ))}
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- manifesto */}
      <section className="manifesto">
        <div className="wrap manifesto-inner">
          <aside className="manifesto-side is-left" aria-hidden="true">
            <Reveal className="tilt" delay={100}>
              <div className="tilt-card" style={css({ '--tilt': '-7deg' })}>
                <div className="tilt-img is-a" />
                <strong>Your order has shipped</strong>
                <span>orders@merchant.example · £284.00</span>
              </div>
            </Reveal>
            <Reveal className="tilt" delay={260}>
              <div className="tilt-card is-small" style={css({ '--tilt': '5deg' })}>
                <span className="mini-eyebrow">Policy</span>
                <span>&ldquo;…within 14 days of purchase.&rdquo;</span>
              </div>
            </Reveal>
          </aside>

          <Reveal className="manifesto-copy">
            <p className="manifesto-lead">
              The information is public.
              <br />
              The workflow is the problem.
            </p>
            <p className="manifesto-line">
              Sherlock is the{' '}
              <span className="marker">email-native agent that finds what you&apos;re owed</span>{' '}
              — and shows its work.
            </p>
            <p className="manifesto-rhythm">
              It reads. It researches. It cites.
              <br />
              And it stops before it sends.
            </p>
            <p className="manifesto-close">
              You deserve more than a refund policy you never read.
              <br />
              You deserve the £14.
            </p>
          </Reveal>

          <aside className="manifesto-side is-right" aria-hidden="true">
            <Reveal className="tilt" delay={180}>
              <div className="tilt-card is-small" style={css({ '--tilt': '6deg' })}>
                <span className="mini-eyebrow">Evidence</span>
                <span>Now £229 · was £284</span>
              </div>
            </Reveal>
            <Reveal className="tilt" delay={340}>
              <div className="tilt-card" style={css({ '--tilt': '-4deg' })}>
                <div className="tilt-img is-b" />
                <strong>Price adjustment request</strong>
                <span>Waiting for your approval</span>
              </div>
            </Reveal>
          </aside>
        </div>
      </section>

      {/* -------------------------------------------------- chapters 1 + 2 */}
      {CHAPTERS.slice(0, 2).map((chapter) => (
        <ChapterSection key={chapter.id} chapter={chapter} />
      ))}

      {/* ----------------------------------------------------- integrations */}
      <section id="stack" className="chapter is-muted">
        <div className="wrap integrations">
          <Reveal className="integrations-copy">
            <span className="eyebrow"><span className="eyebrow-dot" />Stack</span>
            <h2>Four systems, one agent</h2>
            <p>
              AgentMail is the inbox. Firecrawl is the browser. OpenAI is the reasoning. Convex is
              the memory and the live nervous system. Each does real work in the product.
            </p>
            <Link href="/app" className="text-link">Open Sherlock <span aria-hidden="true">→</span></Link>
          </Reveal>
          <Reveal className="dotfield" delay={120}>
            {STACK_TILES.map((tile) => (
              <div
                key={tile.name}
                className="tile"
                style={css({ '--x': `${tile.x}%`, '--y': `${tile.y}%`, '--d': `${tile.d}s` })}
              >
                {tile.slug ? (
                                    <img src={`https://cdn.simpleicons.org/${tile.slug}/171717`} alt="" width={22} height={22} loading="lazy" />
                ) : (
                  <span className="tile-mark">{tile.name.slice(0, 1)}</span>
                )}
                <span>{tile.name}</span>
              </div>
            ))}
            <div className="dotfield-centre" aria-hidden="true">
              <Logo size={26} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------- chapter 3 */}
      <ChapterSection chapter={CHAPTERS[2]} />

      {/* ---------------------------------------------------------- limits */}
      <section id="limits" className="chapter is-muted">
        <div className="wrap limits">
          <Reveal className="limits-copy">
            <span className="eyebrow"><span className="eyebrow-dot" />Built with limits</span>
            <h2>Bounded by construction</h2>
            <p>
              It writes to companies on your behalf. That deserves hard edges — enforced in the
              state machine and the schema, not in a prompt.
            </p>
            <dl className="limit-list">
              {LIMITS.map((limit, index) => (
                <div key={limit.label} className="limit" style={css({ '--i': index })}>
                  <dt><CountUp value={limit.value} /></dt>
                  <dd>{limit.label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal className="globe-wrap" delay={140}>
            <Globe />
            <div className="globe-chip" style={css({ '--x': '2%', '--y': '18%', '--d': '0s' })}>
              <span className="okmark" /> 36 tests passing
            </div>
            <div className="globe-chip" style={css({ '--x': '64%', '--y': '8%', '--d': '1.1s' })}>
              <span className="mono">SENT</span> has one inbound edge
            </div>
            <div className="globe-chip" style={css({ '--x': '58%', '--y': '74%', '--d': '0.6s' })}>
              Every query index-backed
            </div>
            <div className="globe-chip" style={css({ '--x': '0%', '--y': '68%', '--d': '1.7s' })}>
              Pipeline lock · <span className="mono">lockedUntil</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------- chapter 4 */}
      <ChapterSection chapter={CHAPTERS[3]} />

      {/* ------------------------------------------------------------- faq */}
      <section className="chapter is-muted">
        <div className="wrap">
          <Reveal className="chapter-head is-centered">
            <h2>Straight answers</h2>
            <p>The questions worth asking of anything that emails people for you.</p>
          </Reveal>
          <div className="bento">
            {FAQ.map((item, index) => (
              <Reveal key={item.q} as="article" className="bento-card" delay={index * 70}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- changelog */}
      <section id="changelog" className="chapter">
        <div className="wrap changelog">
          <Reveal className="changelog-copy">
            <h2>We ship fast</h2>
            <p>The build log is the git history. This mirrors it.</p>
            <Link href="/app" className="lbtn lbtn-secondary lbtn-sm">View changelog</Link>
          </Reveal>
          <ol className="changelog-list">
            {CHANGELOG.map((entry, index) => (
              <Reveal key={entry.title} as="li" className="changelog-item" delay={index * 80}>
                <span className="changelog-dot" aria-hidden="true" />
                <div>
                  <strong>{entry.title}</strong>
                  <span>{entry.date}</span>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="cta">
        <div className="cta-curve" aria-hidden="true" />
        <div className="cta-orb" aria-hidden="true" />
        <div className="wrap cta-inner">
          <Reveal>
            <h2>Forward one email.</h2>
          </Reveal>
          <Reveal delay={100}>
            <p>
              Sherlock opens a case, reads the merchant&apos;s policy, and tells you whether you
              are owed anything — or that you are not.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <Link href="/app" className="lbtn lbtn-invert">Try Sherlock</Link>
          </Reveal>
          <Reveal className="cta-dots" delay={320}>
            {LOGO_ROWS.flat().slice(0, 8).map((logo) => (
              <span key={logo.name} className="cta-dot" aria-hidden="true">
                {logo.slug ? (
                                    <img src={`https://cdn.simpleicons.org/${logo.slug}/ffffff`} alt="" width={14} height={14} loading="lazy" />
                ) : (
                  logo.name.slice(0, 1)
                )}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ------------------------------------------------------------- sections

function ChapterSection({ chapter }: { chapter: Chapter }) {
  return (
    <section id={chapter.id} className="chapter">
      <div className="wrap">
        <Reveal className="chapter-head">
          <span className="eyebrow"><span className="eyebrow-dot" />{chapter.eyebrow}</span>
          <h2>{chapter.title}</h2>
          <p>{chapter.lede}</p>
          <Link href="/app" className="text-link">{chapter.link} <span aria-hidden="true">→</span></Link>
        </Reveal>

        <Reveal className="panel" delay={80}>
          {chapter.visual === 'inbox' && <InboxVisual />}
          {chapter.visual === 'evidence' && <EvidenceVisual />}
          {chapter.visual === 'approval' && <ApprovalVisual />}
          {chapter.visual === 'network' && <NetworkVisual />}
        </Reveal>

        <div className="minis">
          {chapter.minis.map((mini, index) => (
            <Reveal key={mini.title} className="mini" delay={index * 90}>
              <h3>{mini.title}</h3>
              <p>{mini.body}</p>
              <Link href="/app" className="mini-link">Learn more <span aria-hidden="true">→</span></Link>
            </Reveal>
          ))}
        </div>

        <Reveal as="figure" className="principle" delay={120}>
          <blockquote>&ldquo;{chapter.principle.quote}&rdquo;</blockquote>
          <figcaption>
            <div className="principle-who">
              <Logo size={20} />
              <div>
                <strong>{chapter.principle.source}</strong>
                <span>{chapter.principle.tag}</span>
              </div>
            </div>
            <Link href="/app" className="text-link">Read the source <span aria-hidden="true">→</span></Link>
          </figcaption>
        </Reveal>
      </div>
    </section>
  );
}

function Nav() {
  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand"><Logo size={22} /><span>Sherlock</span></Link>
        <div className="nav-links">
          {NAV.map((item) =>
            item.external ? (
              <a key={item.label} href={item.href} target="_blank" rel="noreferrer noopener">{item.label}</a>
            ) : (
              <a key={item.label} href={item.href}>{item.label}</a>
            )
          )}
        </div>
        <div className="nav-actions">
          <Link href="/app" className="nav-signin">Sign in</Link>
          <Link href="/app" className="lbtn lbtn-primary lbtn-sm">Open Sherlock</Link>
        </div>
      </div>
    </nav>
  );
}

// -------------------------------------------------------------- visuals

/** The hero frame: a rendered Sherlock inbox, not a screenshot. */
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
        <div className="frame-brand"><Logo size={15} /><span>Sherlock</span></div>
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
          <div className="frame-stat"><span className="is-positive">£96.00</span><small>Confirmed recovered</small></div>
          <div className="frame-stat"><span className="is-attention">£55.00</span><small>Claimed, awaiting reply</small></div>
          <div className="frame-stat"><span>£38.00</span><small>Potential, not yet claimed</small></div>
          <div className="frame-stat"><span>3</span><small>Open investigations</small></div>
        </div>
        <div className="frame-chart" aria-hidden="true">
          <svg viewBox="0 0 600 90" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#1c3f5e" stopOpacity="0.18" />
                <stop offset="1" stopColor="#1c3f5e" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="chart-area" d="M0 70 C 60 62, 90 40, 150 46 S 250 78, 300 52 S 400 20, 460 34 S 560 60, 600 30 L600 90 L0 90 Z" fill="url(#chartFill)" />
            <path className="chart-line" d="M0 70 C 60 62, 90 40, 150 46 S 250 78, 300 52 S 400 20, 460 34 S 560 60, 600 30" fill="none" stroke="#1c3f5e" strokeWidth="2" />
          </svg>
          <div className="frame-chart-labels"><span>Evidence found</span><span>Claims sent</span><span>Recovered</span></div>
        </div>
        <div className="frame-rows">
          {rows.map((row, index) => (
            <div key={row.title} className="frame-row" style={css({ '--i': index })}>
              <div><strong>{row.title}</strong><small>{row.meta}</small></div>
              <span className={`frame-pill is-${row.tone}`}><span className="frame-pill-dot" />{row.status}</span>
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
      <div className="vcard-bar"><span className="dot" /><span className="dot" /><span className="dot" /><span className="vcard-bar-title">you@sherlock.example</span></div>
      <div className="thread">
        <div className="msg is-in" style={css({ '--i': 0 })}>
          <div className="msg-head"><strong>you@gmail.example</strong><span>Fwd: Your order has shipped</span></div>
          <p>---------- Forwarded message ---------<br />From: orders@merchant.example<br />Order #112-9988 · Total £284.00</p>
        </div>
        <div className="msg is-system" style={css({ '--i': 1 })}><span className="okmark is-brand" />Investigation opened · merchant.example</div>
        <div className="msg is-out" style={css({ '--i': 2 })}>
          <div className="msg-head"><strong>To support@merchant.example</strong><span>Price adjustment request — order #112-9988</span></div>
          <p>Your returns page states that price adjustments are honoured within 14 days of purchase. The item is now listed at £229.00 …</p>
          <em>Sent via Sherlock.</em>
        </div>
        <div className="msg is-in" style={css({ '--i': 3 })}>
          <div className="msg-head"><strong>support@merchant.example</strong><span>Re: Price adjustment request</span></div>
          <p>We&apos;ve refunded the £55.00 difference to your original payment method.</p>
        </div>
        <div className="msg is-system is-positive" style={css({ '--i': 4 })}><span className="okmark" />Resolved · £55.00 confirmed recovered</div>
      </div>
    </div>
  );
}

function EvidenceVisual() {
  return (
    <div className="vcard">
      <div className="vcard-bar"><span className="dot" /><span className="dot" /><span className="dot" /><span className="vcard-bar-title">merchant.example · 3 sources read</span></div>
      <div className="funnel">
        <div className="funnel-col">
          <span className="mini-eyebrow">Searches</span>
          <div className="funnel-item" style={css({ '--i': 0 })}>merchant refund policy <em>site:merchant.example</em></div>
          <div className="funnel-item" style={css({ '--i': 1 })}>merchant price adjustment <em>site:merchant.example</em></div>
          <div className="funnel-item" style={css({ '--i': 2 })}>merchant support contact <em>site:merchant.example</em></div>
        </div>
        <div className="funnel-arrow" aria-hidden="true"><span /></div>
        <div className="funnel-col">
          <span className="mini-eyebrow">Pages</span>
          <div className="funnel-item is-scan" style={css({ '--i': 3 })}>/help/returns</div>
          <div className="funnel-item is-scan" style={css({ '--i': 4 })}>/help/price-promise</div>
          <div className="funnel-item is-muted" style={css({ '--i': 5 })}>/help/contact</div>
        </div>
        <div className="funnel-arrow" aria-hidden="true"><span /></div>
        <div className="funnel-col is-wide">
          <span className="mini-eyebrow">Evidence</span>
          <div className="ev" style={css({ '--i': 6 })}>
            <span className="ev-kind">policy</span>
            <strong>Price adjustments honoured within 14 days.</strong>
            <span className="ev-quote">&ldquo;If an item goes on sale within 14 days, contact us for a refund of the difference.&rdquo;</span>
            <span className="ev-src">merchant.example/help/returns ↗</span>
          </div>
          <div className="ev" style={css({ '--i': 7 })}>
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
      <div className="vcard-bar"><span className="dot" /><span className="dot" /><span className="dot" /><span className="vcard-bar-title">case · waiting for your approval</span></div>
      <div className="approval">
        <div className="approval-draft">
          <div className="approval-field"><label>To</label><span>support@merchant.example</span></div>
          <div className="approval-field"><label>Subject</label><span>Price adjustment request — order #112-9988</span></div>
          <pre>{`Hello,

I bought a pair of wireless headphones on 6 September (order #112-9988) for £284.00. Your returns page states that price adjustments are honoured within 14 days of purchase, and the same item is now listed at £229.00.

Could you refund the £55.00 difference to my original payment method?

Thank you.

Sent via Sherlock.`}</pre>
          <div className="approval-actions">
            <span className="lbtn lbtn-primary lbtn-sm is-pulse">Approve and send</span>
            <span className="lbtn lbtn-secondary lbtn-sm">Reject</span>
            <small>Nothing is sent until you press approve.</small>
          </div>
        </div>
        <div className="approval-side">
          <span className="mini-eyebrow">After sending</span>
          <div className="monitor-row"><strong>Reply chase</strong><span>in 5 days · 2 checks left</span></div>
          <div className="monitor-row"><strong>Page watch</strong><span>merchant.example/product · daily</span></div>
          <div className="monitor-log">
            <span style={css({ '--i': 0 })}>Day 1 · baseline captured</span>
            <span style={css({ '--i': 1 })}>Day 6 · no change</span>
            <span style={css({ '--i': 2 })}>Day 8 · no change</span>
            <span className="is-brand" style={css({ '--i': 3 })}>Day 9 · page changed →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Centre node with four satellites and flowing connectors. */
function NetworkVisual() {
  const nodes = [
    { name: 'AgentMail', role: 'inbox', x: 12, y: 24 },
    { name: 'Firecrawl', role: 'browser', x: 82, y: 22 },
    { name: 'OpenAI', role: 'reasoning', x: 14, y: 76 },
    { name: 'Convex', role: 'memory', x: 84, y: 78 },
  ];
  return (
    <div className="network" role="img" aria-label="Sherlock's trust boundary between the four systems">
      <svg className="network-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {nodes.map((node, i) => (
          <path
            key={node.name}
            className="network-line"
            style={css({ '--i': i })}
            d={`M50 50 C ${(50 + node.x) / 2} 50, ${(50 + node.x) / 2} ${node.y}, ${node.x} ${node.y}`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="network-centre">
        <Logo size={26} />
        <span>Sherlock</span>
        <small>untrusted boundary</small>
      </div>
      {nodes.map((node, i) => (
        <div key={node.name} className="network-node" style={css({ '--x': `${node.x}%`, '--y': `${node.y}%`, '--d': `${i * 0.5}s` })}>
          <strong>{node.name}</strong>
          <span>{node.role}</span>
        </div>
      ))}
      <div className="network-tag" style={css({ '--x': '50%', '--y': '9%' })}>inbound → sanitise → classify</div>
      <div className="network-tag" style={css({ '--x': '50%', '--y': '91%' })}>outbound ← human approval</div>
    </div>
  );
}

/** Wireframe globe. Meridians sweep their rx to suggest rotation; SMIL, no JS. */
function Globe() {
  const meridians = [0, 1, 2, 3];
  return (
    <svg className="globe" viewBox="0 0 320 320" aria-hidden="true">
      <defs>
        <radialGradient id="globeShade" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ececec" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="160" r="150" fill="url(#globeShade)" stroke="#d4d4d4" />
      {[0.33, 0.66].map((k) => (
        <ellipse key={`p${k}`} cx="160" cy="160" rx="150" ry={150 * k} fill="none" stroke="#d4d4d4" strokeDasharray="2 3" />
      ))}
      <line x1="10" y1="160" x2="310" y2="160" stroke="#d4d4d4" strokeDasharray="2 3" />
      {meridians.map((m) => (
        <ellipse key={`m${m}`} cx="160" cy="160" ry="150" rx="150" fill="none" stroke="#c9c9c9">
          <animate attributeName="rx" values="150;0;150" dur="12s" begin={`${-(m * 3)}s`} repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.9;0.25;0.9" dur="12s" begin={`${-(m * 3)}s`} repeatCount="indefinite" />
        </ellipse>
      ))}
      {[
        [112, 96], [206, 128], [138, 214], [228, 222], [92, 176],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill="#ea580c" opacity="0.14">
            <animate attributeName="r" values="7;13;7" dur="3s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
          </circle>
          <circle cx={x} cy={y} r="3" fill="#ea580c" />
        </g>
      ))}
    </svg>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-inner">
        <div className="foot-brand">
          <div className="brand"><Logo size={22} /><span>Sherlock</span></div>
          <p>Give your inbox a browser.</p>
        </div>
        <div className="foot-cols">
          {FOOTER.map((col) => (
            <div key={col.heading} className="foot-col">
              <h4>{col.heading}</h4>
              <ul>
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith('/') ? <Link href={href}>{label}</Link> : <a href={href} target="_blank" rel="noreferrer noopener">{label}</a>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="wrap foot-bottom">
        <span className="foot-status"><span className="foot-status-dot" aria-hidden="true" />Static export, served by Convex</span>
        <span>MIT licensed · Built on Convex with AgentMail, Firecrawl and OpenAI</span>
      </div>
    </footer>
  );
}
