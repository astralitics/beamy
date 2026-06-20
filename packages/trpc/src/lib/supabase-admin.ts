import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for platform-admin operations (creating auth
 * users, listing users, deleting users). The service-role key bypasses RLS and
 * the Auth admin API — so this is ONLY ever reachable behind
 * `platformAdminProcedure`. Created lazily + memoized so importing this module
 * doesn't require the env at boot.
 */
let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for platform-admin / auth-user operations.",
    );
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
