-- ─────────────────────────────────────────────────────────────────
-- Enable Row Level Security on every table in the `public` schema.
--
-- WHY: Supabase auto-exposes a PostgREST REST API over `public`. Drizzle
-- creates tables with RLS *disabled*, so anyone holding the publishable
-- `anon` key (shipped to every browser via VITE_SUPABASE_ANON_KEY) could
-- read every org's rows directly at /rest/v1/<table>, bypassing the tRPC
-- `orgScopedProcedure` tenancy guard entirely. This is the Supabase
-- security advisor's "Sensitive data publicly accessible" finding.
--
-- THE FIX: enable RLS with NO policies. With RLS on and zero policies,
-- the `anon` and `authenticated` roles are denied all access via PostgREST.
-- The server is unaffected: it connects as the `postgres` owner role
-- (DATABASE_URL), which BYPASSES RLS — so tRPC keeps working untouched.
-- We do NOT use FORCE, precisely so the owner keeps bypassing.
--
-- The frontend never queries tables via PostgREST (only Supabase Auth),
-- so no application policies are needed. If we ever expose the data API
-- to the browser, add org-scoped policies then.
--
-- Dynamic over every public table so it also covers any table whose
-- snake_case name we might mistype, and so it self-heals if RLS was
-- toggled off. drizzle's own bookkeeping table lives in the `drizzle`
-- schema, so it is untouched.
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
