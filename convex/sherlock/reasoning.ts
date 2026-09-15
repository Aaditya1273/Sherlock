import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import { callModel, objectSchema, nullableString, nullableNumber, clampConfidence, opt } from './llm';
import { asDataBlock, sanitizeExternal } from '../core/untrusted';

/**
 * Step 3 — weigh the evidence, then draft.
 *
 * Two separate model calls on purpose. The first decides whether the customer
 * has a case at all and is allowed to answer "no"; the second only runs if
 * the answer was yes. Fusing them would let a drafting instinct manufacture
 * an entitlement, which is exactly the failure mode that makes this class of
 * product untrustworthy.
 *
 * Neither call can send anything. The draft lands in AWAITING_APPROVAL.
 */

const MIN_CONFIDENCE_TO_DRAFT = 0.45;

interface Assessment {
  has_case: boolean;
  claim_type: string | null;
  potential_amount: number | null;
  confidence: number;
  assessment: string;
  supporting_evidence_indexes: number[];
}

const ASSESSMENT_SCHEMA = objectSchema('eligibility_assessment', {
  has_case: {
    type: 'boolean',
    description: 'True only if the cited evidence actually entitles this customer to something',
  },
  claim_type: {
    ...nullableString,
    description: 'One of: price_adjustment, refund, return, cancellation_compensation, billing_correction, explanation',
  },
  potential_amount: { ...nullableNumber, description: 'Amount supported by the evidence, or null' },
  confidence: { type: 'number', description: '0 to 1' },
  assessment: {
    type: 'string',
    description: 'Two or three sentences a customer can read: what was found, and what it means for them',
  },
  supporting_evidence_indexes: {
    type: 'array',
    items: { type: 'integer' },
    description: 'Indexes of the evidence items that actually support the conclusion',
  },
});

interface Draft {
  subject: string;
  body: string;
  reasoning: string;
}

const DRAFT_SCHEMA = objectSchema('claim_draft', {
  subject: { type: 'string', description: 'Email subject line' },
  body: { type: 'string', description: 'The full email body, plain text, signed "Sent via Sherlock"' },
  reasoning: { type: 'string', description: 'One short paragraph telling the user why this should work' },
});

export const assess = internalAction({
  args: { investigationId: v.id('investigations') },
  returns: v.object({ hasCase: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ hasCase: boolean; reason?: string }> => {
    const investigation = await ctx.runQuery(internal.investigations.getInternal, {
      id: args.investigationId,
    });
    if (!investigation) return { hasCase: false, reason: 'Investigation is missing.' };

    const evidence: Doc<'evidence'>[] = await ctx.runQuery(
      internal.sherlock.research.listEvidence,
      { investigationId: args.investigationId }
    );

    if (evidence.length === 0) {
      await ctx.runMutation(internal.investigations.applyAssessment, {
        id: args.investigationId,
        assessment:
          'No published policy clause was found that applies to this transaction, so there is nothing to claim on your behalf.',
        confidence: 0,
      });
      return { hasCase: false, reason: 'No applicable policy found.' };
    }

    const result = await callModel<Assessment>({
      instruction:
        'Decide whether this customer is actually entitled to something.\n\n' +
        `Their transaction: ${describe(investigation)}\n\n` +
        'Rules: base the decision only on the evidence supplied. ' +
        'A policy that exists but does not cover this situation is a "no". ' +
        'A window that has already closed is a "no". ' +
        'Answering "no" is a correct and useful outcome — do not stretch to find a case. ' +
        'Only state an amount the evidence actually supports.',
      context: asDataBlock('EVIDENCE', sanitizeExternal(formatEvidence(evidence), 10_000)),
      schema: ASSESSMENT_SCHEMA,
      maxTokens: 800,
    });

    const confidence = clampConfidence(result.confidence) ?? 0;
    const potential = opt(result.potential_amount) ?? undefined;

    await ctx.runMutation(internal.investigations.applyAssessment, {
      id: args.investigationId,
      assessment: result.assessment,
      confidence,
      potentialAmount: result.has_case ? potential : undefined,
    });

    if (!result.has_case) {
      return { hasCase: false, reason: result.assessment };
    }
    if (confidence < MIN_CONFIDENCE_TO_DRAFT) {
      // Weak cases stop here rather than putting a shaky letter in front of
      // the user with an approve button next to it.
      return {
        hasCase: false,
        reason: `The evidence is too thin to justify writing to the merchant (confidence ${confidence.toFixed(2)}).`,
      };
    }
    return { hasCase: true };
  },
});

export const draft = internalAction({
  args: { investigationId: v.id('investigations') },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const investigation = await ctx.runQuery(internal.investigations.getInternal, {
      id: args.investigationId,
    });
    if (!investigation) return { ok: false, reason: 'Investigation is missing.' };

    if (!investigation.contactEmail) {
      return {
        ok: false,
        reason:
          'No support address was found for this merchant, so the claim cannot be addressed to anyone. Add one on the case page to continue.',
      };
    }

    const evidence: Doc<'evidence'>[] = await ctx.runQuery(
      internal.sherlock.research.listEvidence,
      { investigationId: args.investigationId }
    );

    const result = await callModel<Draft>({
      instruction:
        'Write the email this customer should send to the merchant.\n\n' +
        `Transaction: ${describe(investigation)}\n` +
        `Merchant: ${investigation.merchantName ?? investigation.merchantDomain}\n` +
        `Your assessment: ${investigation.assessment ?? ''}\n\n` +
        'Requirements: polite, specific and short. Cite the exact policy wording found in the evidence. ' +
        'Quote the order number only if one is in the transaction details above. ' +
        'State plainly what is being requested. Never invent an order number, a date, a price, or a policy. ' +
        'Do not threaten. End the body with a line reading exactly: Sent via Sherlock.',
      context: asDataBlock('EVIDENCE', sanitizeExternal(formatEvidence(evidence), 10_000)),
      schema: DRAFT_SCHEMA,
      maxTokens: 1_200,
    });

    await ctx.runMutation(internal.claims.createDraft, {
      investigationId: args.investigationId,
      claimType: 'claim',
      toEmail: investigation.contactEmail,
      subject: result.subject.slice(0, 200),
      body: result.body.slice(0, 8_000),
      reasoning: result.reasoning.slice(0, 1_500),
      evidenceIds: evidence.map((row) => row._id),
      potentialAmount: investigation.potentialAmount,
      currency: investigation.currency,
      isFollowUp: false,
    });

    return { ok: true };
  },
});

// ------------------------------------------------------------------ helpers

function describe(investigation: Doc<'investigations'>): string {
  const parts = [
    investigation.productName && `product: ${investigation.productName}`,
    investigation.amount !== undefined &&
      `paid: ${investigation.amount} ${investigation.currency ?? ''}`.trim(),
    investigation.orderId && `order number: ${investigation.orderId}`,
    investigation.purchasedAt &&
      `purchased: ${new Date(investigation.purchasedAt).toISOString().slice(0, 10)}`,
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : 'no transaction details were stated in the email';
}

/** Numbered so the model can cite evidence by index rather than restating it. */
function formatEvidence(evidence: Doc<'evidence'>[]): string {
  return evidence
    .map((row, index) => {
      const lines = [
        `[${index}] (${row.kind}) ${row.fact}`,
        `    relevance: ${row.relevance}`,
        row.excerpt && `    quote: "${row.excerpt}"`,
        row.sourceUrl && `    source: ${row.sourceUrl}`,
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n\n');
}
