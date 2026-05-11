import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";

/**
 * Route gate. Redirects to /login when no session is active, EXCEPT when
 * Supabase isn't configured at all — in that case we fall through to the
 * dev userId bypass server-side (see vite.config.ts). This keeps the
 * dev-from-scratch workflow alive even before .env is filled in.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (!supabaseConfigured) return <>{children}</>;
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
