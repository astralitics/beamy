import { Navigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

/**
 * Membership gate. Sits *inside* <RequireAuth> (so a Supabase session already
 * exists) and *ahead* of the app shell. A signed-in user with no org
 * membership — e.g. a fresh Google sign-in with no invite — is routed to
 * /redeem rather than dropped onto a dashboard that 403s every query.
 *
 * This is the invite-only "are you authorized?" gate: the construction/design
 * equivalent of petfactory's `am_i_authorized`, expressed in Beamy's tRPC
 * idiom via the non-throwing `me.membership` probe.
 */
export function OrgGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = trpc.me.membership.useQuery(undefined, {
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }
  // No verifiable user (token expired / went anonymous) → back to sign-in.
  if (isError) return <Navigate to="/login" replace />;
  if (!data?.hasMembership) return <Navigate to="/redeem" replace />;
  return <>{children}</>;
}
