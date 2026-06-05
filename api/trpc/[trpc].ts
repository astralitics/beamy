/**
 * Production tRPC API for any Vercel deploy (e.g. beamy-staging).
 *
 * The handler is esbuild-bundled into ./_bundle.mjs at build time
 * (scripts/build-api.mjs) — a self-contained ESM file with @beamy/* inlined.
 * Importing @beamy/trpc directly here fails on Vercel: the monorepo packages
 * use extensionless, bundler-style relative imports that Node's native ESM
 * loader rejects (TS2835 / ERR_MODULE_NOT_FOUND). Bundling sidesteps it.
 *
 * Node runtime (not Edge) — @beamy/db opens a TCP postgres connection;
 * DATABASE_URL points at Supabase's transaction pooler (6543).
 * Dev still uses the Vite middleware in apps/web/vite.config.ts.
 */
export { default } from "./_bundle.mjs";
