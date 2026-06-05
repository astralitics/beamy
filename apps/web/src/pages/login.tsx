import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { trpc } from "../lib/trpc";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const utils = trpc.useUtils();
  const createOrg = trpc.orgs.create.useMutation();

  // Already signed in? Bounce home.
  if (!loading && session) return <Navigate to="/" replace />;

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-md p-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">Supabase isn't configured</p>
          <p className="mt-2">
            Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> (from{" "}
            <code>supabase status</code>) and restart the dev server.
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
      if (mode === "signup") {
        const { error: suErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (suErr) throw suErr;
        // Default org name = "<local-part>'s Workspace" if blank.
        const localPart = email.split("@")[0] ?? "my";
        const name = orgName.trim() || `${localPart}'s Workspace`;
        const slug = slugify(name);
        await createOrg.mutateAsync({ name, slug });
        await utils.invalidate();
        navigate("/", { replace: true });
      } else {
        const { error: siErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (siErr) throw siErr;
        await utils.invalidate();
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
    // On success the browser navigates to Google; we only reach here on error.
    if (oauthErr) {
      setError(oauthErr.message);
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
      <p className="mt-1 text-sm text-slate-600">
        The operating system for small construction & design agencies.
      </p>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={submitting}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or use email
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
        <TabButton active={mode === "signin"} onClick={() => setMode("signin")}>
          Sign in
        </TabButton>
        <TabButton active={mode === "signup"} onClick={() => setMode("signup")}>
          Create workspace
        </TabButton>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
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
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
          />
        </Field>
        {mode === "signup" && (
          <Field label="Workspace name (optional)">
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className={inputCls}
              placeholder="Anderson Construction"
            />
          </Field>
        )}
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting
            ? "Working…"
            : mode === "signup"
              ? "Create workspace"
              : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1 text-sm ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
