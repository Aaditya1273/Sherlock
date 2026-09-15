import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

/**
 * Scheduled work.
 *
 * Deliberately three jobs. Each is bounded per run (the monitor sweep takes
 * at most ten monitors, the session purge at most two hundred rows), so a
 * backlog drains steadily instead of stampeding, and none of them can grow
 * unattended.
 */

const crons = cronJobs();

// The alive layer: re-read watched pages and chase unanswered claims.
crons.interval('sherlock monitor sweep', { hours: 1 }, internal.sherlock.monitor.sweep, {});

// Housekeeping.
crons.interval('purge expired sessions', { hours: 12 }, internal.auth.purgeExpiredSessions, {});
crons.interval('prune stale web sources', { hours: 24 }, internal.maintenance.pruneWebSources, {});

export default crons;
