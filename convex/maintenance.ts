import { internalMutation } from './_generated/server';
import { v } from 'convex/values';

/**
 * Housekeeping.
 *
 * `webSources` is a cache of scraped pages and is the only table that grows
 * without bound on its own, so old entries are dropped. Investigations,
 * evidence, claims and events are the user's case history and are never
 * deleted behind their back.
 */

const SOURCE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const pruneWebSources = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - SOURCE_TTL_MS;
    const stale = await ctx.db
      .query('webSources')
      .withIndex('by_fetchedAt', (q) => q.lt('fetchedAt', cutoff))
      .take(200);

    for (const source of stale) {
      // Keep anything a monitor is still comparing against.
      const watched = await ctx.db
        .query('monitors')
        .withIndex('by_active_nextRunAt', (q) => q.eq('active', true))
        .take(50);
      if (watched.some((monitor) => monitor.url === source.url)) continue;
      await ctx.db.delete(source._id);
    }
    return stale.length;
  },
});
