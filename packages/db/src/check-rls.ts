import postgres from "postgres";

/**
 * RLS guard — fail loudly if any table in `public` has Row Level Security off.
 *
 * Supabase auto-exposes a PostgREST API over `public`. A table with RLS
 * disabled is readable by anyone holding the publishable `anon` key (which
 * ships to every browser), bypassing the tRPC `orgScopedProcedure` tenancy
 * guard. Drizzle creates new tables with RLS *off* by default, so every
 * migration that adds a table can silently re-open this hole — migration
 * 0027 enabled RLS on all then-existing tables, and this guard keeps it that
 * way going forward.
 *
 * Runs after migrations on production deploys (see scripts/vercel-migrate.mjs).
 * A table with RLS off exits non-zero and fails the deploy. Run locally with
 * `pnpm --filter @beamy/db check-rls` (loads ../../.env via tsx --env-file).
 *
 * Connection precedence mirrors the migrator: MIGRATE_DATABASE_URL ?? DATABASE_URL.
 */
async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Neither MIGRATE_DATABASE_URL nor DATABASE_URL is set");
  }

  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const exposed = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND rowsecurity = false
      ORDER BY tablename
    `;

    if (exposed.length > 0) {
      console.error(
        `[check-rls] ${exposed.length} public table(s) have RLS DISABLED — ` +
          `they are exposed via the Supabase PostgREST API:`,
      );
      for (const { tablename } of exposed) {
        console.error(`  - ${tablename}`);
      }
      console.error(
        "[check-rls] Add `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;` " +
          "to a migration. See migration 0027 for the pattern.",
      );
      process.exit(1);
    }

    console.log("[check-rls] OK — every public table has RLS enabled.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[check-rls] failed:", err);
  process.exit(1);
});
