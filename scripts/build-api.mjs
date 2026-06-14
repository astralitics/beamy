import { build } from "esbuild";

/**
 * Bundle the production tRPC handler into a single self-contained ESM file
 * for Vercel's Node runtime. Runs in the Vercel build (see vercel.json
 * buildCommand), before @vercel/node compiles api/trpc/[trpc].ts.
 *
 * Why bundle: the @beamy/* workspace packages are TS source with extensionless
 * relative imports (bundler module resolution). Node's native ESM loader — what
 * Vercel functions use — rejects those (ERR_MODULE_NOT_FOUND / TS2835). esbuild
 * resolves and inlines them, so the lambda gets plain, runnable JS.
 */
const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "info",
};

await build({
  ...shared,
  entryPoints: ["scripts/api-trpc-entry.ts"],
  outfile: "api/trpc/_bundle.mjs",
});
console.log("[build-api] wrote api/trpc/_bundle.mjs");

// The durable-runner drain trigger (hit by the Vercel cron in vercel.json).
await build({
  ...shared,
  entryPoints: ["scripts/api-cron-entry.ts"],
  outfile: "api/cron/_bundle.mjs",
});
console.log("[build-api] wrote api/cron/_bundle.mjs");
