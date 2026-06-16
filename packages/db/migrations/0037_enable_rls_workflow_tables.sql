-- ─────────────────────────────────────────────────────────────────
-- Re-enable Row Level Security on every public table.
--
-- Migration 0027 enabled RLS on every public table that existed at the time,
-- and the deploy guard (check-rls) fails the build if any public table has RLS
-- off. The Workflow Studio tables added since then (workflows, workflow_versions,
-- workflow_runs, workflow_run_steps, step_templates, step_tests, step_test_runs,
-- connections, workflow_jobs, workflow_triggers) were created by Drizzle with RLS
-- DISABLED, so the production deploy now fails the guard.
--
-- Same dynamic, idempotent approach as 0027: enable RLS (no policies) on every
-- public table. Re-enabling an already-enabled table is a no-op, so this also
-- self-heals and covers any future table. The server connects as the postgres
-- owner role, which bypasses RLS, so tRPC is unaffected; anon/authenticated are
-- denied direct PostgREST access. drizzle's bookkeeping lives in the `drizzle`
-- schema and is untouched.
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
