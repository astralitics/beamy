import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";
import { trpc } from "../lib/trpc";
import {
  clearPendingInvite,
  readPendingInvite,
  stashPendingInvite,
} from "../lib/invite";

/**
 * RedeemInvitePage — the invite-only landing.
 *
 * Reached when either:
 *  - someone opens an invite link (`/invite/:token`), or
 *  - <OrgGate> bounces a signed-in user who has no org membership yet
 *    (e.g. a fresh Google sign-in with no invite).
 *
 * Flow (petfactory's RedeemInvitePage, in Beamy's tRPC idiom):
 *  - logged out + token  → stash the token, send to /login; we redeem once the
 *    OAuth round-trip lands us back signed in.
 *  - logged in  + token  → preview the org, then accept into a membership.
 *  - logged in, no token → "you're not in a workspace yet" dead-end + sign out.
 */
export default function RedeemInvitePage() {
  const { session, loading: authLoading, signOut } = useAuth();
  const params = useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // Token comes from the invite-link path (/invite/:token); fall back to one
  // stashed before an OAuth redirect (when OrgGate bounced us to /redeem).
  const urlToken = params.token?.trim() || null;
  // Prefer the URL token; fall back to one stashed before an OAuth redirect.
  const token = useMemo(() => urlToken ?? readPendingInvite(), [urlToken]);
  const [error, setError] = useState<string | null>(null);

  // Arrived from an invite link but not signed in yet → park the token so it
  // survives the trip through /login (and any OAuth redirect).
  useEffect(() => {
    if (!authLoading && supabaseConfigured && !session && urlToken) {
      stashPendingInvite(urlToken);
    }
  }, [authLoading, session, urlToken]);

  const accept = trpc.members.accept.useMutation({
    onSuccess: async () => {
      clearPendingInvite();
      await utils.me.membership.invalidate();
      navigate("/", { replace: true });
    },
    onError: (e) => setError(e.message),
  });

  const peek = trpc.members.peekInvitation.useQuery(
    { token: token ?? "" },
    { enabled: Boolean(token), retry: false },
  );

  const membership = trpc.me.membership.useQuery(undefined, {
    enabled: Boolean(session) && supabaseConfigured,
    retry: false,
  });

  if (authLoading) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }

  // Dev-bypass (no Supabase configured): the seeded dev user already has an org.
  if (!supabaseConfigured) return <Navigate to="/" replace />;

  // Not signed in → go authenticate (the token, if any, was stashed above).
  if (!session) return <Navigate to="/login" replace />;

  // Already a member → nothing to redeem.
  if (membership.data?.hasMembership) return <Navigate to="/" replace />;

  const email = session.user?.email ?? null;

  // No token → the "ask your admin" dead-end.
  if (!token) {
    return (
      <Shell email={email} onSignOut={() => void signOut()}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          No workspace yet
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          You're signed in but don't belong to a workspace yet. Open the invite
          link your admin shared with you, or ask them to send a new one.
        </p>
      </Shell>
    );
  }

  // Token present but invalid (used / expired / unknown).
  if (peek.data && !peek.data.valid) {
    const reason =
      peek.data.reason === "used"
        ? "That invite has already been used."
        : peek.data.reason === "expired"
          ? "That invite has expired. Ask your admin for a new one."
          : "We didn't recognize that invite link.";
    return (
      <Shell email={email} onSignOut={() => void signOut()}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Invite unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-600">{reason}</p>
      </Shell>
    );
  }

  // Valid (or still previewing) → confirmation screen.
  const orgName = peek.data?.valid ? peek.data.orgName : null;
  const role = peek.data?.valid ? peek.data.role : null;
  return (
    <Shell
      email={email}
      onSignOut={() => void signOut()}
      signOutLabel="Use a different account"
    >
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        Accept invitation
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {orgName ? (
          <>
            You've been invited to join <strong>{orgName}</strong>
            {role ? (
              <>
                {" "}
                as <strong>{role}</strong>
              </>
            ) : null}
            .
          </>
        ) : (
          <>Loading your invitation…</>
        )}
      </p>
      {error && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={accept.isPending || !peek.data?.valid}
        onClick={() => {
          setError(null);
          accept.mutate({ token });
        }}
        className="mt-5 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {accept.isPending ? "Joining…" : "Accept invitation"}
      </button>
    </Shell>
  );
}

function Shell({
  children,
  email,
  onSignOut,
  signOutLabel = "Sign out",
}: {
  children: React.ReactNode;
  email: string | null;
  onSignOut: () => void;
  signOutLabel?: string;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-10">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-semibold tracking-tight">Beamy</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
          M1
        </span>
      </div>
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        {children}
        <div className="mt-6 border-t border-slate-100 pt-4">
          {email && (
            <p className="text-xs text-slate-400">Signed in as {email}</p>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            {signOutLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">{children}</div>
  );
}

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
  );
}
