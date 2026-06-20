import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { trpc } from "../lib/trpc";
import { setActiveOrg } from "../lib/active-org";
import { useT } from "../lib/i18n";
import { VERTICAL_LABELS, type Vertical } from "@beamy/shared";

const FIELD_CLS =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

/**
 * RedeemInvitePage — the invite landing (`/invite/:token`, `/redeem?token=…`).
 *
 * Email-gated, multi-org. Reached either by opening an invite link or by
 * `OrgGate` routing a signed-in user who has a pending invite (the token is
 * server-provided) or no workspace at all (no token → "ask your admin").
 *
 *  - logged out + token → show what you've been invited to + "Sign in to
 *    accept" that returns here (and, via OAuth, the server's pending-invite
 *    bridge recovers it even if router state is lost).
 *  - logged in + token  → accept into a membership (existing members included
 *    — joining an *additional* workspace is allowed). The server enforces the
 *    email gate; we surface a friendly mismatch message first.
 *  - logged in, no token → "you're not in a workspace yet" dead-end.
 */
export default function RedeemInvitePage() {
  const t = useT();
  const { session, loading: authLoading, signOut } = useAuth();
  const params = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const token = params.token?.trim() || sp.get("token")?.trim() || null;
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signupErr, setSignupErr] = useState<string | null>(null);

  const accept = trpc.members.accept.useMutation({
    onSuccess: (data) => {
      // Make the just-joined workspace active, then HARD reload so the new
      // x-active-org header is sent and the cache reloads against that org.
      setActiveOrg(data.orgId);
      window.location.assign("/");
    },
    onError: (e) => setError(e.message),
  });

  const peek = trpc.members.peekInvitation.useQuery(
    { token: token ?? "" },
    { enabled: Boolean(token), retry: false },
  );

  if (authLoading) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }

  // Dev-bypass (no Supabase configured): the seeded dev user already has an org.
  if (!supabaseConfigured) return <Navigate to="/" replace />;

  const email = session?.user?.email ?? null;

  // No token → sign-in (logged out) or the "ask your admin" dead-end (logged in).
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

  const valid = peek.data?.valid ? peek.data : null;
  const isWorkspace = valid?.kind === "workspace";
  const verticalLabel = valid
    ? VERTICAL_LABELS[valid.vertical as Vertical] ?? valid.vertical
    : "";
  const inviteEmail = valid?.email ?? null;

  const heading = isWorkspace ? t("redeem.create_workspace") : t("redeem.accept");
  const body = !valid
    ? t("redeem.loading_invitation")
    : isWorkspace
      ? t("redeem.create_workspace_body", {
          vertical: verticalLabel,
          name: valid.orgName,
        })
      : t("redeem.invited_as", { org: valid.orgName, role: valid.role ?? "" });

  // Logged OUT + a token. The invitee is (almost always) new, so lead straight
  // with account creation — email is fixed to the invite (email-gated), they
  // just pick a password (or use Google). On sign-up they're auto-joined.
  if (!session) {
    // Wait for the invite preview before showing the form (need the email).
    if (!valid) {
      return (
        <Shell email={null} onSignOut={undefined}>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {heading}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t("redeem.loading_invitation")}
          </p>
        </Shell>
      );
    }
    const acceptEmail = inviteEmail ?? "";
    const busy = submitting || accept.isPending;

    const createAndJoin = async (e: FormEvent) => {
      e.preventDefault();
      setSignupErr(null);
      setSubmitting(true);
      try {
        const { data, error: suErr } = await supabase.auth.signUp({
          email: acceptEmail,
          password,
        });
        if (suErr) throw suErr;
        if (data.session) {
          // Confirmation disabled → signed in immediately → accept + land in.
          accept.mutate({ token });
        } else {
          setSignupErr(
            "Check your email to confirm your account, then reopen this link.",
          );
          setSubmitting(false);
        }
      } catch (err) {
        setSignupErr(
          err instanceof Error
            ? /already registered/i.test(err.message)
              ? "You already have an account — sign in instead."
              : err.message
            : "Could not create your account.",
        );
        setSubmitting(false);
      }
    };

    const joinWithGoogle = async () => {
      setSignupErr(null);
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (oauthErr) setSignupErr(oauthErr.message);
    };

    return (
      <Shell email={null} onSignOut={undefined}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {isWorkspace ? t("redeem.create_workspace") : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <p className="mt-3 text-xs text-slate-500">
          Joining as <span className="font-medium">{acceptEmail}</span>
        </p>

        <button
          type="button"
          onClick={() => void joinWithGoogle()}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or set a password
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={createAndJoin} className="space-y-3">
          <input
            type="email"
            value={acceptEmail}
            readOnly
            className={`${FIELD_CLS} bg-slate-50 text-slate-500`}
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
            autoFocus
            autoComplete="new-password"
            className={FIELD_CLS}
          />
          {signupErr && <p className="text-sm text-rose-700">{signupErr}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? t("redeem.joining") : "Create account & join"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() =>
              navigate("/login", {
                state: { from: { pathname: location.pathname + location.search } },
              })
            }
            className="font-medium text-slate-700 hover:text-slate-900"
          >
            Sign in
          </button>
        </p>
      </Shell>
    );
  }

  // Signed in + token. Surface an email mismatch before the (server-enforced) gate.
  const emailMismatch = Boolean(
    inviteEmail && email && email.toLowerCase() !== inviteEmail.toLowerCase(),
  );

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
      {emailMismatch && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This invite is for <span className="font-medium">{inviteEmail}</span>,
          but you're signed in as{" "}
          <span className="font-medium">{email}</span>. Sign out and use that
          account to accept.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={accept.isPending || !peek.data?.valid || emailMismatch}
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
