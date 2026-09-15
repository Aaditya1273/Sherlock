import { exposeDeploymentQuery } from '@convex-dev/self-static-hosting';
import { components } from './_generated/api';

/**
 * Static hosting.
 *
 * Sherlock's frontend is served by the same Convex deployment that runs its
 * backend, which is what puts the whole product behind one convex.site URL.
 *
 * Routing is app-owned (see `registerStaticRoutes` in http.ts) so Sherlock's
 * own routes — the AgentMail webhook above all — keep their exact paths and
 * are not shadowed by the static catch-all.
 *
 * Uploads are handled by the component's CLI directly; the 0.2 component no
 * longer takes app-level upload wrappers.
 */

export const { getCurrentDeployment } = exposeDeploymentQuery(components.selfStaticHosting);
