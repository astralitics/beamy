import { trpc } from "../lib/trpc";
import { useFormatters, useLocale, useT } from "../lib/i18n";

export default function HomePage() {
  const t = useT();
  const fmt = useFormatters();
  const { locale } = useLocale();
  const ping = trpc.me.ping.useQuery();
  const whoami = trpc.me.whoami.useQuery();

  return (
    <div className="relative">
      {/* Faint blueprint-grid on the hero strip. Restrained — only at the top. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-blueprint-grid bg-grid-32 opacity-60"
      />
      <div className="relative mx-auto max-w-3xl p-10">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-safety-700">
          {t("home.milestone")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-blueprint-900">
          {t("home.title")}
        </h1>
        <p className="mt-3 text-slate-600">{t("home.lede")}</p>
        <p className="mt-1 font-mono text-xs text-slate-400">
          locale · <span>{locale}</span>
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

        <div className="mt-8 rounded-lg border border-paper-200 bg-white p-5 text-sm">
          <p className="font-semibold text-blueprint-900">
            {t("home.repo.heading")}
          </p>
          <ul className="mt-3 space-y-1.5 text-slate-600">
            <li>
              <code className="font-mono text-slate-800">apps/web</code> — this
              app.
            </li>
            <li>
              <code className="font-mono text-slate-800">packages/db</code> —
              Drizzle schema + baseline migration for{" "}
              <code className="font-mono">orgs</code>,{" "}
              <code className="font-mono">org_memberships</code>,{" "}
              <code className="font-mono">invitations</code>,{" "}
              <code className="font-mono">audit_log</code>.
            </li>
            <li>
              <code className="font-mono text-slate-800">packages/trpc</code> —{" "}
              <code className="font-mono">orgScopedProcedure</code> middleware
              (D-10).
            </li>
            <li>
              <code className="font-mono text-slate-800">packages/shared</code>{" "}
              — Zod schemas.
            </li>
          </ul>
        </div>

        <div className="mt-6 rounded-lg border border-safety-200 bg-safety-50 p-5 text-sm text-safety-800">
          <p className="font-semibold">{t("home.next.heading")}</p>
          <p className="mt-1">{t("home.next.body")}</p>
        </div>
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
    ? "border-rose-200 bg-rose-50 text-rose-900 ring-rose-100"
    : ok
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 ring-emerald-100"
      : "border-paper-200 bg-white text-slate-700 ring-paper-100";
  return (
    <div
      className={`rounded-lg border p-3 text-xs ring-1 ring-inset ${tone}`}
    >
      <p className="font-mono text-[11px] uppercase tracking-wider opacity-70">
        {label}
      </p>
      <p className="mt-1 font-medium">
        {loading ? "loading…" : error ? error : ok ?? "—"}
      </p>
    </div>
  );
}
