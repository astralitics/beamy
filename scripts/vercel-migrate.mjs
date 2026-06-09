import { execSync } from "node:child_process";

/**
 * Vercel build step — apply pending Drizzle migrations to the deploy's DB.
 *
 * Runs FIRST in vercel.json's buildCommand. Vercel does not run migrations on
 * its own, so without this every new migration silently breaks the deployed
 * app until it's applied by hand (which is exactly what bit staging once).
 *
 * Guard rails:
 *  - Only the PRODUCTION deploy migrates (VERCEL_ENV=production — i.e. the
 *    main → beamy-staging deploy). Preview/branch deploys skip, so a feature
 *    branch can never migrate the shared staging DB out from under main.
 *  - A migration failure exits non-zero and fails the whole deploy — better to
 *    block the deploy than ship code expecting columns that don't exist yet.
 *
 * The migration itself reads MIGRATE_DATABASE_URL ?? DATABASE_URL
 * (see packages/db/src/migrate.ts).
 */
const env = process.env.VERCEL_ENV ?? "unknown";

if (env !== "production") {
  console.log(
    `[vercel-migrate] VERCEL_ENV=${env} — skipping migrations (only production deploys migrate).`,
  );
  process.exit(0);
}

if (!process.env.MIGRATE_DATABASE_URL && !process.env.DATABASE_URL) {
  console.error(
    "[vercel-migrate] production deploy but neither MIGRATE_DATABASE_URL nor DATABASE_URL is set — cannot migrate.",
  );
  process.exit(1);
}

console.log("[vercel-migrate] production deploy — applying pending migrations…");
try {
  execSync("pnpm --filter @beamy/db migrate:ci", { stdio: "inherit" });
} catch {
  // The child already streamed its error to inherited stdio; fail the build.
  process.exit(1);
}
console.log("[vercel-migrate] migrations up to date.");
