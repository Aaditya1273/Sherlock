import { internalAction } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { LlmUnavailable } from './llm';
import { FirecrawlUnavailable } from './firecrawl';

/**
 * The investigation pipeline.
 *
 * One durable orchestration: parse -> investigate -> reason -> draft. Each
 * stage commits its result through a mutation before the next begins, so a
 * crash or a Convex retry resumes from real persisted state rather than
 * redoing the whole case. The live dashboard is just a subscription to the
 * statuses this action writes as it goes.
 *
 * Failure is a first-class outcome. When a stage cannot produce a real
 * result — no key configured, no policy found, evidence too thin — the case
 * stops with a reason a person can read, instead of inventing a claim.
 */

const LOCK_TTL_MS = 5 * 60_000;

export const investigate = internalAction({
  args: { investigationId: v.id('investigations') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Convex retries scheduled work; the lock keeps a retry from running a
    // second copy of the pipeline over the same case.
    const acquired: boolean = await ctx.runMutation(internal.investigations.acquireLock, {
      id: args.investigationId,
      ttlMs: LOCK_TTL_MS,
    });
    if (!acquired) return null;

    try {
      const investigation = await ctx.runQuery(internal.investigations.getInternal, {
        id: args.investigationId,
      });
      if (!investigation || !investigation.sourceEmailId) return null;
      if (investigation.status === 'PAUSED' || investigation.status === 'RESOLVED') return null;

      // ---- 1. read the email -------------------------------------------
      if (investigation.status === 'RECEIVED') {
        await ctx.runMutation(internal.investigations.advance, {
          id: args.investigationId,
          to: 'PARSING',
          summary: 'Reading the forwarded email',
        });
      }

      const extraction = await ctx.runAction(internal.sherlock.extraction.run, {
        investigationId: args.investigationId,
        emailId: investigation.sourceEmailId,
      });
      if (!extraction.ok) {
        await ctx.runMutation(internal.investigations.fail, {
          id: args.investigationId,
          reason: extraction.reason ?? 'Could not read the transaction from this email.',
        });
        return null;
      }

      // ---- 2. investigate the web --------------------------------------
      await ctx.runMutation(internal.investigations.advance, {
        id: args.investigationId,
        to: 'INVESTIGATING',
        summary: 'Searching for the merchant policy',
      });

      const research = await ctx.runAction(internal.sherlock.research.run, {
        investigationId: args.investigationId,
      });

      if (research.evidenceCount > 0) {
        await ctx.runMutation(internal.investigations.advance, {
          id: args.investigationId,
          to: 'EVIDENCE_FOUND',
          summary: `Collected ${research.evidenceCount} piece${research.evidenceCount === 1 ? '' : 's'} of evidence`,
        });
      }

      // ---- 3. weigh it --------------------------------------------------
      await ctx.runMutation(internal.investigations.advance, {
        id: args.investigationId,
        to: 'REASONING',
        summary: 'Working out whether there is a case',
      });

      const assessment = await ctx.runAction(internal.sherlock.reasoning.assess, {
        investigationId: args.investigationId,
      });

      if (!assessment.hasCase) {
        // Not a failure: a well-supported "nothing owed here" is a result.
        await ctx.runMutation(internal.investigations.advance, {
          id: args.investigationId,
          to: 'RESOLVED',
          summary: assessment.reason ?? 'No claim available',
        });
        return null;
      }

      // ---- 4. draft, then stop and ask ---------------------------------
      const draft = await ctx.runAction(internal.sherlock.reasoning.draft, {
        investigationId: args.investigationId,
      });
      if (!draft.ok) {
        await ctx.runMutation(internal.investigations.fail, {
          id: args.investigationId,
          reason: draft.reason ?? 'Could not prepare a claim.',
        });
        return null;
      }

      await ctx.runMutation(internal.investigations.advance, {
        id: args.investigationId,
        to: 'CLAIM_READY',
        summary: 'Claim drafted',
      });
      await ctx.runMutation(internal.investigations.advance, {
        id: args.investigationId,
        to: 'AWAITING_APPROVAL',
        summary: 'Waiting for you to review and approve',
      });

      // Watch the price while the claim sits with the user.
      await ctx.runMutation(internal.sherlock.monitor.scheduleForInvestigation, {
        investigationId: args.investigationId,
      });
    } catch (error) {
      await ctx.runMutation(internal.investigations.fail, {
        id: args.investigationId,
        reason: describeFailure(error),
      });
    } finally {
      await ctx.runMutation(internal.investigations.releaseLock, { id: args.investigationId });
    }
    return null;
  },
});

/**
 * Turn an exception into something the person who forwarded the email can
 * act on. Raw messages stay in the Convex logs.
 */
function describeFailure(error: unknown): string {
  if (error instanceof LlmUnavailable) {
    return `Sherlock could not reach its reasoning model. ${error.message}`;
  }
  if (error instanceof FirecrawlUnavailable) {
    return `Sherlock could not read the web right now. ${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `The investigation stopped unexpectedly: ${message.slice(0, 200)}`;
}
