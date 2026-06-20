import { Navigate } from "react-router-dom";
import { trpc } from "../lib/trpc";

/**
 * Authorization gate (Velada's pattern, in Beamy).
 *
 * Calls `me.authorize` — a READ-ONLY verdict — and routes on it. Unlike the old
 * gate, it NEVER force-signs-out: a signed-in user who simply isn't in a
 * workspace is shown a calm dead-end, not bounced into a login loop.
 *
 *   - has a membership                 → render the app
 *   - has a pending email-matched invite (server-provided token)
 *                                      → /redeem?token=… to finish it
 *   - is a platform admin, no membership → /admin/access (the console)
 *   - none of the above                → /redeem (the "ask your admin" screen)
 *
 * The pending-invite token comes from the SERVER (matched on the verified
 * email), so it survives OAuth round-trips with no localStorage handoff.
 */
export function OrgGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = trpc.me.authorize.useQuery(undefined, {
    retry: false,
  });

  // No verifiable user (token expired / rejected) → back to sign-in.
  if (isError) return <Navigate to="/login" replace />;

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }

  if (data.hasMembership) return <>{children}</>;
  if (data.pendingInviteToken)
    return (
      <Navigate
        to={`/redeem?token=${encodeURIComponent(data.pendingInviteToken)}`}
        replace
      />
    );
  if (data.isPlatformAdmin) return <Navigate to="/admin/access" replace />;

  // Signed in, but no workspace + no invite → calm dead-end (no sign-out).
  return <Navigate to="/redeem" replace />;
}
