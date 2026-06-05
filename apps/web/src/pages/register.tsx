import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { trpc } from "../lib/trpc";
import { Field, inputCls } from "./login";

/**
 * RegisterPage — self-serve workspace creation (bootstrap).
 *
 * Deliberately NOT linked from /login, which is invite-only (like petfactory).
 * This is how the FIRST owner of a brand-new workspace is created: sign up with
 * email + password, then provision the org. Everyone else joins via an invite
 * (/invite/:token). Mirrors petfactory's separate register route.
 */
export default function RegisterPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const createOrg = trpc.orgs.create.useMutation();

  if (!loading && session) return <Navigate to="/" replace />;

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-md p-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">Supabase isn't configured</p>
          <p className="mt-2">
            Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> and restart
            the dev server.
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
      // Default org name = "<local-part>'s Workspace" if blank.
      const localPart = email.split("@")[0] ?? "my";
      const name = orgName.trim() || `${localPart}'s Workspace`;
      const slug = slugify(name);
      await createOrg.mutateAsync({ name, slug });
      await utils.invalidate();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
        Create your workspace
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Set up a new agency workspace — you'll be its owner. Already invited? Use
        your invite link instead.
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
        <Field label="Workspace name (optional)">
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className={inputCls}
            placeholder="Anderson Construction"
          />
        </Field>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Working…" : "Create workspace"}
        </button>
      </form>

      <p className="mt-8 text-xs text-slate-400">
        Already have a workspace?{" "}
        <a href="/login" className="font-medium text-slate-600 hover:text-slate-900">
          Sign in
        </a>
        .
      </p>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
