import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import type { ActionCtx } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { search, scrape, policyQueries, FirecrawlUnavailable } from './firecrawl';
import { callModel, objectSchema, nullableString, clampConfidence, opt } from './llm';
import { asDataBlock, sanitizeExternal } from '../core/untrusted';
import { hostFromUrl, rootDomain } from '../core/email';
import { contentHash, logEvent } from '../helpers';
import { evidenceKind } from '../schema';

/**
 * Step 2 — investigate the web.
 *
 * Firecrawl searches for the merchant's own policy pages, scrapes the few
 * that matter, and OpenAI pulls out the specific clauses that bear on this
 * transaction. Each extracted fact is stored as an Evidence row carrying its
 * source URL and a verbatim excerpt, so every sentence of the eventual claim
 * can be traced back to a page a human can open.
 *
 * Deliberately narrow: three targeted searches and at most four scrapes per
 * case. Crawling a whole retailer to find one refund clause burns credits and
 * finds nothing better.
 */

const MAX_PAGES_PER_CASE = 4;
const SOURCE_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_CONTENT = 30_000;

interface ExtractedEvidence {
  facts: {
    kind: string;
    fact: string;
    relevance: string;
    excerpt: string | null;
    confidence: number;
  }[];
  contact_email: string | null;
}

const EVIDENCE_SCHEMA = objectSchema('policy_evidence', {
  facts: {
    type: 'array',
    maxItems: 6,
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['policy', 'price', 'terms', 'contact', 'other'] },
        fact: { type: 'string', description: 'The rule or figure, stated plainly' },
        relevance: { type: 'string', description: 'Why it bears on this specific transaction' },
        excerpt: { ...nullableString, description: 'Verbatim supporting sentence from the page' },
        confidence: { type: 'number', description: '0 to 1' },
      },
      required: ['kind', 'fact', 'relevance', 'excerpt', 'confidence'],
    },
  },
  contact_email: { ...nullableString, description: 'Support address stated on the page, if any' },
});

export const run = internalAction({
  args: { investigationId: v.id('investigations') },
  returns: v.object({ evidenceCount: v.number(), reason: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ evidenceCount: number; reason?: string }> => {
    const investigation = await ctx.runQuery(internal.investigations.getInternal, {
      id: args.investigationId,
    });
    if (!investigation) return { evidenceCount: 0, reason: 'Investigation is missing.' };

    const merchant = investigation.merchantName ?? investigation.merchantDomain;
    if (!merchant) {
      return {
        evidenceCount: 0,
        reason: 'Could not tell which company this email is from, so there was nothing to research.',
      };
    }

    // --- discover candidate sources --------------------------------------
    const urls = await discoverSources(ctx, args.investigationId, merchant, investigation.merchantDomain);
    if (urls.length === 0) {
      return {
        evidenceCount: 0,
        reason: `Could not find published policy pages for ${merchant}.`,
      };
    }

    // --- read them and extract evidence ----------------------------------
    let stored = 0;
    let contact: string | undefined;

    for (const url of urls.slice(0, MAX_PAGES_PER_CASE)) {
      const source = await fetchSource(ctx, url);
      if (!source) continue;

      let extracted: ExtractedEvidence;
      try {
        extracted = await callModel<ExtractedEvidence>({
          instruction:
            `You are reading a page from ${merchant} on behalf of a customer.\n` +
            `Their transaction: ${describeTransaction(investigation)}\n\n` +
            'Extract only the clauses and figures on this page that bear on that transaction — ' +
            'refund windows, price-adjustment or price-match terms, cancellation compensation, ' +
            'current prices, and the support address. ' +
            'If the page says nothing relevant, return an empty list. Never invent a clause.',
          context: asDataBlock(
            `WEB PAGE (${url})`,
            sanitizeExternal(source.content, 14_000)
          ),
          schema: EVIDENCE_SCHEMA,
          maxTokens: 1_200,
        });
      } catch (error) {
        // One unreadable page must not sink the whole investigation.
        await ctx.runMutation(internal.sherlock.research.noteSourceFailure, {
          investigationId: args.investigationId,
          url,
          message: (error as Error).message,
        });
        continue;
      }

      contact ??= opt(extracted.contact_email) ?? undefined;

      for (const fact of extracted.facts ?? []) {
        await ctx.runMutation(internal.sherlock.research.addEvidence, {
          investigationId: args.investigationId,
          kind: normalizeKind(fact.kind),
          fact: fact.fact,
          relevance: fact.relevance,
          excerpt: opt(fact.excerpt),
          sourceUrl: url,
          sourceTitle: source.title,
          confidence: clampConfidence(fact.confidence),
        });
        stored++;
      }
    }

    if (contact && !investigation.contactEmail) {
      const contactDomain = rootDomain(contact.split('@')[1] ?? '');
      // Only adopt an address that belongs to the merchant we are researching.
      if (!investigation.merchantDomain || contactDomain === investigation.merchantDomain) {
        await ctx.runMutation(internal.investigations.applyExtraction, {
          id: args.investigationId,
          contactEmail: contact,
        });
      }
    }

    return stored > 0
      ? { evidenceCount: stored }
      : {
          evidenceCount: 0,
          reason: `Read ${urls.length} page(s) from ${merchant} but found no clause that applies to this transaction.`,
        };
  },
});

// -------------------------------------------------------------------- steps

async function discoverSources(
  ctx: ActionCtx,
  investigationId: Id<'investigations'>,
  merchant: string,
  domain?: string
): Promise<string[]> {
  const found: string[] = [];
  for (const query of policyQueries(merchant, domain)) {
    try {
      const hits = await search(query, 3);
      for (const hit of hits) {
        // Stay on the merchant's own site when we know it — their policy
        // page is the authority, a coupon blog is not.
        if (domain && rootDomain(hostFromUrl(hit.url)) !== domain) continue;
        if (!found.includes(hit.url)) found.push(hit.url);
      }
    } catch (error) {
      if (error instanceof FirecrawlUnavailable) throw error;
    }
  }

  if (found.length) {
    await ctx.runMutation(internal.sherlock.research.noteSourcesFound, {
      investigationId,
      count: found.length,
      urls: found.slice(0, MAX_PAGES_PER_CASE),
    });
  }
  return found;
}

/** Scrape a URL, reusing a recent cached copy when one exists. */
async function fetchSource(
  ctx: ActionCtx,
  url: string
): Promise<{ content: string; title?: string } | null> {
  const cached: Doc<'webSources'> | null = await ctx.runQuery(
    internal.sherlock.research.getSource,
    { url }
  );
  if (cached && !cached.error && Date.now() - cached.fetchedAt < SOURCE_CACHE_MS) {
    return { content: cached.content, title: cached.title };
  }

  try {
    const result = await scrape(url);
    const content = result.markdown.slice(0, MAX_STORED_CONTENT);
    await ctx.runMutation(internal.sherlock.research.saveSource, {
      url: result.url,
      title: result.title,
      content,
    });
    return { content, title: result.title };
  } catch (error) {
    await ctx.runMutation(internal.sherlock.research.saveSource, {
      url,
      content: '',
      error: (error as Error).message.slice(0, 300),
    });
    return null;
  }
}

function describeTransaction(investigation: Doc<'investigations'>): string {
  const parts = [
    investigation.productName && `product: ${investigation.productName}`,
    investigation.amount !== undefined &&
      `paid: ${investigation.amount} ${investigation.currency ?? ''}`.trim(),
    investigation.orderId && `order: ${investigation.orderId}`,
    investigation.purchasedAt && `purchased: ${new Date(investigation.purchasedAt).toISOString().slice(0, 10)}`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'details not stated in the email';
}

function normalizeKind(kind: string): 'policy' | 'price' | 'terms' | 'contact' | 'other' {
  const allowed = ['policy', 'price', 'terms', 'contact'] as const;
  return (allowed as readonly string[]).includes(kind)
    ? (kind as 'policy' | 'price' | 'terms' | 'contact')
    : 'other';
}

// ------------------------------------------------------- storage functions

export const getSource = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<Doc<'webSources'> | null> =>
    ctx.db
      .query('webSources')
      .withIndex('by_url', (q) => q.eq('url', args.url))
      .first(),
});

