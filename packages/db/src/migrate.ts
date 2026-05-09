import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

/**
 * Apply pending migrations from packages/db/migrations.
 * Run via `pnpm --filter @riffy/db migrate`.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const client = postgres(url, { max: 1 });
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
