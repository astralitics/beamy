import { Link, Outlet, useParams } from "react-router-dom";
import {
  PROJECT_PHASE_LABELS,
  PROJECT_PHASE_ORDER,
  type ProjectStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

const STATUS_PILL_CLS: Record<ProjectStatus, string> = {
  lead: "bg-sky-50 text-sky-800 ring-sky-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  on_hold: "bg-amber-50 text-amber-800 ring-amber-200",
  completed: "bg-violet-50 text-violet-800 ring-violet-200",
  archived: "bg-slate-50 text-slate-700 ring-slate-200",
};

/**
 * Project number — a derived architectural label. Construction projects
 * traditionally carry a unique number; Beamy mints one as `BMY-<year>-<4>`
 * where `<4>` is the first 4 hex of the project UUID. Stable and unique
 * enough to read aloud over the phone.
 */
function projectNumber(id: string, createdAt: string | Date): string {
  const d = new Date(createdAt);
  const year = d.getFullYear();
  const tag = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `BMY-${year}-${tag}`;
}

/**
 * ProjectShell — wraps every page under `/projects/:id/*`. Header is laid
 * out as a drafting title-block: project number stamp top-left, name as
 * the big banner, then a fact grid with hairline rules separating cells
 * (PROJECT NUMBER · CLIENT · ADDRESS · CONTRACT · STARTED · STATUS).
 *
 * The body renders the active sub-tab via <Outlet />. The tab nav itself
 * lives in the global Sidebar (mode-aware — sidebar.tsx).
 */
export default function ProjectShell() {
  const { id } = useParams<{ id: string }>();
  const fmt = useFormatters();
  const project = trpc.projects.get.useQuery(
    { id: id ?? "" },
    { enabled: !!id },
  );

  if (!id) return null;
  if (project.isLoading) {
    return <p className="p-10 text-sm text-slate-500">Loading…</p>;
  }
  if (project.error) {
    return (
      <div className="p-10">
        <p className="text-sm text-rose-700">{project.error.message}</p>
        <Link
          to="/projects"
          className="mt-4 inline-block text-sm text-safety-700 hover:text-safety-800"
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
    <div className="mx-auto max-w-5xl p-10">
      <TitleBlock>
        <div className="flex items-center justify-between gap-4 border-b border-paper-200 px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
            <span className="text-slate-700">{number}</span>
            <span className="mx-2 text-slate-300">|</span>
            issued {fmt.date(p.createdAt)}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[p.status]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {p.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="px-5 py-5">
          <h1 className="text-3xl font-semibold tracking-tight text-blueprint-900">
            {p.name}
          </h1>
        </div>

        <FactRow>
          <Fact label="Client" value={p.client?.name ?? "—"} />
          <Fact label="Address" value={p.address ?? "—"} wide />
        </FactRow>
        <FactRow>
          <Fact
            label="Contract"
            value={
              p.contractAmount && p.contractCurrency
                ? fmt.currency(p.contractAmount, p.contractCurrency)
                : "—"
            }
          />
          <Fact
            label="Started"
            value={p.startedAt ? fmt.date(p.startedAt) : "—"}
          />
          <Fact
            label="Substantial completion"
            value={
              p.substantialCompletionAt
                ? fmt.date(p.substantialCompletionAt)
                : "—"
            }
          />
        </FactRow>
      </TitleBlock>

      <div className="mt-6">
        <PhaseBar projectId={p.id} />
      </div>

      <div className="mt-8">
        <Outlet context={{ project: p }} />
      </div>
    </div>
  );
}

// ────────────────────── phase bar ──────────────────────

/**
 * Horizontal stepper showing where the project is in the workflow.
 * Phase is derived server-side from data state; this component is a
 * read-only renderer.
 *
 * Visual model: dots connected by a hairline, completed phases
 * filled, current phase ringed in the safety color, future phases
 * left muted. `on_hold` and `archived` show as orthogonal pills to
 * the right.
 */
function PhaseBar({ projectId }: { projectId: string }) {
  const q = trpc.projects.phaseAndCompleteness.useQuery({ projectId });
  if (q.isLoading) return null;
  if (q.error || !q.data) return null;
  const { phase, phaseLabel, onHold, archived } = q.data;
  const currentIdx = PROJECT_PHASE_ORDER.indexOf(phase);

  return (
    <div className="rounded-lg border border-paper-200 bg-white px-5 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-400">
          Phase
        </p>
        <div className="flex items-center gap-1.5">
          {onHold && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-amber-800 ring-1 ring-inset ring-amber-200">
              on hold
            </span>
          )}
          {archived && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-600 ring-1 ring-inset ring-slate-200">
              archived
            </span>
          )}
        </div>
      </div>
      <ol className="mt-2 flex items-center gap-0">
        {PROJECT_PHASE_ORDER.map((p, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const label =
            current && phaseLabel ? phaseLabel : PROJECT_PHASE_LABELS[p];
          return (
            <li key={p} className="flex flex-1 items-center">
              <PhaseDot done={done} current={current} />
              <div className="flex-1 px-1.5">
                <p
                  className={`truncate font-mono text-[10px] uppercase tracking-[0.1em] ${
                    current
                      ? "font-semibold text-blueprint-900"
                      : done
                        ? "text-slate-600"
                        : "text-slate-400"
                  }`}
                  title={label}
                >
                  {label}
                </p>
              </div>
              {i < PROJECT_PHASE_ORDER.length - 1 && (
                <div
                  className={`h-px flex-1 ${
                    done ? "bg-safety-300" : "bg-paper-200"
                  }`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PhaseDot({
  done,
  current,
}: {
  done: boolean;
  current: boolean;
}) {
  if (done) {
    return (
      <span
        aria-hidden
        className="inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-safety-700 text-white"
      />
    );
  }
  if (current) {
    return (
      <span
        aria-hidden
        className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-safety-50 ring-2 ring-safety-700"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-safety-700" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-paper-200"
    />
  );
}

// ────────────────────── title-block primitives ──────────────────────

function TitleBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-paper-200 bg-white shadow-sm">
      {children}
    </div>
  );
}

function FactRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-paper-200 border-t border-paper-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {children}
    </div>
  );
}

function Fact({
  label,
  value,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`px-5 py-3 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-blueprint-900">
        {value}
      </p>
    </div>
  );
}
