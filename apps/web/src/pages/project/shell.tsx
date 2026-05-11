import { Link, Outlet, useParams } from "react-router-dom";
import type { ProjectStatus } from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

const STATUS_PILL_CLS: Record<ProjectStatus, string> = {
  lead: "bg-sky-100 text-sky-800 ring-sky-200",
  active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  on_hold: "bg-amber-100 text-amber-800 ring-amber-200",
  completed: "bg-violet-100 text-violet-800 ring-violet-200",
  archived: "bg-slate-100 text-slate-700 ring-slate-200",
};

/**
 * ProjectShell — wraps every page under `/projects/:id/*`. Renders the
 * project header (name + status + at-a-glance facts) and an <Outlet />
 * for the active sub-tab. The sub-tab nav itself lives in the global
 * Sidebar (mode-aware — sidebar.tsx).
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
  return (
    <div className="mx-auto max-w-5xl p-10">
      <div className="border-b border-paper-200 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-blueprint-900">
                {p.name}
              </h1>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_PILL_CLS[p.status]}`}
              >
                {p.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {p.client && (
                <span>
                  Client:{" "}
                  <span className="font-medium text-slate-900">
                    {p.client.name}
                  </span>
                </span>
              )}
              {p.address && <span>{p.address}</span>}
              {p.contractAmount && p.contractCurrency && (
                <span>
                  Contract:{" "}
                  <span className="font-medium text-slate-900">
                    {fmt.currency(p.contractAmount, p.contractCurrency)}
                  </span>
                </span>
              )}
              {p.startedAt && (
                <span>
                  Started:{" "}
                  <span className="font-medium text-slate-900">
                    {fmt.date(p.startedAt)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Outlet context={{ project: p }} />
      </div>
    </div>
  );
}
