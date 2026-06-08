import { useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  WORK_ITEM_DEPENDENCY_KIND_SHORT,
  type WorkItemStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT } from "../../lib/i18n";
import { Button, ConfirmDialog, Icon, Pill } from "../../components/ui";
import { WorkItemForm, nextStatus } from "./work-plan";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];

const STATUS_TONE: Record<
  WorkItemStatus,
  "info" | "warn" | "success" | "alert" | "muted"
> = {
  specified: "muted",
  approved: "info",
  scheduled: "info",
  in_progress: "warn",
  done: "success",
  accepted: "success",
  cancelled: "alert",
};

export default function ProjectWorkItemDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { workItemId } = useParams<{ workItemId: string }>();
  const navigate = useNavigate();
  const t = useT();
  const fmt = useFormatters();
  const L = useLabels();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const item = trpc.workItems.get.useQuery(
    { id: workItemId ?? "" },
    { enabled: !!workItemId },
  );
  const allItemsQ = trpc.workItems.list.useQuery({ projectId: project.id });
  const depsQ = trpc.workItems.listDependencies.useQuery({
    projectId: project.id,
  });
  const rooms = trpc.projects.listRooms.useQuery({ projectId: project.id });
  const vendors = trpc.vendors.list.useQuery({});
  const bids = trpc.bids.list.useQuery({ projectId: project.id });

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.workItems.get.invalidate({ id: workItemId ?? "" });
    utils.workItems.list.invalidate({ projectId: project.id });
  };
  const transition = trpc.workItems.transition.useMutation({
    onSuccess: invalidate,
  });
  const remove = trpc.workItems.remove.useMutation({
    onSuccess: () => {
      utils.workItems.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/plan`);
    },
  });

  const allItems = allItemsQ.data ?? [];
  const allItemsById = useMemo(() => {
    const m = new Map<string, (typeof allItems)[number]>();
    for (const w of allItems) m.set(w.id, w);
    return m;
  }, [allItems]);
  const existingDeps = useMemo(
    () => (depsQ.data ?? []).filter((d) => d.workItemId === workItemId),
    [depsQ.data, workItemId],
  );
  const blockerCount = useMemo(
    () =>
      existingDeps.filter((d) => {
        const pred = allItemsById.get(d.dependsOnId);
        return pred && pred.status !== "done" && pred.status !== "accepted";
      }).length,
    [existingDeps, allItemsById],
  );

  if (!workItemId) return null;
  if (item.isLoading)
    return <p className="text-sm text-ink-500">{t("common.loading")}</p>;
  if (item.error)
    return <p className="text-sm text-rose-700">{item.error.message}</p>;
  if (!item.data) return null;

  const w = item.data;
  const advanceTo = nextStatus(w.status);

  return (
    <div className="animate-fade space-y-10">
      <header>
        <Link
          to={`/projects/${project.id}/plan`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          {t("work_item.back_to_plan")}
        </Link>

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={STATUS_TONE[w.status]} dot>
                {L.workItemStatus(w.status)}
              </Pill>
              {blockerCount > 0 && (
                <Pill tone="warn">
                  {t("work_item.blocked", { count: blockerCount })}
                </Pill>
              )}
              {w.bid && (
                <Link
                  to={`/projects/${project.id}/bids/${w.bid.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-100"
                >
                  {w.bid.bidNumber
                    ? `↗ ${t("work_item.source_quote_numbered", { number: w.bid.bidNumber })}`
                    : `↗ ${t("work_item.source_quote")}`}
                </Link>
              )}
            </div>
            <h1 className="mt-3 font-display text-2xl font-normal tracking-tight text-ink-900">
              {w.description}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-500">
              {w.ref && <span className="font-mono">{w.ref}</span>}
              {w.trade && <span>{w.trade}</span>}
              {w.vendor && <span>{w.vendor.name}</span>}
            </p>
          </div>
          {!editing && (
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {advanceTo && (
                <Button
                  variant="primary"
                  onClick={() =>
                    transition.mutate({ id: w.id, to: advanceTo })
                  }
                  disabled={transition.isPending}
                >
                  → {L.workItemStatus(advanceTo)}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t("common.edit")}
              </Button>
            </div>
          )}
        </div>
      </header>

      {editing ? (
        <WorkItemForm
          projectId={project.id}
          mode="edit"
          existing={w}
          existingDeps={existingDeps}
          rooms={rooms.data ?? []}
          vendors={vendors.data ?? []}
          bids={bids.data ?? []}
          allItems={allItems}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={t("work_item.fact.type_of_work")}>{w.trade ?? "—"}</Fact>
            <Fact label={t("work_item.fact.quantity")}>
              {w.qty ? `${trimZero(w.qty)}${w.unit ? ` ${w.unit}` : ""}` : "—"}
            </Fact>
            <Fact label={t("work_item.field.planned_start")}>
              {w.plannedStart ? fmt.date(w.plannedStart) : "—"}
            </Fact>
            <Fact label={t("work_item.field.planned_end")}>
              {w.plannedEnd ? fmt.date(w.plannedEnd) : "—"}
            </Fact>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              {t("plan.col.rooms")}
            </h3>
            {w.rooms.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {w.rooms.map((r) => (
                  <Pill key={r.id} tone="info">
                    {r.name}
                    {r.roomType ? ` · ${L.roomType(r.roomType)}` : ""}
                  </Pill>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-500">
                {t("work_item.no_rooms_assigned")}
              </p>
            )}
          </section>

          {existingDeps.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                {t("work_item.depends_on")}
              </h3>
              <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200/70 bg-white text-sm">
                {existingDeps.map((d) => {
                  const pred = allItemsById.get(d.dependsOnId);
                  return (
                    <li
                      key={d.id}
                      className="flex items-center gap-2 px-4 py-2.5"
                    >
                      <span
                        className="rounded-sm bg-paper-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink-500 ring-1 ring-inset ring-paper-200"
                        title={L.workItemDepKind(d.kind)}
                      >
                        {WORK_ITEM_DEPENDENCY_KIND_SHORT[d.kind]}
                      </span>
                      {pred ? (
                        <Link
                          to={`/projects/${project.id}/plan/${pred.id}`}
                          className="text-ink-800 hover:underline"
                        >
                          {pred.ref ? `${pred.ref} · ` : ""}
                          {pred.description}
                        </Link>
                      ) : (
                        <span className="text-ink-500">
                          {t("work_item.unknown_item")}
                        </span>
                      )}
                      {pred && (
                        <span className="ml-auto">
                          <Pill tone={STATUS_TONE[pred.status]}>
                            {L.workItemStatus(pred.status)}
                          </Pill>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[12px] text-ink-400">
                {t("work_item.deps_edit_hint")}
              </p>
            </section>
          )}

          {w.notes && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                {t("detail.notes")}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
                {w.notes}
              </p>
            </section>
          )}

          <section className="border-t border-ink-100 pt-8">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-[13px] text-rose-600 hover:text-rose-800"
            >
              {t("work_item.delete")}
            </button>
          </section>

          {confirmingDelete && (
            <ConfirmDialog
              title={t("work_item.delete_title")}
              message={t("work_item.delete_confirm", {
                name: w.description.slice(0, 50),
              })}
              confirmLabel={t("common.delete")}
              cancelLabel={t("common.cancel")}
              tone="danger"
              loading={remove.isPending}
              error={remove.error?.message}
              onConfirm={() => remove.mutate({ id: w.id })}
              onClose={() => setConfirmingDelete(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {label}
      </p>
      <p className="mt-1 truncate text-[15px] font-medium text-ink-900">
        {children}
      </p>
    </div>
  );
}

// "2.0000" → "2", "1.5000" → "1.5".
function trimZero(n: string): string {
  if (!n.includes(".")) return n;
  return n.replace(/\.?0+$/, "");
}
