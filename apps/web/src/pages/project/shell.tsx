import { useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import {
  PROJECT_PHASE_LABELS,
  PROJECT_PHASE_ORDER,
  type ProjectStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useT } from "../../lib/i18n";
import { Icon, Pill } from "../../components/ui";

const STATUS_TONE: Record<
  ProjectStatus,
  "success" | "info" | "warn" | "neutral" | "accent"
> = {
  lead: "info",
  active: "success",
  on_hold: "warn",
  completed: "accent",
  archived: "neutral",
};

function projectNumber(id: string, createdAt: string | Date): string {
  const d = new Date(createdAt);
  const year = d.getFullYear();
  const tag = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `BMY-${year}-${tag}`;
}

export default function ProjectShell() {
  const { id } = useParams<{ id: string }>();
  const fmt = useFormatters();
  const t = useT();
  const project = trpc.projects.get.useQuery(
    { id: id ?? "" },
    { enabled: !!id },
  );

  if (!id) return null;
  if (project.isLoading) {
    return <p className="p-12 text-sm text-ink-500">Loading…</p>;
  }
  if (project.error) {
    return (
      <div className="p-12">
        <p className="text-sm text-rose-700">{project.error.message}</p>
        <Link
          to="/projects"
          className="mt-4 inline-block text-sm text-ink-700 hover:text-ink-900"
        >
          ← Back to projects
        </Link>
      </div>
    );
  }
  if (!project.data) return null;

  const p = project.data;
  const number = projectNumber(p.id, p.createdAt);

  return (
    <div className="mx-auto max-w-5xl px-10 py-14 animate-rise">
      <Header
        name={p.name}
        status={p.status}
        number={number}
        createdAt={p.createdAt}
        clientName={p.client?.name ?? null}
        address={p.address ?? null}
        contractAmount={p.contractAmount}
        contractCurrency={p.contractCurrency}
        startedAt={p.startedAt}
        substantialCompletionAt={p.substantialCompletionAt}
        fmt={fmt}
        t={t}
      />

      <PhaseBar projectId={p.id} />

      <div className="mt-14">
        <Outlet context={{ project: p }} />
      </div>
    </div>
  );
}

function Header({
  name,
  status,
  number,
  createdAt,
  clientName,
  address,
  contractAmount,
  contractCurrency,
  startedAt,
  substantialCompletionAt,
  fmt,
  t,
}: {
  name: string;
  status: ProjectStatus;
  number: string;
  createdAt: string | Date;
  clientName: string | null;
  address: string | null;
  contractAmount: string | null;
  contractCurrency: string | null;
  startedAt: string | Date | null;
  substantialCompletionAt: string | Date | null;
  fmt: ReturnType<typeof useFormatters>;
  t: ReturnType<typeof useT>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <header>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Pill tone={STATUS_TONE[status]} dot>
              {t(`status.project.${status}` as const)}
            </Pill>
            {clientName && (
              <span className="text-[13px] text-ink-500">{clientName}</span>
            )}
          </div>
          <h1 className="mt-3 font-display text-5xl font-normal leading-[1.05] tracking-tightest text-ink-900">
            {name}
          </h1>
          {address && (
            <p className="mt-3 text-[15px] text-ink-500">{address}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          aria-label={t("project.details")}
          title={t("project.details")}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-500 transition-colors hover:border-ink-300 hover:text-ink-900 ${
            detailsOpen ? "bg-ink-50 text-ink-900" : "bg-white"
          }`}
        >
          <Icon name="info" className="h-4 w-4" />
        </button>
      </div>

      {detailsOpen && (
        <dl className="mt-6 grid animate-rise grid-cols-2 gap-x-8 gap-y-4 rounded-xl border border-ink-200/70 bg-white px-6 py-5 shadow-soft sm:grid-cols-5">
          <Fact label={t("project.fact.project_number")} value={number} mono />
          <Fact
            label={t("project.fact.contract")}
            value={
              contractAmount && contractCurrency
                ? fmt.currency(contractAmount, contractCurrency)
                : "—"
            }
          />
          <Fact
            label={t("project.fact.started")}
            value={startedAt ? fmt.date(startedAt) : "—"}
          />
          <Fact
            label={t("project.fact.completion")}
            value={
              substantialCompletionAt
                ? fmt.date(substantialCompletionAt)
                : "—"
            }
          />
          <Fact label={t("project.fact.issued")} value={fmt.date(createdAt)} />
        </dl>
      )}
    </header>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate text-[14px] text-ink-900 ${mono ? "font-mono" : "font-medium"}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

// ────────────────────── phase bar ──────────────────────

function PhaseBar({ projectId }: { projectId: string }) {
  const q = trpc.projects.phaseAndCompleteness.useQuery({ projectId });
  if (q.isLoading) return null;
  if (q.error || !q.data) return null;
  const { phase, phaseLabel, onHold, archived } = q.data;
  const currentIdx = PROJECT_PHASE_ORDER.indexOf(phase);

  return (
    <div className="mt-10">
      <ol className="flex items-center">
        {PROJECT_PHASE_ORDER.map((p, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const label =
            current && phaseLabel ? phaseLabel : PROJECT_PHASE_LABELS[p];
          const isLast = i === PROJECT_PHASE_ORDER.length - 1;
          return (
            <li key={p} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <PhaseDot done={done} current={current} />
                <span
                  className={`whitespace-nowrap text-[12px] ${
                    current
                      ? "font-medium text-ink-900"
                      : done
                        ? "text-ink-600"
                        : "text-ink-400"
                  }`}
                  title={label}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mx-3 h-px flex-1 ${
                    done ? "bg-accent-300" : "bg-ink-200"
                  }`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
        {(onHold || archived) && (
          <li className="ml-3 flex items-center gap-1.5">
            {onHold && <Pill tone="warn">on hold</Pill>}
            {archived && <Pill tone="neutral">archived</Pill>}
          </li>
        )}
      </ol>
    </div>
  );
}

function PhaseDot({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span
        aria-hidden
        className="inline-flex h-2 w-2 shrink-0 rounded-full bg-accent-500"
      />
    );
  }
  if (current) {
    return (
      <span
        aria-hidden
        className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full ring-2 ring-accent-500 ring-offset-2 ring-offset-paper-50"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-2 w-2 shrink-0 rounded-full bg-ink-200"
    />
  );
}
