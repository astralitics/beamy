import { useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import { useVertical } from "../lib/vertical";
import { WORKFLOWS_BY_VERTICAL } from "../data/workflows";
import { PageHeader } from "../components/ui";
import { WorkflowCanvas } from "../components/workflow-canvas";

const LEGEND: { type: string; label: string; chip: string }[] = [
  { type: "trigger", label: "Trigger", chip: "bg-sky-50 text-sky-700" },
  { type: "task", label: "Task", chip: "bg-slate-100 text-slate-700" },
  { type: "approval", label: "Approval", chip: "bg-amber-50 text-amber-700" },
  { type: "automation", label: "Automation", chip: "bg-emerald-50 text-emerald-700" },
  { type: "ai", label: "AI", chip: "bg-violet-50 text-violet-700" },
  { type: "notification", label: "Notify", chip: "bg-blue-50 text-blue-700" },
];

export default function WorkflowsPage() {
  const t = useT();
  const vertical = useVertical();
  const workflows = WORKFLOWS_BY_VERTICAL[vertical];
  const [selectedId, setSelectedId] = useState(workflows[0]?.id ?? "");

  // Selection follows the vertical: if the active workflow isn't in the
  // current vertical's set (after a workspace switch), fall back to the first.
  const selected = useMemo(
    () => workflows.find((w) => w.id === selectedId) ?? workflows[0],
    [workflows, selectedId],
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-10">
      <PageHeader title={t("nav.workflows")} lede={t("workflows.subtitle")} />

      {/* workflow selector */}
      <div className="mt-6 flex flex-wrap gap-2">
        {workflows.map((w) => {
          const active = w.id === selected?.id;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => setSelectedId(w.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900"
              }`}
            >
              {w.name}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4">
          <p className="max-w-3xl text-sm text-ink-500">{selected.description}</p>

          {/* legend */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {t("workflows.legend")}
            </span>
            {LEGEND.map((l) => (
              <span
                key={l.type}
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${l.chip}`}
              >
                {l.label}
              </span>
            ))}
          </div>

          {/* horizontal DAG canvas */}
          <div className="mt-4 h-[560px] w-full overflow-hidden rounded-xl border border-ink-200 bg-paper-50">
            <WorkflowCanvas key={selected.id} workflow={selected} />
          </div>

          <p className="mt-3 text-xs text-ink-400">{t("workflows.sample_note")}</p>
        </div>
      )}
    </div>
  );
}
