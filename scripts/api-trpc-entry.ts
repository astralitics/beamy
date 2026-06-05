import { handleTrpcRequest } from "@beamy/trpc";

/**
 * Entry for the bundled Vercel function. esbuild (scripts/build-api.mjs)
 * bundles this — inlining @beamy/trpc/db/shared (which use extensionless,
 * bundler-style imports Node's ESM loader can't resolve on its own) — into
 * a self-contained api/trpc/_bundle.mjs.
 */
export default { fetch: handleTrpcRequest };
