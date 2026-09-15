import { defineApp } from 'convex/server';
import selfStaticHosting from '@convex-dev/self-static-hosting/convex.config.js';

/**
 * Convex components.
 *
 * Only what Sherlock actually uses: static hosting serves the frontend from
 * the same deployment that runs the backend, which is what puts the whole
 * product on one convex.site URL.
 *
 * Firecrawl, AgentMail and OpenAI are reached directly over their REST APIs
 * (see convex/sherlock/firecrawl.ts, convex/agentMail.ts, convex/sherlock/llm.ts)
 * because Sherlock needs search, threaded replies and strict structured
 * outputs — surfaces the wrapper components do not expose.
 */

const app = defineApp();
app.use(selfStaticHosting);

export default app;
