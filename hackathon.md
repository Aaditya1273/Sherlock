# Sherlock — build log

**Convex All Gas Hackathon** · sponsored by OpenAI, Firecrawl and AgentMail

---

## 1. Product

**Sherlock — Give Your Inbox a Browser.**

An email-native agent. Forward any receipt, booking or billing email to your Sherlock address; Sherlock reads the transaction, researches the merchant's own published policies, builds traceable evidence, decides whether you are actually owed something, drafts the claim, and waits for you to approve it before anything is sent.

## 2. Problem

The entitlement is public and the workflow is manual. A refund window, a price-adjustment clause, a cancellation right — all written down on a page anyone can open. What stops people claiming is the twenty minutes between reading the email and acting on it. Nobody spends that on $14, so the $14 stays with the merchant.

## 3. Why Sherlock

Prior attempts in this space (Trim, Paribus) needed bank or card access, which is a large trust ask for a small recovery. Sherlock needs one forwarded email. It reads public policy pages, not your finances, and it never contacts a company without you reading the message first.

## 4. User workflow

1. Create a Sherlock inbox in Settings (AgentMail).
2. Forward a purchase, booking or billing email to it.
3. Watch the case open and advance live on the dashboard.
4. Read the evidence — every card links the page and quotes the clause.
5. Read the draft, edit it if you want, approve or reject.
6. On approval, Sherlock sends from your inbox; replies return to the same thread and move the case to its outcome.

## 5. Architecture

```
You → AgentMail inbox → signed webhook → Convex
                                          ├─ idempotent ingest → Investigation
                                          ├─ pipeline action
                                          │    ├─ OpenAI: extract transaction
                                          │    ├─ Firecrawl: search + scrape policy
                                          │    ├─ OpenAI: evidence extraction
                                          │    ├─ OpenAI: eligibility assessment
                                          │    └─ OpenAI: claim draft
                                          ├─ AWAITING_APPROVAL ─── human ───┐
                                          ├─ AgentMail send ←───────────────┘
                                          ├─ reply → classify → outcome
                                          └─ cron: monitor sweep
                                               ↓
                                     live queries → UI
```

Full diagrams (architecture, state machine, Firecrawl flow, AgentMail sequence, data model) are in [README.md](./README.md).

## 6. Convex usage

Convex is the backend, not a database behind an API.

- **Schema** — 11 tables, every query index-backed. The `status` validator is generated from the state machine module, so the schema cannot accept a state the machine does not know.
- **Reactive queries** — `investigations.list/get/stats/activity`, `claims.listPending`, `emails.listInbox`. The progress rail, the counters and the sidebar approval badge are subscriptions. There is no polling and no simulated progress anywhere in the frontend.
- **Mutations** — every state change. `helpers.setStatus` is the only writer of `status`; it validates the transition and appends the timeline event in the same transaction.
- **Internal functions** — the pipeline, the AgentMail send, and everything touching secrets are `internal*` and unreachable from a browser.
- **Actions** — `sherlock/pipeline.investigate` orchestrates a case end to end, committing each stage through a mutation before the next begins, so a retry resumes from persisted state rather than redoing the case. A cooperative `lockedUntil` lease stops a retry running a second copy.
- **Scheduler** — the webhook hands off with `ctx.scheduler.runAfter(0, ...)`, so the HTTP response is immediate and the work is durable.
- **Crons** — hourly monitor sweep (the alive layer), 12-hourly session purge, daily web-source pruning. Each bounded per run.
- **HTTP actions** — the signed AgentMail inbound webhook, and a health probe.
- **Components** — `@convex-dev/self-static-hosting`, app-owned routing so `/api/*` keeps its exact paths under the SPA catch-all.
- **Auth** — server-side `requireOwner` on every case-data function, sessions in Convex with hashed tokens and a cron-swept TTL.

## 7. OpenAI usage

Five distinct structured calls, each with a strict JSON schema and each permitted to return nothing:

| Call | Job | Can answer |
|---|---|---|
| `extraction.run` | Email → transaction fields | `null` per field; "not transactional" |
| `research.run` | Page → clauses relevant to *this* transaction | empty list |
| `reasoning.assess` | Is there actually a case? | **no** |
| `reasoning.draft` | Write the claim | only runs after a yes |
| `replies.analyze` | What did the merchant say? | "acknowledged", not "accepted" |

Assessment and drafting are deliberately separate calls. A model asked to assess-and-draft in one breath will find a case, because drafting is the task. Splitting them is what lets "you are not owed anything here" be a normal outcome — and it is: `REASONING → RESOLVED` is a first-class edge in the state machine.

Model output is validated before it is stored, and no model call can send anything.

## 8. Firecrawl usage

Firecrawl is the browser, used in two modes:

- **Discovery** — three targeted `search` queries per case (refund policy, price adjustment, support contact), scoped with `site:` to the merchant's domain so the source is the merchant's own policy.
- **Reading** — `scrape` to markdown, `onlyMainContent`, at most four pages per case, cached in `webSources`.
- **The alive layer** — active monitors re-scrape with `maxAge: 0` on an hourly cron sweep and compare a content hash. An unchanged page costs one scrape and **zero** model calls; only a real change writes an event. Monitors are bounded by `remainingRuns` and switch off when their case resolves.

## 9. AgentMail usage

The inbox is the product surface:

