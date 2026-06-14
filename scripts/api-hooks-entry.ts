import { handleWebhook } from "@beamy/trpc";

/**
 * Entry for the bundled Vercel inbound-webhook function. esbuild (scripts/build-api.mjs) bundles
 * this — inlining @beamy/trpc/db/shared — into api/hooks/_bundle.mjs, same reason as the tRPC/cron
 * entries. The token is read from the request path (/api/hooks/<token>) by handleWebhook.
 */
export default { fetch: handleWebhook };
