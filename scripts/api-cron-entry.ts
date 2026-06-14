import { handleCronTick } from "@beamy/trpc";

/**
 * Entry for the bundled Vercel cron function (the durable-runner drain trigger). esbuild
 * (scripts/build-api.mjs) bundles this — inlining @beamy/trpc/db/shared — into a self-contained
 * api/cron/_bundle.mjs, for the same reason as the tRPC entry.
 */
export default { fetch: handleCronTick };