export const saveSource = internalMutation({
  args: {
    url: v.string(),
    title: v.optional(v.string()),
    content: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const hash = contentHash(args.content);
    const existing = await ctx.db
      .query('webSources')
      .withIndex('by_url', (q) => q.eq('url', args.url))
      .first();

    const row = {
      url: args.url,
      domain: hostFromUrl(args.url),
      title: args.title,
      content: args.content,
      contentHash: hash,
      fetchedAt: Date.now(),
      error: args.error,
    };

    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert('webSources', row);
    return hash;
  },
});

export const addEvidence = internalMutation({
  args: {
    investigationId: v.id('investigations'),
    kind: evidenceKind,
    fact: v.string(),
    relevance: v.string(),
    excerpt: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    confidence: v.optional(v.number()),
  },
  returns: v.id('evidence'),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('evidence', {
      investigationId: args.investigationId,
      kind: args.kind,
      fact: args.fact.slice(0, 600),
      relevance: args.relevance.slice(0, 600),
      excerpt: args.excerpt?.slice(0, 1_200),
      sourceUrl: args.sourceUrl,
      sourceTitle: args.sourceTitle?.slice(0, 200),
      confidence: args.confidence,
      createdAt: Date.now(),
    });
    await logEvent(ctx, {
      investigationId: args.investigationId,
      type: 'EVIDENCE_ADDED',
      summary: args.fact.slice(0, 180),
      detail: { sourceUrl: args.sourceUrl },
    });
    return id;
  },
});

export const noteSourcesFound = internalMutation({
  args: {
    investigationId: v.id('investigations'),
    count: v.number(),
    urls: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await logEvent(ctx, {
      investigationId: args.investigationId,
      type: 'SOURCE_DISCOVERED',
      summary: `Found ${args.count} candidate source${args.count === 1 ? '' : 's'} to read`,
      detail: { urls: args.urls },
    });
    return null;
  },
});

export const noteSourceFailure = internalMutation({
  args: { investigationId: v.id('investigations'), url: v.string(), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await logEvent(ctx, {
      investigationId: args.investigationId,
      type: 'SOURCE_UNREADABLE',
      summary: `Could not read ${hostFromUrl(args.url)}`,
      detail: { url: args.url, message: args.message.slice(0, 200) },
    });
    return null;
  },
});

export const listEvidence = internalQuery({
  args: { investigationId: v.id('investigations') },
  handler: async (ctx, args): Promise<Doc<'evidence'>[]> =>
    ctx.db
      .query('evidence')
      .withIndex('by_investigation', (q) => q.eq('investigationId', args.investigationId))
      .take(50),
});
