/**
 * Production inbound-webhook endpoint — POST /api/hooks/<token> fires a workflow. Public (no user
 * session): the unguessable token is the capability + org resolver; optional HMAC verifies the body.
 * The handler is esbuild-bundled into ./_bundle.mjs (scripts/build-api.mjs) so @beamy/* resolve on
 * Vercel's native ESM loader. Dev routes through the Vite middleware in apps/web/vite.config.ts.
 */
export { default } from "./_bundle.mjs";
