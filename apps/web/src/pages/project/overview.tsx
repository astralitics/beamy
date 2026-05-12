import { Link, useOutletContext } from "react-router-dom";
import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { PROPOSAL_STATUS_LABELS } from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type Stats = inferRouterOutputs<AppRouter>["projects"]["overviewStats"];
type MoneyByCurrency = { currency: string; amount: string };

/**
 * Project Overview — daily-driver landing surface. Cards pull from
 * a single `overviewStats` round-trip and surface what needs
 * attention right now. Each card deep-links to the relevant tab
 * pre-filtered so the user doesn't have to hunt for the rows.
 */
export default function ProjectOverview() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const stats = trpc.projects.overviewStats.useQuery({ projectId: project.id });
  const fmt = useFormatters();

  if (stats.isLoading) {
    return <p className="text-xs text-slate-500">Loading…</p>;
  }
  if (stats.error) {
    return <p className="text-xs text-rose-700">{stats.error.message}</p>;
  }
  const s = stats.data;
  if (!s) return null;

  const everythingQuiet =
    s.workItems.overdueCount === 0 &&
    s.workItems.scheduledSoonCount === 0 &&
    s.bids.expiringCount === 0 &&
    s.bids.comparingCount === 0 &&
    s.billsInvoices.overdueBillsCount === 0 &&
    s.billsInvoices.overdueInvoicesCount === 0 &&
    s.workItems.totalCount === 0;

  return (
    <div className="space-y-8">
      {everythingQuiet ? (
        <EmptyState projectId={project.id} />
      ) : (
        <PulseGrid projectId={project.id} s={s} />
      )}

      <MoneySection projectId={project.id} s={s} />
      <ProposalsSection projectId={project.id} s={s} fmt={fmt} />

      {project.notes && (
        <Section label="Notes">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {project.notes}
          </p>
        </Section>
      )}
    </div>
  );
}

// ───────────────────────────────────── pulses ─────────────────

function PulseGrid({ projectId, s }: { projectId: string; s: Stats }) {
  const baseUrl = `/projects/${projectId}`;
  const pulses: Pulse[] = [
    {
      label: "Overdue work",
      value: s.workItems.overdueCount,
      tone: s.workItems.overdueCount > 0 ? "alert" : "quiet",
      to: `${baseUrl}/work-plan`,
      hint: "past planned end",
    },
    {
      label: "Scheduled this week",
      value: s.workItems.scheduledSoonCount,
      tone: "calm",
      to: `${baseUrl}/work-plan`,
      hint: "starts within 7 days",
    },
    {
      label: "In flight",
      value: s.workItems.inFlightCount,
      tone: "calm",
      to: `${baseUrl}/work-plan`,
      hint: "scheduled + in progress",
    },
    {
      label: "Expired bids",
      value: s.bids.expiringCount,
      tone: s.bids.expiringCount > 0 ? "warn" : "quiet",
      to: `${baseUrl}/work-plan`,
      hint: "past validity, need re-quote",
    },
    {
      label: "Bids comparing",
      value: s.bids.comparingCount,
      tone: s.bids.comparingCount > 0 ? "warn" : "quiet",
      to: `${baseUrl}/work-plan`,
      hint: "awaiting decision",
    },
    {
      label: "Overdue bills",
      value: s.billsInvoices.overdueBillsCount,
      tone: s.billsInvoices.overdueBillsCount > 0 ? "alert" : "quiet",
      to: `${baseUrl}/money`,
      hint: "vendor bills past due",
    },
    {
      label: "Overdue invoices",
      value: s.billsInvoices.overdueInvoicesCount,
      tone: s.billsInvoices.overdueInvoicesCount > 0 ? "alert" : "quiet",
      to: `${baseUrl}/money`,
      hint: "client invoices past due",
    },
    {
      label: "COs awaiting decision",
      value: s.changeOrders.awaitingDecisionCount,
      tone: s.changeOrders.awaitingDecisionCount > 0 ? "warn" : "quiet",
      to: `${baseUrl}/change-orders`,
      hint: "sent, no answer yet",
    },
  ];

  return (
    <Section label="Pulse">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pulses.map((p) => (
          <PulseCard key={p.label} pulse={p} />
        ))}
      </div>
    </Section>
  );
}

type PulseTone = "alert" | "warn" | "calm" | "quiet";
type Pulse = {
  label: string;
  value: number;
  tone: PulseTone;
  to: string;
  hint: string;
};

