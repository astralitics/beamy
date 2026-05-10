import { trpc } from "../lib/trpc";

export default function HomePage() {
  const ping = trpc.me.ping.useQuery();
  const whoami = trpc.me.whoami.useQuery();

  return (
    <div className="mx-auto max-w-3xl p-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Milestone 1 — Core entities + auth
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Beamy is alive.
      </h1>
      <p className="mt-3 text-slate-600">
        Web shell, sidenav, tRPC mounted as Vite middleware at{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
          /api/trpc
        </code>
        . Real auth wiring lands later in M1; until then every request runs as
        the seeded dev user.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <SmokeStatus
          label="me.ping"
          loading={ping.isLoading}
          error={ping.error?.message}
          ok={ping.data ? `ok @ ${new Date(ping.data.ts).toLocaleTimeString()}` : null}
        />
        <SmokeStatus
          label="me.whoami"
          loading={whoami.isLoading}
          error={whoami.error?.message}
          ok={
            whoami.data
              ? `${whoami.data.org.name} (${whoami.data.role})`
              : null
          }
        />
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <p className="font-medium text-slate-900">What&apos;s in the repo</p>
        <ul className="mt-3 space-y-1.5 text-slate-600">
          <li>
            <code className="text-slate-800">apps/web</code> — this app.
          </li>
          <li>
            <code className="text-slate-800">packages/db</code> — Drizzle schema +
            baseline migration for <code>orgs</code>,{" "}
            <code>org_memberships</code>, <code>invitations</code>,{" "}
            <code>audit_log</code>.
          </li>
          <li>
            <code className="text-slate-800">packages/trpc</code> —{" "}
            <code>orgScopedProcedure</code> middleware (D-10).
          </li>
          <li>
            <code className="text-slate-800">packages/shared</code> — Zod
            schemas.
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-medium">Next up — M1</p>
        <p className="mt-1">
          Apply the baseline migration + run <code>pnpm db:seed</code>, then
          land core entity CRUD (clients, vendors, services, vendor
          compliance), the i18n scaffold for US + MX, and Supabase auth wiring.
        </p>
      </div>
    </div>
  );
}

function SmokeStatus({
  label,
  loading,
  error,
  ok,
}: {
  label: string;
  loading: boolean;
  error?: string;
  ok: string | null;
}) {
  const tone = error
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : ok
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className={`rounded-lg border p-3 text-xs ${tone}`}>
      <p className="font-mono text-[11px] uppercase tracking-wider opacity-70">
        {label}
      </p>
      <p className="mt-1 font-medium">
        {loading ? "loading…" : error ? error : ok ?? "—"}
      </p>
    </div>
  );
}
