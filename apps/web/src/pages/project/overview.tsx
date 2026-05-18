import { Link, useOutletContext } from "react-router-dom";
import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  PROJECT_SECTION_LABELS,
  PROPOSAL_STATUS_LABELS,
  type ProjectSection,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";
import { Pill } from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type Stats = inferRouterOutputs<AppRouter>["projects"]["overviewStats"];
type Phase = inferRouterOutputs<AppRouter>["projects"]["phaseAndCompleteness"];
type MoneyByCurrency = { currency: string; amount: string };

/**
 * Project Overview — opens with a single focal "Today" panel that answers
 * "what should I look at right now?", then progressively reveals secondary
 * surfaces (money totals, completeness, recent proposals).
 */
export default function ProjectOverview() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const stats = trpc.projects.overviewStats.useQuery({ projectId: project.id });
  const phase = trpc.projects.phaseAndCompleteness.useQuery({
    projectId: project.id,
  });
  const fmt = useFormatters();

  if (stats.isLoading) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }
  if (stats.error) {
    return <p className="text-sm text-rose-700">{stats.error.message}</p>;
  }
  const s = stats.data;
  if (!s) return null;

  return (
    <div className="space-y-16">
      <TodayPanel projectId={project.id} s={s} />

      <MoneySection projectId={project.id} s={s} />

      {phase.data && <CompletenessSection phase={phase.data} />}

      <ProposalsSection projectId={project.id} s={s} fmt={fmt} />

      {project.notes && (
        <SubSection label="Notes">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
            {project.notes}
          </p>
        </SubSection>
      )}
    </div>
  );
}

// ───────────────────────────────────── TODAY ──────────────────

/**
 * The single focal panel. Pulls the highest-priority signal (overdue first,
 * then warning, then calm). One BIG number, secondary signals beneath it.
 */
