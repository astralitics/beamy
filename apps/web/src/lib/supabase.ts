import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client. Reads its config from Vite env vars; both
 * must be set for auth to work. The `VITE_` prefix is required so Vite
 * exposes them to the client bundle.
 *
 * For local dev, these come from `supabase status`. Example:
 *   VITE_SUPABASE_URL=http://127.0.0.1:54521
 *   VITE_SUPABASE_ANON_KEY=sb_publishable_*****
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Don't throw at import time — the rest of the app still needs to render
  // (e.g., to show a "Supabase env not configured" error in the auth UI).
  // The actual auth functions will surface the missing config to the user.
  console.warn(
    "[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set. Auth will be disabled.",
  );
}

export const supabase: SupabaseClient = createClient(
  url ?? "http://placeholder",
  anonKey ?? "placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "beamy.auth",
    },
  },
);

export const supabaseConfigured = Boolean(url && anonKey);
