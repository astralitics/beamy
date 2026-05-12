import { useState } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  CHANGE_ORDER_LINE_KIND_LABELS,
  CHANGE_ORDER_STATUS_LABELS,
  type ChangeOrderLineKind,
  type ChangeOrderStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];

const STATUS_PILL_CLS: Record<ChangeOrderStatus, string> = {
  drafted: "bg-slate-50 text-slate-700 ring-slate-200",
  sent: "bg-sky-50 text-sky-800 ring-sky-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  void: "bg-paper-100 text-slate-500 ring-paper-200",
};

const KIND_PILL_CLS: Record<ChangeOrderLineKind, string> = {
  add: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  modify: "bg-amber-50 text-amber-800 ring-amber-200",
  remove: "bg-rose-50 text-rose-700 ring-rose-200",
};

/**
 * Change order detail — title-block stamp, lines table grouped by
 * kind, status transition buttons (with the approve flow that
 * applies deltas to work_items server-side), delete (drafted COs
 * only — approved COs must be voided).
 */
export default function ProjectChangeOrderDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { changeOrderId } = useParams<{ changeOrderId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const utils = trpc.useUtils();

  const [decidedBy, setDecidedBy] = useState("");

  const coQ = trpc.changeOrders.get.useQuery(
    { id: changeOrderId ?? "" },
    { enabled: !!changeOrderId },
  );

  const transition = trpc.changeOrders.transition.useMutation({
    onSuccess: () => {
      utils.changeOrders.get.invalidate({ id: changeOrderId });
      utils.changeOrders.list.invalidate({ projectId: project.id });
      utils.workItems.list.invalidate({ projectId: project.id });
      utils.projects.overviewStats.invalidate({ projectId: project.id });
      setDecidedBy("");
    },
  });
  const remove = trpc.changeOrders.remove.useMutation({
    onSuccess: () => {
      utils.changeOrders.list.invalidate({ projectId: project.id });
      utils.projects.overviewStats.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/change-orders`);
    },
  });

  if (!changeOrderId) return null;
  if (coQ.isLoading) {
    return <p className="text-xs text-slate-500">Loading…</p>;
  }
  if (coQ.error) return <p className="text-xs text-rose-700">{coQ.error.message}</p>;
  const co = coQ.data;
  if (!co) return null;

  const delta = parseFloat(co.totalDeltaAmount);
  const negative = delta < 0;
  const canDelete = co.status !== "approved";
  const canSend = co.status === "drafted";
  const canDecide = co.status === "sent";
  const canVoid = co.status !== "void";

  return (
    <div>
      <Link
        to={`/projects/${project.id}/change-orders`}
        className="font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-blueprint-900"
      >
        ← Back to change orders
      </Link>

      <div className="mt-3 overflow-hidden rounded-lg border border-paper-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-paper-200 px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
            <span className="text-slate-700">{co.number}</span>
            <span className="mx-2 text-slate-300">|</span>
            drafted {fmt.date(co.createdAt)}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[co.status]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {CHANGE_ORDER_STATUS_LABELS[co.status]}
          </span>
        </div>

        <div className="px-5 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-blueprint-900">
            {co.title}
          </h1>
          {co.description && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
              {co.description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 divide-y divide-paper-200 border-t border-paper-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Fact label="Net delta">
            <span
              className={`${negative ? "text-rose-700" : "text-emerald-700"}`}
            >
              {negative ? "" : "+"}
              {fmt.currency(co.totalDeltaAmount, co.totalDeltaCurrency)}
            </span>
          </Fact>
          <Fact label="Sent">{co.sentAt ? fmt.date(co.sentAt) : "—"}</Fact>
          <Fact label="Decided">
            {co.decidedAt ? (
              <>
                {fmt.date(co.decidedAt)}
                {co.decidedBy && (
                  <span className="ml-1 text-slate-500">by {co.decidedBy}</span>
                )}
              </>
            ) : (
              "—"
            )}
          </Fact>
        </div>
      </div>

      {/* Status transitions ─────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canSend && (
          <button
            type="button"
            onClick={() => transition.mutate({ id: co.id, to: "sent" })}
            disabled={transition.isPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Mark sent →
          </button>
        )}
        {canDecide && (
          <div className="flex items-center gap-2">
            <input
              value={decidedBy}
              onChange={(e) => setDecidedBy(e.target.value)}
              placeholder="Decided by (client name)"
              className="rounded-md border border-paper-200 bg-white px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() =>
                transition.mutate({
                  id: co.id,
                  to: "approved",
                  decidedBy: decidedBy.trim() || undefined,
                })
              }
              disabled={transition.isPending}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Approve & apply
            </button>
            <button
              type="button"
              onClick={() =>
                transition.mutate({
                  id: co.id,
                  to: "rejected",
                  decidedBy: decidedBy.trim() || undefined,
                })
              }
              disabled={transition.isPending}
              className="rounded-md border border-paper-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-paper-50 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
        {canVoid && co.status !== "drafted" && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `Mark ${co.number} as void? This is documentation only and does NOT unwind any work item changes.`,
                )
              ) {
                transition.mutate({ id: co.id, to: "void" });
              }
            }}
            disabled={transition.isPending}
            className="rounded-md border border-paper-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-paper-50 disabled:opacity-50"
          >
            Void
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Permanently delete ${co.number}?`)) {
                remove.mutate({ id: co.id });
              }
            }}
            disabled={remove.isPending}
            className="ml-auto text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
          >
            {remove.isPending ? "…" : "Delete"}
          </button>
        )}
      </div>

      {co.status === "drafted" && (
        <p className="mt-2 text-[10px] text-slate-500">
          Approval applies line deltas to work items in one transaction.
          Approved COs can't be deleted — use Void if you need to retract.
        </p>
      )}

      {/* Lines table ─────────────────── */}
      <div className="mt-5 overflow-hidden rounded-md border border-paper-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper-50 text-left">
            <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit</th>
              <th className="px-3 py-2 text-right">Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {co.lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-xs text-slate-500">
                  No lines.
                </td>
              </tr>
            ) : (
              co.lines.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${KIND_PILL_CLS[line.kind]}`}
                    >
                      {CHANGE_ORDER_LINE_KIND_LABELS[line.kind]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {line.description ? (
                      <span className="text-blueprint-900">
                        {line.description}
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        {line.kind === "remove"
                          ? "(removes work item)"
                          : "(unchanged)"}
                      </span>
                    )}
                    {line.notes && (
                      <div className="mt-1 text-xs text-slate-500">
                        {line.notes}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px]">
                    {line.qty
                      ? `${trimQty(line.qty)}${line.unit ? ` ${line.unit}` : ""}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px]">
                    {line.unitPriceAmount && line.unitPriceCurrency
                      ? fmt.currency(
                          line.unitPriceAmount,
                          line.unitPriceCurrency,
                        )
                      : "—"}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] font-medium ${parseFloat(line.totalDeltaAmount) < 0 ? "text-rose-700" : "text-emerald-700"}`}
                  >
                    {parseFloat(line.totalDeltaAmount) < 0 ? "" : "+"}
                    {fmt.currency(
                      line.totalDeltaAmount,
                      co.totalDeltaCurrency,
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {co.notes && (
        <div className="mt-5 rounded-md border border-paper-200 bg-paper-50 p-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Internal notes
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {co.notes}
          </p>
        </div>
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
    <div className="px-5 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-blueprint-900">
        {children}
      </p>
    </div>
  );
}

function trimQty(qty: string): string {
  const n = parseFloat(qty);
  if (!isFinite(n)) return qty;
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(parseFloat(n.toFixed(4)));
}
