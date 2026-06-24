import { Link, useOutletContext } from "react-router-dom";
import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { PROJECT_PHASE_ORDER, type ProjectSection } from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useLabels, useT } from "../../lib/i18n";
import { Money, Pill } from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type Stats = inferRouterOutputs<AppRouter>["projects"]["overviewStats"];
type Phase = inferRouterOutputs<AppRouter>["projects"]["phaseAndCompleteness"];
type MoneyByCurrency = { currency: string; amount: string };

/** Project Overview — BEAM: a beam-rail hero answering "what needs you?", money
 *  at a glance, then completeness + recent proposals. */
export default function ProjectOverview() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const stats = trpc.projects.overviewStats.useQuery({ projectId: project.id });
  const phase = trpc.projects.phaseAndCompleteness.useQuery({ projectId: project.id });
  const t = useT();

  if (stats.isLoading) return <p className="text-sm text-text-muted">{t("common.loading")}</p>;
  if (stats.error) return <p className="text-sm text-danger">{stats.error.message}</p>;
  const s = stats.data;
  if (!s) return null;

  return (
    <div className="animate-rise space-y-14">
      {phase.data && <PhaseBar data={phase.data} />}
      <TodayPanel projectId={project.id} s={s} />
      {phase.data && <CompletenessSection phase={phase.data} />}
      <ProposalsSection projectId={project.id} s={s} />
      {project.notes && (
        <SubSection label={t("detail.notes")}>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text">{project.notes}</p>
        </SubSection>
      )}
    </div>
  );
}

// ───────────────────────────── TODAY ─────────────────────────────

