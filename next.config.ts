import type { NextConfig } from 'next';

/**
 * Sherlock ships as a static export so the whole frontend can be served by
 * the Convex deployment that runs its backend (see convex/staticHosting.ts).
 *
 * - `output: 'export'` writes plain HTML/JS/CSS to ./out
 * - images are unoptimised because there is no Next server at runtime
 * - the case page reads its id from the query string rather than a dynamic
 *   segment, because a static export cannot enumerate Convex document ids
 */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  trailingSlash: false,
  // Next 16 writes AGENTS.md/CLAUDE.md into the repo by default; the build
  // log in hackathon.md is the documentation of record here.
  agentRules: false,
};

export default nextConfig;
