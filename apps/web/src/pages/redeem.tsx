import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";
import { trpc } from "../lib/trpc";
import { setActiveOrg } from "../lib/active-org";
import { useT } from "../lib/i18n";
import { VERTICAL_LABELS, type Vertical } from "@beamy/shared";
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
  const t = useT();
  const { session, loading: authLoading, signOut } = useAuth();
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();

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
    onSuccess: (data) => {
      clearPendingInvite();
      // Make the just-joined workspace the active one, then HARD reload so the new
      // x-active-org header is sent and the query cache reloads against that org
      // (a soft navigate would keep the previous workspace's cached data + header).
      setActiveOrg(data.orgId);
      window.location.assign("/");
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

  // Signed-in member with no invite to act on → straight into the app.
  if (session && membership.data?.hasMembership && !token) {
    return <Navigate to="/" replace />;
  }

  const email = session?.user?.email ?? null;

  // No token at all: a logged-out visitor just needs to sign in; a signed-in user
  // with no workspace + no invite gets the "ask your admin" dead-end.
  if (!token) {
    if (!session) return <Navigate to="/login" replace />;
    return (
      <Shell email={email} onSignOut={() => void signOut()}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {t("redeem.no_workspace.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("redeem.no_workspace.body")}
        </p>
      </Shell>
    );
  }

  // Token present but invalid (used / expired / unknown).
  if (peek.data && !peek.data.valid) {
    const reason =
      peek.data.reason === "used"
        ? t("redeem.reason.used")
        : peek.data.reason === "expired"
          ? t("redeem.reason.expired")
          : t("redeem.reason.not_found");
    return (
      <Shell email={email} onSignOut={session ? () => void signOut() : undefined}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {t("redeem.unavailable.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{reason}</p>
      </Shell>
    );
  }

  // Valid (or still previewing) invite — the preview shared by the logged-out
  // "sign in to accept" screen and the signed-in "accept" screen.
  const valid = peek.data?.valid ? peek.data : null;
  const isWorkspace = valid?.kind === "workspace";
  const verticalLabel = valid
    ? VERTICAL_LABELS[valid.vertical as Vertical] ?? valid.vertical
    : "";

  const heading = isWorkspace ? t("redeem.create_workspace") : t("redeem.accept");
  const body = !valid
    ? t("redeem.loading_invitation")
    : isWorkspace
      ? t("redeem.create_workspace_body", {
          vertical: verticalLabel,
          name: valid.orgName,
        })
      : t("redeem.invited_as", { org: valid.orgName, role: valid.role ?? "" });

  // Logged OUT + a token: show what they've been invited to, then send them to sign
  // in and return straight here (the token was also stashed for the OAuth round-trip).
  if (!session) {
    return (
      <Shell email={null} onSignOut={undefined}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <button
          type="button"
          onClick={() =>
            navigate("/login", { state: { from: { pathname: location.pathname } } })
          }
          className="mt-5 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {t("redeem.sign_in_to_accept")}
        </button>
      </Shell>
    );
  }

  // Signed in + a valid token → the accept screen (existing members included; multi-org).
  return (
    <Shell
      email={email}
      onSignOut={() => void signOut()}
      signOutLabel={t("redeem.use_different_account")}
    >
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        {heading}
      </h1>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
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
        {accept.isPending
          ? isWorkspace
            ? t("redeem.creating_workspace")
            : t("redeem.joining")
          : heading}
      </button>
    </Shell>
  );
}

function Shell({
  children,
  email,
  onSignOut,
  signOutLabel,
}: {
  children: React.ReactNode;
  email: string | null;
  onSignOut?: () => void;
  signOutLabel?: string;
}) {
  const t = useT();
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
        {onSignOut && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          {email && (
            <p className="text-xs text-slate-400">
              {t("redeem.signed_in_as", { email })}
            </p>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            {signOutLabel ?? t("redeem.sign_out")}
          </button>
        </div>
        )}
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