const TONE_CLS: Record<PulseTone, string> = {
  alert: "border-rose-200 bg-rose-50 hover:border-rose-300",
  warn: "border-amber-200 bg-amber-50 hover:border-amber-300",
  calm: "border-paper-200 bg-white hover:border-paper-300",
  quiet: "border-paper-200 bg-paper-50 text-slate-400 hover:border-paper-300",
};
const VALUE_TONE_CLS: Record<PulseTone, string> = {
  alert: "text-rose-700",
  warn: "text-amber-800",
  calm: "text-blueprint-900",
  quiet: "text-slate-400",
};

function PulseCard({ pulse }: { pulse: Pulse }) {
  return (
    <Link
      to={pulse.to}
      className={`block rounded-lg border p-4 transition-colors ${TONE_CLS[pulse.tone]}`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
        {pulse.label}
      </p>
      <p className={`mt-1 text-3xl font-semibold ${VALUE_TONE_CLS[pulse.tone]}`}>
        {pulse.value}
      </p>
      <p className="mt-1 text-[10px] text-slate-400">{pulse.hint}</p>
    </Link>
  );
}

function EmptyState({ projectId }: { projectId: string }) {
  return (
    <Section label="Pulse">
      <div className="rounded-lg border border-paper-200 bg-paper-50 p-6 text-center">
        <p className="text-sm text-slate-600">
          Nothing on fire. The pulse cards activate once there are work items,
          bids, and bills to track.
        </p>
        <Link
          to={`/projects/${projectId}/work-plan`}
          className="mt-3 inline-block text-xs font-medium text-safety-700 hover:text-safety-800"
        >
          Add the first work item →
        </Link>
      </div>
    </Section>
  );
}

// ───────────────────────────────────── money ──────────────────

function MoneySection({ projectId, s }: { projectId: string; s: Stats }) {
  const fmt = useFormatters();
  const tiles: Array<{ label: string; values: MoneyByCurrency[]; hint: string }> = [
    {
      label: "Committed",
      values: s.bids.committedByCurrency,
      hint: "accepted bids → vendors",
    },
    {
      label: "Sold",
      values: s.proposals.soldByCurrency,
      hint: "accepted proposals → client",
    },
    {
      label: "Billed",
      values: s.money.billedByCurrency,
      hint: "invoices sent to client",
    },
    {
      label: "Paid",
      values: s.money.paidByCurrency,
      hint: "client payments received",
    },
    {
      label: "Scope changes",
      values: s.changeOrders.approvedDeltaByCurrency,
      hint: "approved CO net delta",
    },
  ];

  return (
    <Section label="Money">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={`/projects/${projectId}/money`}
            className="block rounded-lg border border-paper-200 bg-white p-4 transition-colors hover:border-paper-300"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {t.label}
            </p>
            <div className="mt-1 space-y-0.5">
              {t.values.length === 0 ? (
                <p className="text-xl font-semibold text-slate-400">—</p>
              ) : (
                t.values.map((v) => (
                  <p
                    key={v.currency}
                    className="font-mono text-lg font-semibold text-blueprint-900"
                  >
                    {fmt.currency(v.amount, v.currency)}
                  </p>
                ))
              )}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">{t.hint}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}

// ───────────────────────────────────── proposals ──────────────

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
    <Section label="Recent proposals">
      <div className="grid gap-2">
        {s.proposals.recent.map((p) => (
          <Link
            key={p.id}
            to={`/projects/${projectId}/proposals/${p.id}`}
            className="flex items-baseline gap-3 rounded-md border border-paper-200 bg-white px-3 py-2 hover:border-paper-300"
          >
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
              {p.number}
            </span>
            <span className="rounded-sm bg-paper-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              {PROPOSAL_STATUS_LABELS[p.status]}
            </span>
            <span className="text-sm text-blueprint-900">{p.title}</span>
            <span className="ml-auto font-mono text-sm font-semibold text-blueprint-900">
              {p.totalAmount && p.totalCurrency
                ? fmt.currency(p.totalAmount, p.totalCurrency)
                : "—"}
            </span>
          </Link>
        ))}
        <Link
          to={`/projects/${projectId}/proposals`}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          All proposals →
        </Link>
      </div>
    </Section>
  );
}

// ───────────────────────────────────── primitives ─────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="relative pl-5">
      <span
        aria-hidden
        className="absolute left-0 top-1 h-5 w-1 rounded-r bg-paper-200"
      />
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
        {label}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
