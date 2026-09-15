import { query, action, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireOwner } from './auth';
import { callModel, objectSchema, LlmUnavailable } from './sherlock/llm';
import { asDataBlock, sanitizeExternal } from './core/untrusted';
import { STATE_LABEL, type InvestigationState } from './core/states';

/**
 * Talk to Sherlock.
 *
 * Not a general chatbot: the model is given a snapshot of the user's real
 * investigations and is instructed to answer only from it. "What did you find
 * on my Amazon order?" is a question about rows in this database, and if the
 * rows do not answer it the honest response is that they do not.
 *
 * The chat is read-only by construction. It has no tools and cannot approve,
 * send, or alter a case — that is what the Claims screen is for.
 */

const CONTEXT_CASES = 15;

interface Answer {
  answer: string;
  referenced_case_numbers: number[];
}

const SCHEMA = objectSchema('sherlock_answer', {
  answer: {
    type: 'string',
    description: 'A direct answer in plain language, grounded only in the case data supplied',
  },
  referenced_case_numbers: {
    type: 'array',
    items: { type: 'integer' },
    description: 'Numbers of the cases the answer draws on',
  },
});

export const history = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerKey = await requireOwner(ctx, args.token);
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_owner_createdAt', (q) => q.eq('ownerKey', ownerKey))
      .order('desc')
      .take(60);
    return messages.reverse();
  },
});

export const ask = action({
  args: { token: v.optional(v.string()), message: v.string() },
  returns: v.object({ answer: v.string() }),
  handler: async (ctx, args): Promise<{ answer: string }> => {
    const question = args.message.trim();
    if (!question) throw new Error('Ask something first.');
    if (question.length > 2_000) throw new Error('That question is too long.');

    const ownerKey: string = await ctx.runQuery(internal.chat.assertOwner, { token: args.token });

    await ctx.runMutation(internal.chat.append, {
      ownerKey,
      role: 'user',
      content: question,
    });

    const context: ChatContext = await ctx.runQuery(internal.chat.buildContext, { ownerKey });

    let answer: string;
    let cited: Id<'investigations'>[] = [];
    try {
      const result = await callModel<Answer>({
        instruction:
          'You are answering the owner of these investigations. Answer only from the case data below. ' +
          'If it does not contain the answer, say so plainly and suggest what would help. ' +
          'Never invent a status, an amount, a merchant reply, or a policy. ' +
          'Amounts marked "potential" are estimates, not money received — never describe them as recovered.\n\n' +
          `Their question: ${question}`,
        context: asDataBlock('CASE DATA', sanitizeExternal(context.summary, 12_000)),
        schema: SCHEMA,
        maxTokens: 800,
      });
      answer = result.answer;
      cited = (result.referenced_case_numbers ?? [])
        .map((index) => context.ids[index - 1])
        .filter(Boolean);
    } catch (error) {
      answer =
        error instanceof LlmUnavailable
          ? `I can't reach my reasoning model right now, so I won't guess. ${error.message}`
          : 'Something went wrong answering that. Your investigations are unaffected.';
    }

    await ctx.runMutation(internal.chat.append, {
      ownerKey,
      role: 'assistant',
      content: answer,
      citedInvestigationIds: cited,
    });

    return { answer };
  },
});

export const clear = action({
  args: { token: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const ownerKey: string = await ctx.runQuery(internal.chat.assertOwner, { token: args.token });
    await ctx.runMutation(internal.chat.deleteHistory, { ownerKey });
    return null;
  },
});

// ------------------------------------------------------------- internal API

export const assertOwner = internalQuery({
  args: { token: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => requireOwner(ctx, args.token),
});

export const append = internalMutation({
  args: {
    ownerKey: v.string(),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
    citedInvestigationIds: v.optional(v.array(v.id('investigations'))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert('chatMessages', {
      ownerKey: args.ownerKey,
      role: args.role,
      content: args.content.slice(0, 4_000),
      citedInvestigationIds: args.citedInvestigationIds,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const deleteHistory = internalMutation({
  args: { ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('chatMessages')
      .withIndex('by_owner_createdAt', (q) => q.eq('ownerKey', args.ownerKey))
      .take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});

interface ChatContext {
  summary: string;
  ids: Id<'investigations'>[];
}

/**
 * Render the user's cases as text for the model.
 *
 * Numbered rather than passed as ids, so the model cites "case 3" and we map
 * that back to a real document instead of trusting it to echo an id.
 */
export const buildContext = internalQuery({
  args: { ownerKey: v.string() },
  returns: v.object({ summary: v.string(), ids: v.array(v.id('investigations')) }),
  handler: async (ctx, args): Promise<ChatContext> => {
    const investigations = await ctx.db
      .query('investigations')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerKey', args.ownerKey))
      .order('desc')
      .take(CONTEXT_CASES);

    if (investigations.length === 0) {
      return { summary: 'The user has no investigations yet.', ids: [] };
    }

    const blocks: string[] = [];
    let totalRecovered = 0;
    let totalPotential = 0;

    for (const [index, investigation] of investigations.entries()) {
      const evidence = await ctx.db
        .query('evidence')
        .withIndex('by_investigation', (q) => q.eq('investigationId', investigation._id))
        .take(4);
      const claim = await ctx.db
        .query('claims')
        .withIndex('by_investigation', (q) => q.eq('investigationId', investigation._id))
        .order('desc')
        .first();

      totalRecovered += investigation.recoveredAmount ?? 0;
      totalPotential += investigation.potentialAmount ?? 0;

      blocks.push(renderCase(index + 1, investigation, evidence, claim));
    }

    const header =
      `The user has ${investigations.length} investigation(s). ` +
      `Total confirmed recovered: ${totalRecovered}. ` +
      `Total potential (estimates only, not received): ${totalPotential}.`;

    return {
      summary: [header, ...blocks].join('\n\n'),
      ids: investigations.map((row) => row._id),
    };
  },
});

function renderCase(
  number: number,
  investigation: Doc<'investigations'>,
  evidence: Doc<'evidence'>[],
  claim: Doc<'claims'> | null
): string {
  const lines = [
    `CASE ${number}: ${investigation.title}`,
    `  status: ${STATE_LABEL[investigation.status as InvestigationState]} (${investigation.status})`,
    investigation.merchantName && `  merchant: ${investigation.merchantName}`,
    investigation.orderId && `  order: ${investigation.orderId}`,
    investigation.amount !== undefined &&
      `  paid: ${investigation.amount} ${investigation.currency ?? ''}`,
    investigation.potentialAmount !== undefined &&
      `  potential recovery (estimate): ${investigation.potentialAmount} ${investigation.currency ?? ''}`,
    investigation.recoveredAmount !== undefined &&
      `  confirmed recovered: ${investigation.recoveredAmount} ${investigation.currency ?? ''}`,
    investigation.assessment && `  assessment: ${investigation.assessment}`,
    investigation.failureReason && `  stopped because: ${investigation.failureReason}`,
    claim && `  claim: ${claim.status}, to ${claim.toEmail}, subject "${claim.subject}"`,
    evidence.length > 0 && '  evidence:',
    ...evidence.map((row) => `    - ${row.fact} (${row.sourceUrl ?? 'no source'})`),
  ].filter(Boolean);
  return lines.join('\n');
}
