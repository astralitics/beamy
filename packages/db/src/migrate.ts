import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

/**
 * Apply pending migrations from packages/db/migrations.
 *
 * Local:      `pnpm --filter @beamy/db migrate`     (loads ../../.env)
 * CI / Vercel:`pnpm --filter @beamy/db migrate:ci`  (reads the env directly;
 *             see scripts/vercel-migrate.mjs)
 *
 * Connection precedence: MIGRATE_DATABASE_URL ?? DATABASE_URL. The override
 * exists because migrations want a session-capable connection — if
 * DATABASE_URL points at Supabase's transaction pooler (port 6543), set
 * MIGRATE_DATABASE_URL to the session pooler (5432). `prepare: false` keeps
 * the migrator safe through a transaction pooler regardless.
 */
async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Neither MIGRATE_DATABASE_URL nor DATABASE_URL is set");
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  const migrationsFolder = new URL("../migrations", import.meta.url).pathname;
  console.log(`[migrate] applying from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log(`[migrate] done`);

  await client.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
