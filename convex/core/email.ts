/**
 * Email helpers.
 *
 * Pure string work: normalising addresses, unwrapping forwarded messages,
 * deriving a merchant domain, and building the idempotency key that stops a
 * retried webhook from opening a second investigation.
 */

/** Free/consumer mail hosts — never the merchant we want to write to. */
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'aol.com', 'zoho.com', 'gmx.com',
  'yandex.com', 'mail.com', 'fastmail.com', 'hey.com',
]);

/** Sender prefixes that carry no routing value. */
const NOREPLY_LOCALPARTS = /^(no-?reply|do-?not-?reply|notifications?|auto(mated)?|mailer|bounce|postmaster)/i;

export function normalizeEmail(address: string): string {
  const match = String(address ?? '').match(/<([^>]+)>/);
  const bare = (match ? match[1] : String(address ?? '')).trim().toLowerCase();
  return bare.replace(/^mailto:/, '');
}

export function emailDomain(address: string): string {
  const at = normalizeEmail(address).lastIndexOf('@');
  return at === -1 ? '' : normalizeEmail(address).slice(at + 1);
}

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.has(domain.toLowerCase());
}

/** Registrable-ish root, enough to name a merchant: "mail.amazon.co.uk" -> "amazon.co.uk". */
export function rootDomain(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const twoLevelTlds = new Set(['co.uk', 'com.au', 'co.in', 'co.jp', 'com.br', 'co.nz', 'com.sg']);
  const lastTwo = parts.slice(-2).join('.');
  return twoLevelTlds.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

export interface ForwardedOrigin {
  /** Address the original message came from, if the forward exposes one. */
  originalFrom?: string;
  /** Subject of the original message, forwarding prefixes stripped. */
  originalSubject?: string;
  /** True if the body looks like a forwarded message rather than a fresh one. */
  isForwarded: boolean;
}

const FORWARD_MARKERS = [
  /-{2,}\s*forwarded message\s*-{2,}/i,
  /^begin forwarded message:/im,
  /^-{3,}\s*original message\s*-{3,}/im,
];

/**
 * Pull the original sender out of a forwarded body.
 *
 * Users forward from Gmail/Apple Mail/Outlook, so the AgentMail `from` is the
 * user, not the merchant. The merchant identity is in the quoted header block.
 */
export function parseForwarded(subject: string, body: string): ForwardedOrigin {
  const isForwarded =
    /^\s*(fwd?|fw|tr|wg|rv)\s*:/i.test(subject ?? '') ||
    FORWARD_MARKERS.some((re) => re.test(body ?? ''));

  const result: ForwardedOrigin = { isForwarded };

  const fromLine = String(body ?? '').match(/^\s*(?:>\s*)?From:\s*(.+)$/im);
  if (fromLine) {
    const candidate = normalizeEmail(fromLine[1]);
    if (candidate.includes('@')) result.originalFrom = candidate;
  }

  const subjLine = String(body ?? '').match(/^\s*(?:>\s*)?Subject:\s*(.+)$/im);
  const rawSubject = subjLine ? subjLine[1] : subject;
  const cleaned = stripForwardPrefixes(rawSubject ?? '');
  if (cleaned) result.originalSubject = cleaned;

  return result;
}

export function stripForwardPrefixes(subject: string): string {
  let s = String(subject ?? '').trim();
  let previous: string;
  do {
    previous = s;
    s = s.replace(/^\s*(fwd?|fw|tr|wg|rv|re)\s*:\s*/i, '').trim();
  } while (s !== previous);
  return s;
}

/**
 * Best guess at the merchant domain for an inbound message.
 * Prefers the forwarded original sender over the forwarder's own address.
 */
export function inferMerchantDomain(args: {
  fromEmail: string;
  forwardedFrom?: string;
  bodyUrls?: string[];
}): string | undefined {
  const candidates = [args.forwardedFrom, args.fromEmail].filter(Boolean) as string[];
  for (const addr of candidates) {
    const domain = emailDomain(addr);
    if (!domain || isConsumerDomain(domain)) continue;
    const local = normalizeEmail(addr).split('@')[0];
    // A no-reply@ address is still a fine domain signal, just not a reply target.
    void NOREPLY_LOCALPARTS.test(local);
    return rootDomain(domain);
  }
  for (const url of args.bodyUrls ?? []) {
    const host = hostFromUrl(url);
    if (host && !isConsumerDomain(host)) return rootDomain(host);
  }
  return undefined;
}

/** An address is worth replying to only if a human might read it. */
export function isReplyableAddress(address: string): boolean {
  const normalized = normalizeEmail(address);
  if (!normalized.includes('@')) return false;
  return !NOREPLY_LOCALPARTS.test(normalized.split('@')[0]);
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function extractUrls(text: string, limit = 25): string[] {
  const matches = String(text ?? '').match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  return [...new Set(matches.map((u) => u.replace(/[.,;]+$/, '')))].slice(0, limit);
}

/**
 * Idempotency key for an inbound message.
 *
 * AgentMail retries webhooks, and a retry must never create a second
 * investigation. The provider message id is authoritative when present;
 * otherwise we fall back to a stable digest of the message's identity.
 */
export function inboundKey(args: {
  messageId?: string;
  inboxId: string;
  fromEmail: string;
  subject: string;
  receivedAt?: number;
}): string {
  if (args.messageId) return `msg:${args.messageId}`;
  const basis = [
    args.inboxId,
    normalizeEmail(args.fromEmail),
    stripForwardPrefixes(args.subject).toLowerCase(),
    // Bucket to the hour so genuine retries collide but distinct mails do not.
    Math.floor((args.receivedAt ?? 0) / 3_600_000),
  ].join('|');
  return `syn:${djb2(basis)}`;
}

/** Small non-cryptographic digest — used only for de-duplication keys. */
export function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Strip quoted history so a reply's new text is what gets analysed. */
export function stripQuotedReply(body: string): string {
  const lines = String(body ?? '').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*On .+ wrote:\s*$/i.test(line)) break;
    if (/^\s*-{2,}\s*(original message|forwarded message)/i.test(line)) break;
    if (/^\s*_{10,}\s*$/.test(line)) break;
    out.push(line);
  }
  const text = out.join('\n').trim();
  return text.length > 0 ? text : String(body ?? '').trim();
}
