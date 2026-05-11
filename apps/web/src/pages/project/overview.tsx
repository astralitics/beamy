import { useOutletContext } from "react-router-dom";
import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { PROJECT_TYPE_LABELS } from "@beamy/shared";
import { trpc } from "../../lib/trpc";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];

export default function ProjectOverview() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const rooms = trpc.projects.listRooms.useQuery({ projectId: project.id });

  const stats: Array<{ label: string; value: ReactNode; hint: string }> = [
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
    <div className="space-y-10">
      <Section label="At a glance">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-paper-200 bg-white p-4 transition-colors hover:border-paper-200 hover:bg-paper-50"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                {s.label}
              </p>
              <p className="mt-1 text-3xl font-semibold text-blueprint-900">
                {s.value}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">{s.hint}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Type">
        <p className="text-sm text-slate-700">
          {PROJECT_TYPE_LABELS[project.projectType]}
        </p>
      </Section>

      {project.notes && (
        <Section label="Notes">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {project.notes}
          </p>
        </Section>
      )}

      {project.tags.length > 0 && (
        <Section label="Tags">
          <div className="flex flex-wrap gap-2">
            {project.tags.map((t) => (
              <span
                key={t}
                className="inline-flex rounded-full bg-paper-100 px-2.5 py-0.5 text-xs text-slate-700 ring-1 ring-inset ring-paper-200"
              >
                {t}
              </span>
            ))}
          </div>
        </Section>
      )}

      <div className="relative overflow-hidden rounded-lg border border-paper-200 bg-blueprint-grid bg-grid-32 p-8">
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-safety-700">
            Coming next in M2
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-blueprint-900">
            The recall layer
          </h3>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">
            Assets with manufacturer/serial/warranty, materials with lot
            numbers and coverage, photos tagged to room and install. When
            it's done,{" "}
            <em className="text-blueprint-900 not-italic">
              "what fridge in the {project.name}?"
            </em>{" "}
            returns the answer in five seconds — including the receipt, the
            warranty terms, and the photo of the install.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Section with a left-edge stripe — visually quiet division marker, like
 * the section symbol on a drawing index.
 */
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
