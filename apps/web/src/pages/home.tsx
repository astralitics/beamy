import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { useFormatters, useLabels, useT } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";
import { useCommandPalette } from "../components/command-palette";
import { Icon, Money } from "../components/ui";
import { EmptyState } from "../components/vertical-mark";

/**
 * Home — the firm's daily cockpit. "What needs you today?" across every active
 * project, a portfolio pulse, and recall front-and-centre. BEAM styling: ink +
 * whitespace, one beam of colour on the thing that needs you, a clean table.
 */
type Attention = {
  key: string;
  projectName: string;
  label: string;
  value: number;
  sev: 1 | 2 | 3;
  to: string;
};

export default function HomePage() {
  const t = useT();
  const L = useLabels();
  const fmt = useFormatters();
  const { open } = useCommandPalette();
  const whoami = trpc.me.whoami.useQuery();

  const projectsQ = trpc.projects.list.useQuery({});
  const projects = projectsQ.data ?? [];
  const active = projects.filter((p) => p.status === "active");
  const leads = projects.filter((p) => p.status === "lead");

  const statsResults = trpc.useQueries((tt) =>
    active.map((p) => tt.projects.overviewStats({ projectId: p.id })),
  );

  const attention: Attention[] = [];
  active.forEach((p, i) => {
    const s = statsResults[i]?.data;
    if (!s) return;
    const base = `/projects/${p.id}`;
    const push = (value: number, sev: 1 | 2 | 3, labelKey: MessageKey, to: string) => {
      if (value > 0)
        attention.push({ key: `${p.id}-${labelKey}`, projectName: p.name, label: t(labelKey), value, sev, to });
    };
    push(s.billsInvoices.overdueBillsCount, 3, "overview.signal.overdue_bills", `${base}/money`);
    push(s.billsInvoices.overdueInvoicesCount, 3, "overview.signal.overdue_invoices", `${base}/money`);
    push(s.workItems.overdueCount, 3, "overview.signal.overdue_work", `${base}/work-plan`);
    push(s.changeOrders.awaitingDecisionCount, 2, "overview.signal.cos_awaiting_decision", `${base}/change-orders`);
    push(s.bids.comparingCount, 2, "overview.signal.bids_to_compare", `${base}/bids`);
    push(s.bids.expiringCount, 2, "overview.signal.expired_bids", `${base}/bids`);
    push(s.workItems.blockedCount, 2, "overview.signal.blocked_work", `${base}/work-plan`);
  });
  attention.sort((a, b) => b.sev - a.sev || b.value - a.value);

  const contractByCcy: Record<string, number> = {};
  active.forEach((p) => {
    if (p.contractAmount && p.contractCurrency) {
      const n = Number(p.contractAmount);
      if (!Number.isNaN(n))
        contractByCcy[p.contractCurrency] = (contractByCcy[p.contractCurrency] ?? 0) + n;
    }
  });
  const ccyEntries = Object.entries(contractByCcy).sort((a, b) => b[1] - a[1]);
  const primaryCcy = ccyEntries[0];

  const hour = new Date().getHours();
  const greetKey: MessageKey =
    hour < 12 ? "home.greeting.morning" : hour < 18 ? "home.greeting.afternoon" : "home.greeting.evening";

  const loading = projectsQ.isLoading;
  const need = attention.length;

  return (
    <div className="mx-auto max-w-5xl animate-rise px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      {/* hero */}
      <p className="section-label">{whoami.data?.org.name ?? "—"}</p>
      <h1 className="mt-3 font-display text-[46px] font-bold leading-[0.95] tracking-tightest text-text">
        {t(greetKey)}.
      </h1>
      <p className="mt-3 text-[18px] leading-relaxed text-text-muted">
        {loading
          ? "…"
          : need > 0
            ? `${need} ${need === 1 ? "thing needs" : "things need"} you today. Nothing’s on fire.`
            : "All caught up today."}
      </p>

      {/* recall */}
      <button
        type="button"
        onClick={open}
        className="mt-7 flex h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-5 text-left shadow-sm transition-colors hover:border-border-strong"
      >
        <Icon name="search" className="h-[18px] w-[18px] text-text-faint" />
        <span className="flex-1 text-[15px] text-text-faint">{t("home.search_cta")}</span>
        <kbd className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-faint">⌘K</kbd>
      </button>

      {/* pulse */}
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
        <Stat label={t("home.pulse.active")} value={loading ? "—" : String(active.length)} />
        <Stat label={t("home.pulse.pipeline")} value={loading ? "—" : String(leads.length)} />
        <Stat
          label={t("home.pulse.contract")}
          node={
            primaryCcy ? (
              <span>
                <Money amount={primaryCcy[1]} currency={primaryCcy[0]} className="text-2xl" />
                {ccyEntries.length > 1 && (
                  <span className="ml-1 text-[12px] text-text-faint">+{ccyEntries.length - 1}</span>
                )}
              </span>
            ) : (
              <span className="num text-2xl text-text-faint">—</span>
            )
          }
        />
        <Stat
          label={t("home.pulse.attention")}
          value={String(need)}
          tone={need > 0 ? "accent" : "default"}
        />
      </div>

      {/* needs your attention */}
      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold tracking-tight text-text">{t("home.attention")}</h2>
          <p className="text-[13px] text-text-muted">{t("home.attention_hint")}</p>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {loading ? (
            <p className="px-6 py-8 text-sm text-text-muted">{t("common.loading")}</p>
          ) : need === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-display text-2xl font-bold text-text">{t("home.attention_empty")}</p>
              <p className="mt-2 text-[14px] text-text-muted">{t("home.attention_empty_sub")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {attention.slice(0, 7).map((a, i) => (
                <li key={a.key}>
                  <Link
                    to={a.to}
                    className={`group flex items-center gap-5 px-5 py-3.5 transition-colors hover:bg-bg-subtle ${
                      i === 0 && a.sev >= 3 ? "shadow-[inset_4px_0_0] shadow-accent" : ""
                    }`}
                  >
                    <span
                      className={`num w-10 shrink-0 text-[24px] leading-none ${
                        a.sev >= 3 ? "!text-accent" : a.sev >= 2 ? "!text-warn" : "text-text-muted"
                      }`}
                    >
                      {a.value}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-text">{a.label}</span>
                      <span className="block truncate text-[12px] text-text-muted">{a.projectName}</span>
                    </span>
                    <Icon
                      name="arrow-right"
                      className="h-4 w-4 shrink-0 text-text-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* active projects */}
      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold tracking-tight text-text">{t("home.active")}</h2>
          <Link to="/projects" className="text-[13px] font-semibold text-accent hover:text-accent-hover">
            {t("home.view_all")}
          </Link>
        </div>
        {loading ? (
          <p className="mt-5 px-1 text-sm text-text-muted">{t("common.loading")}</p>
        ) : active.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title={t("home.no_projects")}
              action={
                <Link
                  to="/projects?new=1"
                  className="text-[13px] font-semibold text-accent hover:text-accent-hover"
                >
                  {t("home.start_first")}
                </Link>
              }
            />
          </div>
        ) : (
          <div className="data-table mt-5">
            <table>
              <tbody>
                {active.map((p) => (
                  <tr
                    key={p.id}
                    className="clickable group"
                    onClick={() => (window.location.href = `/projects/${p.id}`)}
                  >
                    <td>
                      <Link
                        to={`/projects/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-display text-[17px] font-bold leading-tight tracking-tight text-text group-hover:text-accent"
                      >
                        {p.name}
                      </Link>
                      <span className="ml-3 text-[12px] text-text-muted">{L.projectType(p.projectType)}</span>
                    </td>
                    <td className="r">
                      <Money amount={p.contractAmount} currency={p.contractCurrency} mono />
                    </td>
                    <td className="r hidden whitespace-nowrap text-[12px] text-text-faint tnum sm:table-cell">
                      {fmt.date(p.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  node,
  tone = "default",
}: {
  label: string;
  value?: string;
  node?: React.ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <div className="bg-surface px-5 py-5">
      <p className="section-label">{label}</p>
      <div className="mt-2">
        {node ?? (
          <span className={`num text-3xl ${tone === "accent" ? "!text-accent" : "text-text"}`}>{value}</span>
        )}
      </div>
    </div>
  );
}