function TodayPanel({ projectId, s }: { projectId: string; s: Stats }) {
  const baseUrl = `/projects/${projectId}`;
  const signals: Signal[] = [
    {
      label: "Overdue work",
      value: s.workItems.overdueCount,
      to: `${baseUrl}/work-plan`,
      severity: 3,
    },
    {
      label: "Overdue bills",
      value: s.billsInvoices.overdueBillsCount,
      to: `${baseUrl}/money`,
      severity: 3,
    },
    {
      label: "Overdue invoices",
      value: s.billsInvoices.overdueInvoicesCount,
      to: `${baseUrl}/money`,
      severity: 3,
    },
    {
      label: "Blocked work",
      value: s.workItems.blockedCount,
      to: `${baseUrl}/work-plan`,
      severity: 2,
    },
    {
      label: "Expired bids",
      value: s.bids.expiringCount,
      to: `${baseUrl}/bids`,
      severity: 2,
    },
    {
      label: "Bids to compare",
      value: s.bids.comparingCount,
      to: `${baseUrl}/bids`,
      severity: 2,
    },
    {
      label: "COs awaiting decision",
      value: s.changeOrders.awaitingDecisionCount,
      to: `${baseUrl}/change-orders`,
      severity: 2,
    },
    {
      label: "Scheduled this week",
      value: s.workItems.scheduledSoonCount,
      to: `${baseUrl}/work-plan`,
      severity: 1,
    },
    {
      label: "In flight",
      value: s.workItems.inFlightCount,
      to: `${baseUrl}/work-plan`,
      severity: 1,
    },
  ];

  const active = signals.filter((x) => x.value > 0);
  if (active.length === 0) return <EmptyToday projectId={projectId} />;

  // Sort: highest severity first, then highest value
  active.sort((a, b) => b.severity - a.severity || b.value - a.value);
  const hero = active[0]!;
  const rest = active.slice(1);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-ink-200/70 bg-white shadow-soft">
      {/* Editorial accent rule */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-0.5 ${
          hero.severity >= 3
            ? "bg-rose-500"
            : hero.severity >= 2
              ? "bg-amber-500"
              : "bg-emerald-500"
        }`}
      />
      <div className="grid gap-10 px-8 py-9 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Today
          </p>
          <Link
            to={hero.to}
            className="mt-3 block transition-opacity hover:opacity-80"
          >
            <p className="num text-6xl leading-none text-ink-900">
              {hero.value}
            </p>
            <p className="mt-3 font-display text-2xl font-normal tracking-tight text-ink-900">
              {hero.label}
            </p>
            <p className="mt-1 text-[13px] text-ink-500">
              {heroBlurb(hero)}
            </p>
          </Link>
        </div>
        {rest.length > 0 && (
          <div className="border-t border-ink-100 pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              Also today
            </p>
            <ul className="mt-3 divide-y divide-ink-100">
              {rest.slice(0, 4).map((sig) => (
                <li key={sig.label}>
                  <Link
                    to={sig.to}
                    className="flex items-center justify-between gap-4 py-2.5 hover:opacity-80"
                  >
                    <span className="text-[14px] text-ink-700">
                      {sig.label}
                    </span>
                    <span
                      className={`num text-xl leading-none ${severityText(sig.severity)}`}
                    >
                      {sig.value}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyToday({ projectId }: { projectId: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-ink-200/70 bg-white px-8 py-12 text-center shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        Today
      </p>
      <p className="mt-3 font-display text-3xl font-normal tracking-tight text-ink-900">
        All quiet.
      </p>
      <p className="mt-2 text-[14px] text-ink-500">
        No overdue work, no late invoices, no decisions waiting.
      </p>
      <Link
        to={`/projects/${projectId}/work-plan`}
        className="mt-5 inline-block text-[13px] font-medium text-accent-600 hover:text-accent-700"
      >
        Plan some work →
      </Link>
    </section>
  );
}

type Signal = { label: string; value: number; to: string; severity: 1 | 2 | 3 };

function heroBlurb(s: Signal): string {
  switch (s.label) {
    case "Overdue work":
      return "Work items past their planned end date.";
    case "Overdue bills":
      return "Vendor invoices past due.";
    case "Overdue invoices":
      return "Client invoices past due.";
    case "Blocked work":
      return "Items waiting on a predecessor.";
    case "Expired bids":
      return "Past validity — needs a fresh quote.";
    case "Bids to compare":
      return "Awaiting your decision.";
    case "COs awaiting decision":
      return "Change orders sent — no answer yet.";
    case "Scheduled this week":
      return "Starts within the next 7 days.";
    case "In flight":
      return "Scheduled + in progress.";
    default:
      return "";
  }
}

function severityText(sev: number): string {
  if (sev >= 3) return "text-rose-600";
  if (sev >= 2) return "text-amber-700";
  return "text-ink-900";
}

// ───────────────────────────────────── MONEY ──────────────────

function MoneySection({ projectId, s }: { projectId: string; s: Stats }) {
  const fmt = useFormatters();
  const tiles: Array<{ label: string; values: MoneyByCurrency[] }> = [
    { label: "Sold", values: s.proposals.soldByCurrency },
    { label: "Committed", values: s.bids.committedByCurrency },
    { label: "Billed", values: s.money.billedByCurrency },
    { label: "Paid", values: s.money.paidByCurrency },
  ];

  return (
    <SubSection
      label="Money"
      hint="Top-line totals. Click any tile for the full ledger."
    >
      <div className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={`/projects/${projectId}/money`}
            className="bg-white px-5 py-5 transition-colors hover:bg-paper-50"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              {t.label}
            </p>
            <div className="mt-3 space-y-1">
              {t.values.length === 0 ? (
                <p className="num text-3xl text-ink-300">—</p>
              ) : (
                t.values.map((v) => (
                  <p key={v.currency} className="num text-2xl text-ink-900">
                    {fmt.currency(v.amount, v.currency)}
                  </p>
                ))
              )}
            </div>
          </Link>
        ))}
      </div>
    </SubSection>
  );
}

// ───────────────────────────────────── PROPOSALS ──────────────

function ProposalsSection({
  projectId,
  s,
  fmt,
}: {
  projectId: string;
  s: Stats;
  fmt: ReturnType<typeof useFormatters>;
}) {
  if (s.proposals.recent.length === 0) return null;
  return (
    <SubSection label="Recent proposals">
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200/70 bg-white">
        {s.proposals.recent.map((p) => (
          <li key={p.id}>
            <Link
              to={`/projects/${projectId}/proposals/${p.id}`}
              className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-paper-50"
            >
              <span className="font-mono text-[12px] text-ink-500">{p.number}</span>
              <Pill tone="muted">{PROPOSAL_STATUS_LABELS[p.status]}</Pill>
              <span className="truncate text-[14px] text-ink-900">{p.title}</span>
              <span className="ml-auto num text-[16px] text-ink-900">
                {p.totalAmount && p.totalCurrency
                  ? fmt.currency(p.totalAmount, p.totalCurrency)
                  : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to={`/projects/${projectId}/proposals`}
        className="mt-3 inline-block text-[13px] text-ink-500 hover:text-ink-900"
      >
        All proposals →
      </Link>
    </SubSection>
  );
}

// ───────────────────────────────────── COMPLETENESS ──────────

function CompletenessSection({ phase }: { phase: Phase }) {
  const sectionOrder: ProjectSection[] = [
    "property",
    "work_proposal",
    "execution",
  ];
  return (
    <SubSection
      label="Completeness"
      hint="What's missing per workflow section."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {sectionOrder.map((id) => (
          <CompletenessCard key={id} id={id} section={phase.sections[id]} />
        ))}
      </div>
    </SubSection>
  );
}

function CompletenessCard({
  id,
  section,
}: {
  id: ProjectSection;
  section: Phase["sections"][ProjectSection];
}) {
  const pct = Math.round(section.ratio * 100);
  const allDone = section.filled === section.total;
  const missing = section.checks.filter((c) => !c.passed);

  return (
    <div className="rounded-xl border border-ink-200/70 bg-white px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-800">
          {PROJECT_SECTION_LABELS[id]}
        </p>
        <p className="num text-sm text-ink-400">
          {section.filled}/{section.total}
        </p>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-paper-100">
        <div
          className={`h-full rounded-full transition-all ${
            allDone
              ? "bg-emerald-500"
              : pct >= 50
                ? "bg-accent-500"
                : "bg-ink-300"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {missing.length === 0 ? (
        <p className="mt-4 text-[12px] text-emerald-700">All set.</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {missing.slice(0, 3).map((c) => (
            <li key={c.id} className="text-[13px] leading-snug">
              {c.deepLink ? (
                <Link
                  to={c.deepLink}
                  className="text-ink-600 hover:text-ink-900"
                >
                  · {c.label}
                </Link>
              ) : (
                <span className="text-ink-600">· {c.label}</span>
              )}
            </li>
          ))}
          {missing.length > 3 && (
            <li className="text-[12px] text-ink-400">
              +{missing.length - 3} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────────────── primitive ──────────────

function SubSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-normal tracking-tight text-ink-900">
          {label}
        </h2>
        {hint && <p className="text-[13px] text-ink-500">{hint}</p>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
