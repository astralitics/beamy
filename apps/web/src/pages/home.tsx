import { trpc } from "../lib/trpc";
import { useFormatters, useLocale, useT } from "../lib/i18n";

export default function HomePage() {
  const t = useT();
  const fmt = useFormatters();
  const { locale } = useLocale();
  const ping = trpc.me.ping.useQuery();
  const whoami = trpc.me.whoami.useQuery();

  return (
    <div className="mx-auto max-w-3xl p-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {t("home.milestone")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t("home.title")}
      </h1>
      <p className="mt-3 text-slate-600">{t("home.lede")}</p>
      <p className="mt-1 text-xs text-slate-400">
        locale: <code>{locale}</code>
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <SmokeStatus
          label="me.ping"
          loading={ping.isLoading}
          error={ping.error?.message}
          ok={ping.data ? `ok @ ${fmt.time(ping.data.ts)}` : null}
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
        <p className="font-medium text-slate-900">{t("home.repo.heading")}</p>
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
        <p className="font-medium">{t("home.next.heading")}</p>
        <p className="mt-1">{t("home.next.body")}</p>
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
