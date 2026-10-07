/**
 * Netlify Function entry point. Wraps the same Express app the local dev
 * server uses — no code duplication, no second API surface to maintain.
 *
 * Netlify's build step bundles this file with esbuild, resolving imports from
 * @apparelflow/shared and @apparelflow/server at deploy time. The shared
 * package's dist/ must exist first — see netlify.toml build command.
 */
import serverless from "serverless-http";
import { createApp } from "../../server/src/app";

// `createApp()` is called once per cold start, not per invocation. The
// Express instance and the underlying postgres-js connection pool persist
// across warm invocations, so repeated calls reuse the same DB connection.
const app = createApp();

export const handler = serverless(app);
