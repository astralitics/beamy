export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl p-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Milestone 0 — Scaffold + tenancy
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Beamy is alive.
      </h1>
      <p className="mt-3 text-slate-600">
        This is the bare web shell — a sidenav, a router, Tailwind, and tRPC
        ready for procedures. Auth and the database aren&apos;t wired yet; that
        comes next.
      </p>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <p className="font-medium text-slate-900">What&apos;s in the repo</p>
        <ul className="mt-3 space-y-1.5 text-slate-600">
          <li>
            <code className="text-slate-800">apps/web</code> — this app.
          </li>
          <li>
            <code className="text-slate-800">packages/db</code> — Drizzle schema
            for <code>orgs</code>, <code>org_memberships</code>,{" "}
            <code>invitations</code>, <code>audit_log</code>.
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
        <p className="font-medium">Next up</p>
        <p className="mt-1">
          Stand up Supabase (Auth + Postgres), generate the first migration,
          wire the tRPC handler into Vite, and ship the sign-up flow that
          creates a fresh org.
        </p>
      </div>
    </div>
  );
}