- **Inbound** — a signed webhook at `/api/agentmail/inbound` is the front door for the entire app. It verifies the shared secret before parsing the body, deduplicates by provider message id, and is answered 200 once accepted so a downstream failure surfaces as a visible failed investigation rather than a retry storm.
- **Threading** — a merchant's reply is routed back onto the case by thread id, not into a new investigation. Follow-ups reply in-thread via the message-reply endpoint.
- **Outbound** — `agentMail.send` is an `internalAction` with no public caller. `sentAt` and the `SENT` transition are written only after AgentMail confirms.

## 10. Investigation state machine

14 states, in `convex/core/states.ts` — pure TypeScript, no Convex imports, unit tested directly.

```
RECEIVED → PARSING → INVESTIGATING → EVIDENCE_FOUND → REASONING
  → CLAIM_READY → AWAITING_APPROVAL → SENT → WAITING_FOR_REPLY
  → REPLY_RECEIVED → FOLLOW_UP_READY → RESOLVED
  (+ PAUSED, FAILED, and REASONING → RESOLVED for "no case")
```

The tested invariant that matters: **no state except `AWAITING_APPROVAL` has an edge to `SENT`**. The frontend imports the same module, so enforced states and displayed labels cannot drift.

## 11. Schema overview

`investigations` (the central object) · `emails` · `evidence` · `claims` · `events` · `monitors` · `webSources` · `inboxes` · `sessions` · `chatMessages` · `settings`.

`potentialAmount` and `recoveredAmount` are separate columns so an estimate can never be rendered as money received.

## 12. Realtime behaviour

Open a case and forward an email in another tab: the row appears, the status pill moves through *Reading the email → Investigating the web → Evidence found → Weighing the evidence → Claim drafted → Waiting for your approval*, evidence cards appear as Firecrawl and OpenAI produce them, and the timeline grows. All of it is Convex subscriptions reacting to persisted state. Nothing is animated on a timer.

## 13. Scheduled workflows

`sherlock monitor sweep` (hourly) re-reads watched pages and chases unanswered claims. A claim with no reply after five days produces a drafted nudge and moves the case to `FOLLOW_UP_READY` — which still requires approval. Sherlock does not chase on its own.

## 14. Security and trust model

- External content — forwarded mail, scraped pages, merchant replies — passes through `core/untrusted.ts` before any model sees it: zero-width/bidi stripping, neutralisation of instruction-shaped spans, fence-breakout closure, and wrapping in a labelled untrusted block. Detected attempts are surfaced in the UI as *Suspicious content blocked*.
- A human approves every outbound email, enforced by the state machine and by `send` being internal-only — not by a prompt.
- Every case-data function calls `requireOwner` on the server; the React guard is cosmetic.
- Webhook verified by shared secret before the body is parsed; inbound mail is refused entirely when the secret is unconfigured.
- Outbound email is disabled while the deployment has no passcode, so an unconfigured instance cannot mail a stranger.
- Secrets stay in the Convex environment; the browser learns only whether a key is present. Event details are redacted before storage.
- Rate limits: 25 outbound emails/day, 4 scrapes/case, 10 monitors/sweep, bounded `remainingRuns`.

## 15. Deployment

Frontend served by the Convex deployment via `@convex-dev/self-static-hosting`:

```bash
npx convex deploy    # backend
npm run deploy       # build + upload frontend
```

## 16. Live URL

_Not yet deployed from this environment._ Deploying requires Convex authentication (`npx convex dev`), which was not available here. The deployment path is configured and the commands are above.

## 17. Demo video

_To be recorded._

## 18. Development timeline

The build history is the repository's own git log. No dates are asserted here that the log does not support.

## 19. What was built

- `convex/core/states.ts` — the investigation state machine (+ tests)
- `convex/core/untrusted.ts` — prompt-injection boundary (+ tests)
- `convex/core/email.ts` — forwarding, merchant inference, idempotency keys (+ tests)
- `convex/schema.ts` — rewritten around investigations, evidence and claims
- `convex/auth.ts` — server-side authorization, sessions, passcode
- `convex/investigations.ts`, `claims.ts`, `emails.ts`, `helpers.ts`, `chat.ts`, `maintenance.ts`
- `convex/sherlock/` — pipeline, extraction, research, reasoning, replies, monitor, firecrawl, llm
- `convex/http.ts` — rewritten as a signed webhook plus health, replacing an open REST API
- `convex/crons.ts` — monitoring and housekeeping
- The entire `src/` frontend: landing page, inbox, investigations, case file, claims queue, activity, chat, settings, sign-in, and the design system
- `convex/agentMail.ts` — AgentMail inbox, threading and internal-only send
- `vite.config.ts`, `eslint.config.js`, `tsconfig.json` — build and lint setup

The product surface is deliberately small: six screens, one domain object, and no admin tooling. Anything that did not serve the forward-investigate-approve loop was left out.

## 20. Known limitations

- Single owner per deployment. `ownerKey` is threaded through the schema and every query, but sign-in is one passcode.
- Retail and travel email is the tuned wedge; other categories work but the policy queries are less targeted.
- Research reads at most four pages per case — a cost decision, so a deeply buried clause can be missed.
- `recoveredAmount` reflects what a merchant's reply confirmed, or what you entered by hand. Sherlock has no bank or card access.
- Reply classification is a model call; if it fails the case stays in `REPLY_RECEIVED` for you to read, rather than guessing.
- AgentMail payload field names are read defensively across known shapes; a genuinely new shape needs a small change in `http.ts`.
- **Not yet deployed, and the end-to-end path has not been exercised against live AgentMail, Firecrawl or OpenAI**, because this environment had no credentials for them. Unit tests cover the pure logic (state machine, injection boundary, ingestion and idempotency); the integration boundaries are typed and isolated but unverified against the real services.
