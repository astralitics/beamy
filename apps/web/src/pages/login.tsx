import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";

/**
 * LoginPage — invite-only, mirroring petfactory's LoginPage.
 *
 * Sign in only: Google or email/password. There is NO self-serve workspace
 * creation here — joining a workspace happens through an invite (see
 * `/invite/:token` + `/redeem`). The first workspace is bootstrapped from the
 * unlinked `/register` route.
 *
 * Banners are driven by URL params, like petfactory:
 *   ?error=not_authorized   — signed in but not in a workspace
 *   ?invite=used|expired|not_found — a redeem attempt that didn't take
 *
 * Visually this is the HORIZON "hero moment": a full low-sun horizon line
 * across the canvas behind a Fraunces wordmark — the emotional reward.
 */
type LocationState = { from?: { pathname: string } };

const BANNER_TONE: Record<"amber" | "rose", string> = {
  amber: "border-warn/30 bg-warn-subtle text-warn",
  rose: "border-danger/30 bg-danger-subtle text-danger",
};

const ERROR_BANNER: Record<string, { tone: "amber" | "rose"; key: MessageKey }> =
  {
    not_authorized: { tone: "rose", key: "login.banner.not_authorized" },
  };

const INVITE_BANNER: Record<
  string,
  { tone: "amber" | "rose"; key: MessageKey }
> = {
  used: { tone: "amber", key: "login.banner.invite_used" },
  expired: { tone: "amber", key: "login.banner.invite_expired" },
  not_found: { tone: "rose", key: "login.banner.invite_not_found" },
};

export default function LoginPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const errorNotice = params.get("error");
  const inviteNotice = params.get("invite");
  const banner =
    (errorNotice ? ERROR_BANNER[errorNotice] : undefined) ??
    (inviteNotice ? INVITE_BANNER[inviteNotice] : undefined);

  // Already signed in? Bounce to where they were headed (or home).
  if (!loading && session) {
    const to = (location.state as LocationState | null)?.from?.pathname ?? "/";
    return <Navigate to={to} replace />;
  }

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-md p-10">
        <div className="rounded-xl border border-warn/30 bg-warn-subtle p-6 text-sm text-warn">
          <p className="font-medium">{t("login.supabase.title")}</p>
          <p className="mt-2 text-text-muted">
            {t("login.supabase.set")} <code>VITE_SUPABASE_URL</code>{" "}
            {t("login.supabase.and")} <code>VITE_SUPABASE_ANON_KEY</code>{" "}
            {t("login.supabase.in")} <code>.env</code> (
            {t("login.supabase.from")} <code>supabase status</code>){" "}
            {t("login.supabase.restart")}
          </p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: siErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (siErr) throw siErr;
      // Auth state change → session → the redirect above takes over.
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.error.fallback"));
    } finally {
      setSubmitting(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setSubmitting(true);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="graph-paper flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px] animate-rise">
        {/* The hero moment — the wordmark plotted over a blueprint rule. */}
        <div className="text-center">
          <div className="inline-flex items-baseline gap-1.5">
            <span className="font-display text-5xl font-extrabold tracking-tightest text-text">
              Beamy
            </span>
            <span className="h-1.5 w-1.5 translate-y-[-4px] rounded-full bg-accent" />
          </div>
          <div className="horizon-line mx-auto mt-5 w-36 rounded-full" aria-hidden />
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
            The firm's brain · drawing set
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-text-muted">
            {t("login.tagline")}
          </p>
        </div>

        {banner && (
          <div
            className={`mt-7 rounded-[10px] border px-3.5 py-2.5 text-xs ${BANNER_TONE[banner.tone]}`}
          >
            {t(banner.key)}
          </div>
        )}

        {/* Auth card — banded surface. */}
        <div className="horizon-top elevated relative mt-8 overflow-hidden rounded-xl border border-border bg-surface px-7 py-8 shadow-lift">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2.5 rounded-[10px] border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-bg-subtle disabled:opacity-50"
          >
            <GoogleIcon />
            {t("login.continue_google")}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-text-faint">
            <span className="h-px flex-1 bg-border-subtle" />
            {t("login.or_use_email")}
            <span className="h-px flex-1 bg-border-subtle" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3.5">
            <Field label={t("login.field.email")}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                autoFocus
                autoComplete="email"
              />
            </Field>
            <Field label={t("login.field.password")}>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                autoComplete="current-password"
              />
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded-[10px] bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover active:translate-y-px disabled:opacity-50"
            >
              {submitting ? t("login.working") : t("login.sign_in")}
            </button>
          </form>
        </div>

        <p className="mt-7 text-center text-xs text-text-faint">
          {t("login.first_time")}
        </p>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[13px] font-medium text-text">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputCls =
  "block w-full rounded-[10px] border border-border-strong bg-surface-2 px-3.5 h-11 text-[15px] text-text placeholder:text-text-faint transition-colors focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
