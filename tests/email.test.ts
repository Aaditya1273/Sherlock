import { describe, expect, it } from 'vitest';
import {
  emailDomain,
  extractUrls,
  inboundKey,
  inferMerchantDomain,
  isConsumerDomain,
  isReplyableAddress,
  normalizeEmail,
  parseForwarded,
  rootDomain,
  stripForwardPrefixes,
  stripQuotedReply,
} from '../convex/core/email';

/**
 * Ingestion correctness. Two failures here are expensive: a wrong merchant
 * domain sends a claim to the wrong company, and a broken dedupe key opens a
 * duplicate investigation on every webhook retry.
 */

describe('address parsing', () => {
  it('unwraps display names and normalises case', () => {
    expect(normalizeEmail('Amazon Orders <Auto-Confirm@AMAZON.com>')).toBe(
      'auto-confirm@amazon.com'
    );
    expect(emailDomain('a@shop.example.co.uk')).toBe('shop.example.co.uk');
  });

  it('knows consumer mail hosts from merchant domains', () => {
    expect(isConsumerDomain('gmail.com')).toBe(true);
    expect(isConsumerDomain('amazon.com')).toBe(false);
  });

  it('reduces a subdomain to something a person would call the merchant', () => {
    expect(rootDomain('mail.notifications.amazon.com')).toBe('amazon.com');
    expect(rootDomain('shop.marks.co.uk')).toBe('marks.co.uk');
    expect(rootDomain('amazon.com')).toBe('amazon.com');
  });

  it('will not reply to a no-reply address', () => {
    expect(isReplyableAddress('no-reply@amazon.com')).toBe(false);
    expect(isReplyableAddress('donotreply@shop.com')).toBe(false);
    expect(isReplyableAddress('support@shop.com')).toBe(true);
  });
});

describe('forwarded mail', () => {
  const forwarded = [
    'Subject: Fwd: Your order has shipped',
    '',
    '---------- Forwarded message ---------',
    'From: Acme Store <orders@acmestore.com>',
    'Date: Mon, 3 Mar 2025 at 10:02',
    'Subject: Your order has shipped',
    'To: me@gmail.com',
    '',
    'Order #112-9988 total $84.00',
  ].join('\n');

  it('recovers the original sender and subject', () => {
    const result = parseForwarded('Fwd: Your order has shipped', forwarded);
    expect(result.isForwarded).toBe(true);
    expect(result.originalFrom).toBe('orders@acmestore.com');
    expect(result.originalSubject).toBe('Your order has shipped');
  });

  it('prefers the forwarded merchant over the forwarding user', () => {
    // The webhook sees the user's own Gmail address as `from`; the merchant
    // is only discoverable inside the quoted header block.
    const domain = inferMerchantDomain({
      fromEmail: 'me@gmail.com',
      forwardedFrom: 'orders@acmestore.com',
    });
    expect(domain).toBe('acmestore.com');
  });

  it('falls back to a link in the body when no merchant address exists', () => {
    const domain = inferMerchantDomain({
      fromEmail: 'me@gmail.com',
      bodyUrls: ['https://www.acmestore.com/orders/112'],
    });
    expect(domain).toBe('acmestore.com');
  });

  it('returns nothing rather than guessing a consumer domain', () => {
    expect(inferMerchantDomain({ fromEmail: 'me@gmail.com' })).toBeUndefined();
  });

  it('strips stacked forwarding prefixes', () => {
    expect(stripForwardPrefixes('Re: Fwd: RE: Your receipt')).toBe('Your receipt');
  });
});

describe('webhook idempotency', () => {
  const base = {
    inboxId: 'inbox_1',
    fromEmail: 'me@gmail.com',
    subject: 'Fwd: receipt',
    receivedAt: 1_700_000_000_000,
  };

  it('is stable for the same provider message id', () => {
    const a = inboundKey({ ...base, messageId: 'msg_abc' });
    const b = inboundKey({ ...base, messageId: 'msg_abc', receivedAt: base.receivedAt + 5_000 });
    expect(a).toBe(b);
  });

  it('separates genuinely different messages', () => {
    expect(inboundKey({ ...base, messageId: 'msg_a' })).not.toBe(
      inboundKey({ ...base, messageId: 'msg_b' })
    );
  });

  it('still de-duplicates a retry when the provider sends no id', () => {
    // Same message, retried a few seconds later, no message id available.
    const first = inboundKey(base);
    const retry = inboundKey({ ...base, receivedAt: base.receivedAt + 30_000 });
    expect(first).toBe(retry);

    const different = inboundKey({ ...base, subject: 'Fwd: another receipt' });
    expect(first).not.toBe(different);
  });
});

describe('reply text', () => {
  it('drops quoted history so only the new message is analysed', () => {
    const reply = [
      'We have issued a refund of $14.20.',
      '',
      'On Mon, 3 Mar 2025 at 10:02, Sherlock wrote:',
      '> I am writing about order 112-9988...',
    ].join('\n');
    expect(stripQuotedReply(reply)).toBe('We have issued a refund of $14.20.');
  });

  it('keeps the body when there is nothing to strip', () => {
    expect(stripQuotedReply('Thanks, we will look into it.')).toBe(
      'Thanks, we will look into it.'
    );
  });
});

describe('url extraction', () => {
  it('dedupes and trims trailing punctuation', () => {
    const urls = extractUrls('See https://a.com/x. Also https://a.com/x and https://b.com/y)');
    expect(urls).toEqual(['https://a.com/x', 'https://b.com/y']);
  });
});
