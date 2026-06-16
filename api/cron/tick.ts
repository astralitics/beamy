/**
 * Production cron endpoint — the durable-runner drain trigger. Hit on a schedule by the Vercel
 * cron defined in vercel.json (Vercel is serverless, so there's no always-on worker). Drains the
 * `workflow_jobs` queue across all orgs. Secured by CRON_SECRET (Vercel injects it as a Bearer
 * token on cron requests — set it in the project env).
 *
 * Bundled like the tRPC function (scripts/build-api.mjs → ./_bundle.mjs) so @beamy/* resolve on
 * Vercel's native ESM loader. Dev drains via `workflows.runs.tick` instead.
 */
export { default } from "./_bundle.mjs";
