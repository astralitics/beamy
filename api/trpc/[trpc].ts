import { handleTrpcRequest } from "@beamy/trpc";

/**
 * Production tRPC API for any Vercel deploy (e.g. beamy-staging).
 *
 * Vercel Node runtime, Web `fetch` handler form. The real logic lives in
 * @beamy/trpc (packages/trpc/src/fetch-handler.ts) so it's shared + typechecked.
 *
 * Node runtime — NOT Edge — because @beamy/db opens a TCP postgres connection.
 * Set DATABASE_URL to Supabase's transaction pooler (port 6543); getDb()
 * already passes `prepare: false`, which transaction pooling requires.
 *
 * Dev does not use this file — apps/web/vite.config.ts serves /api/trpc as
 * Vite middleware (with a dev-user fallback this path intentionally omits).
 */
export default {
  fetch: handleTrpcRequest,
};
