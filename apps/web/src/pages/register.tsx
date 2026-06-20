import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { Field, inputCls } from "./login";

/**
 * RegisterPage — create your LOGIN (Supabase auth account) only.
 *
 * Beamy is strictly invite-only: this page does NOT create a workspace. It
 * exists so an invited person who doesn't yet have an account can make one,
 * then have their email-matched invite grant them access (the `OrgGate` +
 * pending-invite bridge takes over once a session lands). Workspaces are
 * created by a platform admin, never here.
 */
type LocationState = { from?: { pathname: string } };

export default function RegisterPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from?.pathname ?? "/";

  if (!loading && session) return <Navigate to={from} replace />;

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-md p-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">Supabase isn't configured</p>
          <p className="mt-2">
            Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>, then
            restart the dev server.
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
      const { error: suErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (suErr) throw suErr;
      // Session (if email confirmation is off) → the redirect above takes over;
      // otherwise we send them to where they came from (their invite) so they
      // can sign in once confirmed.
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-10">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-semibold tracking-tight">Beamy</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
          M1
        </span>
      </div>
      <h1 className="mt-6 text-xl font-semibold tracking-tight text-slate-900">
        Create your account
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Sign up to accept your workspace invite. You'll join the workspace you
        were invited to once you're signed in.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <Field label="Email">
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
        <Field label="Password">
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            autoComplete="new-password"
          />
        </Field>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Working…" : "Create account"}
        </button>
      </form>

      <p className="mt-8 text-xs text-slate-400">
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => navigate("/login", { state: { from: { pathname: from } } })}
          className="font-medium text-slate-600 hover:text-slate-900"
        >
          Sign in
        </button>
        .
      </p>
    </div>
  );
}
