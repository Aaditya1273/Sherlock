import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { callModel, objectSchema, nullableString, nullableNumber, opt } from './llm';
import { asDataBlock, sanitizeExternal } from '../core/untrusted';
import {
  emailDomain,
  inferMerchantDomain,
  isConsumerDomain,
  isReplyableAddress,
  normalizeEmail,
  parseForwarded,
  rootDomain,
} from '../core/email';

/**
 * Step 1 — read the email.
 *
 * Turns a forwarded message into structured transaction facts. The model is
 * told explicitly to return null rather than guess: a hallucinated order
 * number would end up quoted at a real merchant.
 */

interface Extracted {
  merchant_name: string | null;
  merchant_domain: string | null;
  contact_email: string | null;
  product_name: string | null;
  order_id: string | null;
  amount: number | null;
  currency: string | null;
  purchase_date: string | null;
  category: string;
  summary: string;
  is_transactional: boolean;
}

const SCHEMA = objectSchema('transaction_extraction', {
  merchant_name: { ...nullableString, description: 'Company the user transacted with' },
  merchant_domain: { ...nullableString, description: 'Their website domain, e.g. amazon.com' },
  contact_email: { ...nullableString, description: 'A support address a human would read. Null for no-reply addresses.' },
  product_name: { ...nullableString, description: 'What was bought or booked' },
  order_id: { ...nullableString, description: 'Order/booking/confirmation number, verbatim' },
  amount: { ...nullableNumber, description: 'Total paid, as a number' },
  currency: { ...nullableString, description: 'ISO code, e.g. USD, EUR, INR' },
  purchase_date: { ...nullableString, description: 'ISO 8601 date if stated' },
  category: {
    type: 'string',
    enum: ['purchase', 'booking', 'subscription', 'cancellation', 'delivery', 'billing', 'other'],
  },
  summary: { type: 'string', description: 'One sentence on what this email is' },
  is_transactional: {
    type: 'boolean',
    description: 'False for newsletters, marketing and personal mail',
  },
});

export const run = internalAction({
  args: { investigationId: v.id('investigations'), emailId: v.id('emails') },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const email = await ctx.runQuery(internal.emails.getInternal, { id: args.emailId });
    if (!email) return { ok: false, reason: 'Source email is missing.' };

    // Body is already sanitized at ingest; re-wrapping is what marks it as
    // data in the prompt.
    const block = asDataBlock(
      'FORWARDED EMAIL',
      sanitizeExternal(`Subject: ${email.subject}\nFrom: ${email.fromEmail}\n\n${email.body}`, 12_000)
    );

    const result = await callModel<Extracted>({
      instruction:
        'Read this forwarded email and extract the transaction it describes. ' +
        'Use only what the email actually states. If a field is not present, return null for it — ' +
        'do not infer an order number, a price, or a support address that is not written down.',
      context: block,
      schema: SCHEMA,
      maxTokens: 700,
    });

    if (!result.is_transactional) {
      return {
        ok: false,
        reason:
          'This looks like a newsletter or personal message rather than a purchase or booking, so there is nothing to claim.',
      };
    }

    // Trust our own parse of the envelope over the model for the domain: the
    // headers are ground truth and the model is guessing from prose.
    const forwarded = parseForwarded(email.subject, email.body);
    const parsedDomain = inferMerchantDomain({
      fromEmail: email.fromEmail,
      forwardedFrom: forwarded.originalFrom,
    });
    const modelDomain = opt(result.merchant_domain);
    const merchantDomain =
      parsedDomain ??
      (modelDomain && !isConsumerDomain(modelDomain) ? rootDomain(modelDomain) : undefined);

    // Only keep a contact address a person might actually read, and only if
    // it belongs to the merchant — never mail an unrelated domain.
    const candidateContact = opt(result.contact_email) ?? forwarded.originalFrom;
    const contactEmail =
      candidateContact &&
      isReplyableAddress(candidateContact) &&
      (!merchantDomain || rootDomain(emailDomain(candidateContact)) === merchantDomain)
        ? normalizeEmail(candidateContact)
        : undefined;

    const purchasedAt = parseDate(opt(result.purchase_date));

    await ctx.runMutation(internal.investigations.applyExtraction, {
      id: args.investigationId,
      title: buildTitle(opt(result.product_name), opt(result.merchant_name), email.subject),
      merchantName: opt(result.merchant_name),
      merchantDomain,
      contactEmail,
      productName: opt(result.product_name),
      orderId: opt(result.order_id),
      amount: opt(result.amount) ?? undefined,
      currency: opt(result.currency)?.toUpperCase(),
      purchasedAt,
    });

    await ctx.runMutation(internal.emails.markProcessed, { id: args.emailId });
    return { ok: true };
  },
});

function buildTitle(product?: string, merchant?: string, fallback?: string): string {
  if (product && merchant) return `${product} — ${merchant}`;
  return (product ?? merchant ?? fallback ?? 'Investigation').slice(0, 160);
}

function parseDate(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
