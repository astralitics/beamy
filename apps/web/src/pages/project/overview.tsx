import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { PROJECT_TYPE_LABELS } from "@beamy/shared";
import { trpc } from "../../lib/trpc";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];

export default function ProjectOverview() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const rooms = trpc.projects.listRooms.useQuery({ projectId: project.id });

  const stats = [
    {
      label: "Rooms",
      value: rooms.data?.length ?? "—",
      hint: "spaces tracked",
    },
    { label: "Assets", value: "—", hint: "M2 next" },
    { label: "Materials", value: "—", hint: "M2 next" },
    { label: "Documents", value: "—", hint: "M8" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
          At a glance
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-paper-200 bg-white p-4"
            >
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-blueprint-900">
                {s.value}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">{s.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
          Type
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          {PROJECT_TYPE_LABELS[project.projectType]}
        </p>
      </section>

      {project.notes && (
        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            Notes
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
            {project.notes}
          </p>
        </section>
      )}

      {project.tags.length > 0 && (
        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            Tags
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {project.tags.map((t) => (
              <span
                key={t}
                className="inline-flex rounded-full bg-paper-100 px-2.5 py-0.5 text-xs text-slate-700 ring-1 ring-inset ring-paper-200"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-dashed border-paper-200 bg-paper-50 p-6 text-sm text-slate-600">
        <p className="font-semibold text-blueprint-900">Coming next in M2</p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          <li>Assets — manufacturer / model / serial / warranty / install</li>
          <li>
            Materials — paint / tile / flooring with lot numbers + coverage
          </li>
          <li>Photos — tagged to room / asset / material</li>
          <li>
            Recall search — <em>"what fridge in the Anderson kitchen?"</em>
          </li>
        </ul>
      </section>
    </div>
  );
}