function TodayPanel({ projectId, s }: { projectId: string; s: Stats }) {
  const t = useT();
  const baseUrl = `/projects/${projectId}`;
  const signals: Signal[] = [
    { key: "overdue_work", label: t("overview.signal.overdue_work"), value: s.workItems.overdueCount, to: `${baseUrl}/work-plan`, severity: 3 },
    { key: "overdue_bills", label: t("overview.signal.overdue_bills"), value: s.billsInvoices.overdueBillsCount, to: `${baseUrl}/money`, severity: 3 },
    { key: "overdue_invoices", label: t("overview.signal.overdue_invoices"), value: s.billsInvoices.overdueInvoicesCount, to: `${baseUrl}/money`, severity: 3 },
    { key: "blocked_work", label: t("overview.signal.blocked_work"), value: s.workItems.blockedCount, to: `${baseUrl}/work-plan`, severity: 2 },
    { key: "expired_bids", label: t("overview.signal.expired_bids"), value: s.bids.expiringCount, to: `${baseUrl}/bids`, severity: 2 },
    { key: "bids_to_compare", label: t("overview.signal.bids_to_compare"), value: s.bids.comparingCount, to: `${baseUrl}/bids`, severity: 2 },
    { key: "cos_awaiting_decision", label: t("overview.signal.cos_awaiting_decision"), value: s.changeOrders.awaitingDecisionCount, to: `${baseUrl}/change-orders`, severity: 2 },
    { key: "scheduled_this_week", label: t("overview.signal.scheduled_this_week"), value: s.workItems.scheduledSoonCount, to: `${baseUrl}/work-plan`, severity: 1 },
    { key: "in_flight", label: t("overview.signal.in_flight"), value: s.workItems.inFlightCount, to: `${baseUrl}/work-plan`, severity: 1 },
  ];

  const active = signals.filter((x) => x.value > 0);
  if (active.length === 0) return <EmptyToday projectId={projectId} />;
  active.sort((a, b) => b.severity - a.severity || b.value - a.value);
  const hero = active[0]!;
  const rest = active.slice(1);

  const tiles: Array<{ key: string; label: string; values: MoneyByCurrency[]; good?: boolean }> = [
    { key: "sold", label: t("overview.money.sold"), values: s.proposals.soldByCurrency },
    { key: "committed", label: t("overview.money.committed"), values: s.bids.committedByCurrency },
    { key: "billed", label: t("overview.money.billed"), values: s.money.billedByCurrency },
    { key: "paid", label: t("overview.money.paid"), values: s.money.paidByCurrency, good: true },
  ];

  return (
    <section>
      <div className="beam-rail">
        <p className="section-label">{t("overview.today")}</p>
        <Link to={hero.to} className="mt-2 block transition-opacity hover:opacity-90">
          <p className={`num text-[84px] leading-[0.85] ${severityHero(hero.severity)}`}>{hero.value}</p>
          <p className="mt-3 font-display text-2xl font-bold tracking-tight text-text">{hero.label}</p>
          <p className="mt-1 text-[14px] text-text-muted">{heroBlurb(hero, t)}</p>
        </Link>
      </div>

      {/* money at a glance */}
      <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            to={`${baseUrl}/money`}
            className={`rounded-2xl border border-border bg-surface px-5 py-5 shadow-sm transition-colors hover:border-border-strong ${
              tile.good ? "border-l-4 border-l-success" : "border-l-4 border-l-accent"
            }`}
          >
            <p className="section-label">{tile.label}</p>
            <div className="mt-2.5 space-y-0.5">
              {tile.values.length === 0 ? (
                <Money className="text-2xl" />
              ) : (
                tile.values.map((v) => (
                  <p key={v.currency}>
                    <Money amount={v.amount} currency={v.currency} className={`text-2xl ${tile.good ? "!text-success" : ""}`} />
                  </p>
                ))
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* also today */}
      {rest.length > 0 && (
        <div className="mt-10">
          <p className="section-label">{t("overview.also_today")}</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <ul className="divide-y divide-border-subtle">
              {rest.slice(0, 4).map((sig) => (
                <li key={sig.key}>
                  <Link
                    to={sig.to}
                    className="group flex items-center gap-5 px-5 py-3 transition-colors hover:bg-bg-subtle"
                  >
                    <span className={`num w-9 shrink-0 text-xl leading-none ${severityText(sig.severity)}`}>
                      {sig.value}
                    </span>
                    <span className="flex-1 text-[14px] font-medium text-text">{sig.label}</span>
                    <span className="text-text-faint transition-colors group-hover:text-accent">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyToday({ projectId }: { projectId: string }) {
  const t = useT();
  return (
    <section className="rounded-2xl border border-border bg-surface px-8 py-14 text-center shadow-sm">
      <p className="section-label">{t("overview.today")}</p>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight text-text">{t("overview.all_quiet")}</p>
      <p className="mt-2 text-[15px] text-text-muted">{t("overview.all_quiet_blurb")}</p>
      <Link
        to={`/projects/${projectId}/work-plan`}
        className="mt-5 inline-block text-[13px] font-semibold text-accent hover:text-accent-hover"
      >
        {t("overview.plan_some_work")}
      </Link>
    </section>
  );
}

type SignalKey =
  | "overdue_work" | "overdue_bills" | "overdue_invoices" | "blocked_work"
  | "expired_bids" | "bids_to_compare" | "cos_awaiting_decision" | "scheduled_this_week" | "in_flight";
type Signal = { key: SignalKey; label: string; value: number; to: string; severity: 1 | 2 | 3 };

function heroBlurb(sgl: Signal, t: ReturnType<typeof useT>): string {
  switch (sgl.key) {
    case "overdue_work": return t("overview.signal.overdue_work_blurb");
    case "overdue_bills": return t("overview.signal.overdue_bills_blurb");
    case "overdue_invoices": return t("overview.signal.overdue_invoices_blurb");
    case "blocked_work": return t("overview.signal.blocked_work_blurb");
    case "expired_bids": return t("overview.signal.expired_bids_blurb");
    case "bids_to_compare": return t("overview.signal.bids_to_compare_blurb");
    case "cos_awaiting_decision": return t("overview.signal.cos_awaiting_decision_blurb");
    case "scheduled_this_week": return t("overview.signal.scheduled_this_week_blurb");
    case "in_flight": return t("overview.signal.in_flight_blurb");
    default: return "";
  }
}
function severityText(sev: number): string {
  if (sev >= 3) return "!text-danger";
  if (sev >= 2) return "!text-warn";
  return "text-text";
}
function severityHero(sev: number): string {
  if (sev >= 3) return "!text-danger";
  if (sev >= 2) return "!text-warn";
  return "text-text";
}

// ───────────────────────────── PHASE ─────────────────────────────

function PhaseBar({ data }: { data: Phase }) {
  const L = useLabels();
  const t = useT();
  const { phase, phaseLabel, onHold, archived } = data;
  const currentIdx = PROJECT_PHASE_ORDER.indexOf(phase);

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <ol className="flex min-w-max items-center sm:min-w-0">
        {PROJECT_PHASE_ORDER.map((p, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const label = current && phaseLabel ? phaseLabel : L.projectPhase(p);
          const isLast = i === PROJECT_PHASE_ORDER.length - 1;
          return (
            <li key={p} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <PhaseDot done={done} current={current} />
                <span
                  className={`whitespace-nowrap text-[12px] ${
                    current ? "font-semibold text-text" : done ? "text-text-muted" : "text-text-faint"
                  }`}
                  title={label}
                >
                  {label}
                </span>
              </div>
              {!isLast && <div className={`mx-3 h-0.5 flex-1 rounded ${done ? "horizon-fill" : "bg-border"}`} aria-hidden />}
            </li>
          );
        })}
        {(onHold || archived) && (
          <li className="ml-3 flex items-center gap-1.5">
            {onHold && <Pill tone="warn">{t("status.project.on_hold")}</Pill>}
            {archived && <Pill tone="neutral">{t("status.project.archived")}</Pill>}
          </li>
        )}
      </ol>
    </div>
  );
}

function PhaseDot({ done, current }: { done: boolean; current: boolean }) {
  if (done) return <span aria-hidden className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />;
  if (current)
    return (
      <span aria-hidden className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ring-2 ring-accent ring-offset-2 ring-offset-bg">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    );
  return <span aria-hidden className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-border" />;
}

function CompletenessSection({ phase }: { phase: Phase }) {
  const t = useT();
  const sectionOrder: ProjectSection[] = ["property", "work_proposal", "execution"];
  return (
    <SubSection label={t("overview.completeness")} hint={t("overview.completeness_hint")}>
      <div className="grid gap-4 md:grid-cols-3">
        {sectionOrder.map((id) => (
          <CompletenessCard key={id} id={id} section={phase.sections[id]} />
        ))}
      </div>
    </SubSection>
  );
}

function CompletenessCard({ id, section }: { id: ProjectSection; section: Phase["sections"][ProjectSection] }) {
  const L = useLabels();
  const t = useT();
  const pct = Math.round(section.ratio * 100);
  const allDone = section.filled === section.total;
  const missing = section.checks.filter((c) => !c.passed);

  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-semibold text-text">{L.projectSection(id)}</p>
        <p className="num text-sm text-text-faint">{section.filled}/{section.total}</p>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
        <div className={`h-full rounded-full transition-all ${allDone ? "bg-success" : "horizon-fill"}`} style={{ width: `${pct}%` }} />
      </div>
      {missing.length === 0 ? (
        <p className="mt-4 text-[12px] font-medium text-success">{t("overview.all_set")}</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {missing.slice(0, 3).map((c) => (
            <li key={c.id} className="text-[13px] leading-snug">
              {c.deepLink ? (
                <Link to={c.deepLink} className="text-text-muted hover:text-text">· {c.label}</Link>
              ) : (
                <span className="text-text-muted">· {c.label}</span>
              )}
            </li>
          ))}
          {missing.length > 3 && <li className="text-[12px] text-text-faint">{t("overview.more", { count: missing.length - 3 })}</li>}
        </ul>
      )}
    </div>
  );
}

function ProposalsSection({ projectId, s }: { projectId: string; s: Stats }) {
  const L = useLabels();
  const t = useT();
  if (s.proposals.recent.length === 0) return null;
  return (
    <SubSection label={t("overview.recent_proposals")}>
      <div className="data-table">
        <table>
          <tbody>
            {s.proposals.recent.map((p) => (
              <tr
                key={p.id}
                className="clickable"
                onClick={() => (window.location.href = `/projects/${projectId}/proposals/${p.id}`)}
              >
                <td className="w-px whitespace-nowrap font-mono text-[12px] text-text-muted">{p.number}</td>
                <td className="w-px"><Pill tone="neutral">{L.proposalStatus(p.status)}</Pill></td>
                <td className="font-medium text-text">{p.title}</td>
                <td className="r"><Money amount={p.totalAmount} currency={p.totalCurrency} mono /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link to={`/projects/${projectId}/proposals`} className="mt-3 inline-block text-[13px] font-semibold text-accent hover:text-accent-hover">
        {t("overview.all_proposals")}
      </Link>
    </SubSection>
  );
}

function SubSection({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-bold tracking-tight text-text">{label}</h2>
        {hint && <p className="text-[13px] text-text-muted">{hint}</p>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
