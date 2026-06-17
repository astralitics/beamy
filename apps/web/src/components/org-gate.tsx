import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { trpc } from "../lib/trpc";
import { readPendingInvite } from "../lib/invite";

/**
 * Authorization gate — petfactory's whitelist behavior, in Beamy.
 *
 * Calls `me.authorize`, which server-side treats you as authorized only if you
 * have a membership OR an unused invite addressed to your email (auto-creating
 * the membership in that second case). Anyone else is **signed out** and
 * bounced to /login?error=not_authorized — re-checked on every app render, so
 * a user whose access was revoked can't linger.
 *
 * (Mirrors petfactory's AuthContext `enforceAuthorized` + sign-out.)
 */
export function OrgGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = trpc.me.authorize.useQuery(undefined, {
    retry: false,
  });

  const authorized = data?.authorized ?? null;
  // An invite token parked before sign-in (the invite-link round-trip). If present,
  // we send the user to /redeem to accept it rather than signing them out — this is
  // how a fresh sign-in joins their first (or an additional) workspace.
  const pendingInvite = readPendingInvite();

  useEffect(() => {
    if (authorized !== false) return;
    if (pendingInvite) return; // redeem it (redirect below) instead of signing out
    // Not authorized → sign out + bounce to /login with the reason banner.
    // Done synchronously (NOT chained off signOut's promise, which waits on the
    // network token-revoke) so RequireAuth's plain /login redirect can't win
    // the race and swallow the ?error param. We drop the stored session key
    // ourselves so the hard redirect can't loop back in.
    void supabase.auth.signOut();
    try {
      localStorage.removeItem("beamy.auth"); // == supabase client storageKey
    } catch {
      /* storage disabled — the revoke above still clears the session */
    }
    window.location.replace("/login?error=not_authorized");
  }, [authorized, pendingInvite]);

  // No verifiable user (token expired / anonymous) → back to sign-in.
  if (isError) return <Navigate to="/login" replace />;

  // Signed in but not yet a member, arrived via an invite link → redeem it.
  if (authorized === false && pendingInvite) return <Navigate to="/redeem" replace />;

  // Loading, or unauthorized + mid-sign-out: hold on a spinner.
  if (isLoading || authorized !== true) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }

  return <>{children}</>;
}
