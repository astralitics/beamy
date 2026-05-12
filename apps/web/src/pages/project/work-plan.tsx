import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  ROOM_TYPE_LABELS,
  WORK_ITEM_STATUS_FLOW,
  WORK_ITEM_STATUS_LABELS,
  type RoomType,
  type WorkItemStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type WorkItemRow = inferRouterOutputs<AppRouter>["workItems"]["list"][number];
type RoomRow = inferRouterOutputs<AppRouter>["projects"]["listRooms"][number];
type VendorRow = inferRouterOutputs<AppRouter>["vendors"]["list"][number];

/**
 * Plan — the project's spine. Each row is a work_item: the unit of
 * work that gets quoted, approved, scheduled, executed, and billed
 * against. Filters by status, trade, room, vendor, and overdue.
 *
 * Rooms are demoted to a collapsible sub-section at the bottom — they
 * remain the spatial anchor for work_items (M2M) and for assets /
 * materials / documents, but they're no longer the centerpiece.
 */
export default function ProjectPlan() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  return (
    <div>
      <WorkItemsSection projectId={project.id} />
      <div className="mt-10 border-t border-paper-200 pt-8">
        <RoomsSection projectId={project.id} />
      </div>
    </div>
  );
}

// ───────────────────────────────────── work items ─────────────

const STATUS_PILL_CLS: Record<WorkItemStatus, string> = {
  specified: "bg-slate-50 text-slate-700 ring-slate-200",
  approved: "bg-sky-50 text-sky-800 ring-sky-200",
  scheduled: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  in_progress: "bg-amber-50 text-amber-800 ring-amber-200",
  done: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  accepted: "bg-violet-50 text-violet-800 ring-violet-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
};

type PlanView = "table" | "rooms";

function WorkItemsSection({ projectId }: { projectId: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkItemRow | null>(null);
  const [view, setView] = useState<PlanView>("table");
  const [statusFilter, setStatusFilter] = useState<WorkItemStatus | "open" | "all">(
    "open",
  );
  const [tradeFilter, setTradeFilter] = useState<string>("");
  const [roomFilter, setRoomFilter] = useState<string>("");
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");

  const statusInput =
    statusFilter === "all" || statusFilter === "open" ? undefined : statusFilter;
  const list = trpc.workItems.list.useQuery({
    projectId,
    status: statusInput,
    trade: tradeFilter || undefined,
    roomId: roomFilter || undefined,
    vendorId: vendorFilter || undefined,
    overdue: overdueOnly || undefined,
    search: search.trim() || undefined,
  });
  const trades = trpc.workItems.listTrades.useQuery({ projectId });
  const rooms = trpc.projects.listRooms.useQuery({ projectId });
  const vendors = trpc.vendors.list.useQuery({});

  // "open" = not done/accepted/cancelled. Client-side because the API
  // takes a single status filter.
  const filtered = useMemo(() => {
    if (statusFilter !== "open") return list.data ?? [];
    return (list.data ?? []).filter(
      (w) =>
        w.status !== "done" &&
        w.status !== "accepted" &&
        w.status !== "cancelled",
    );
  }, [list.data, statusFilter]);

  const totalsByCurrency = useMemo(() => {
    const acc = new Map<string, number>();
    for (const w of filtered) {
      if (w.totalAmount && w.totalCurrency) {
        acc.set(
          w.totalCurrency,
          (acc.get(w.totalCurrency) ?? 0) + parseFloat(w.totalAmount),
        );
      }
    }
    return acc;
  }, [filtered]);

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-blueprint-900">
            Work items
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            The spine of the project. Each row is a unit of work — quoted,
            approved, scheduled, executed, billed. Filter to find what needs
            attention now.
          </p>
        </div>
        {!adding && !editing && (
          <div className="flex items-center gap-2">
            <ViewToggle view={view} onChange={setView} />
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Add work item
            </button>
          </div>
        )}
      </div>

      {!adding && !editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as WorkItemStatus | "open" | "all",
              )
            }
            className={selectCls}
          >
            <option value="open">Open (not done)</option>
            <option value="all">All statuses</option>
            {WORK_ITEM_STATUS_FLOW.map((s) => (
              <option key={s} value={s}>
                {WORK_ITEM_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">All trades</option>
            {(trades.data ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">All rooms</option>
            {rooms.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">All vendors</option>
            {vendors.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 rounded-md border border-paper-200 bg-white px-3 py-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Overdue only
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, ref, notes…"
            className="flex-1 rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
      )}

      {adding && (
        <WorkItemForm
          projectId={projectId}
          mode="create"
          onClose={() => setAdding(false)}
          rooms={rooms.data ?? []}
          vendors={vendors.data ?? []}
        />
      )}
      {editing && (
        <WorkItemForm
          projectId={projectId}
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
          rooms={rooms.data ?? []}
          vendors={vendors.data ?? []}
        />
      )}

      <div className="mt-4">
        {list.isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : list.error ? (
          <p className="text-xs text-rose-700">{list.error.message}</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            {search.trim() ||
            tradeFilter ||
            roomFilter ||
            vendorFilter ||
            overdueOnly ||
            statusFilter !== "open" ? (
              "No work items match these filters."
            ) : (
              <>
                No open work items. Click <strong>Add work item</strong> to
                start sketching the plan — or upload a vendor bid once that
                lands.
              </>
            )}
          </p>
        ) : view === "rooms" ? (
          <ScopeByRoom
            items={filtered}
            rooms={rooms.data ?? []}
            onEdit={setEditing}
          />
        ) : (
          <WorkItemsTable items={filtered} onEdit={setEditing} />
        )}

        {filtered.length > 0 && totalsByCurrency.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
            <span>filtered total ·</span>
            {Array.from(totalsByCurrency.entries()).map(([cur, amt]) => (
              <SubtotalChip key={cur} amount={amt.toFixed(2)} currency={cur} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubtotalChip({
  amount,
  currency,
}: {
  amount: string;
  currency: string;
}) {
  const fmt = useFormatters();
  return (
    <span className="text-slate-700">{fmt.currency(amount, currency)}</span>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: PlanView;
  onChange: (v: PlanView) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-paper-200 bg-white p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("table")}
        className={`rounded px-2.5 py-1 transition-colors ${
          view === "table"
            ? "bg-paper-100 font-medium text-blueprint-900"
            : "text-slate-500 hover:text-slate-900"
        }`}
      >
        Table
      </button>
      <button
        type="button"
        onClick={() => onChange("rooms")}
        className={`rounded px-2.5 py-1 transition-colors ${
          view === "rooms"
            ? "bg-paper-100 font-medium text-blueprint-900"
            : "text-slate-500 hover:text-slate-900"
        }`}
      >
        By room
      </button>
    </div>
  );
}

/**
 * Scope-by-room — the spatial pivot. Same work_items, grouped by
 * room. A line item that touches 3 rooms shows up under each
 * (signaled with a small "+2 more rooms" badge so the user knows
 * it's the same work item). Items with no room go in the
 * "Unassigned" bucket at the end.
 *
 * Natural for site-walk reviews: open the tab, scroll to the
 * kitchen header, see everything happening there.
 */
function ScopeByRoom({
  items,
  rooms,
  onEdit,
}: {
  items: WorkItemRow[];
  rooms: RoomRow[];
  onEdit: (w: WorkItemRow) => void;
}) {
  const groups = useMemo(() => {
    type Group = { room: RoomRow | null; items: WorkItemRow[] };
    const byRoomId = new Map<string, Group>();
    const unassigned: WorkItemRow[] = [];

    for (const w of items) {
      if (w.rooms.length === 0) {
        unassigned.push(w);
        continue;
      }
      for (const r of w.rooms) {
        let g = byRoomId.get(r.id);
        if (!g) {
          // r is a lite (id+name) shape from workItems.list; resolve
          // back to the full RoomRow if we have it for the type chip.
          const full = rooms.find((rr) => rr.id === r.id) ?? null;
          g = { room: full ?? (r as RoomRow), items: [] };
          byRoomId.set(r.id, g);
        }
        g.items.push(w);
      }
    }

    // Sort rooms by name; unassigned last.
    const ordered: Group[] = Array.from(byRoomId.values()).sort((a, b) =>
      (a.room?.name ?? "").localeCompare(b.room?.name ?? ""),
    );
    if (unassigned.length > 0) {
      ordered.push({ room: null, items: unassigned });
    }
    return ordered;
  }, [items, rooms]);

  if (groups.length === 0) {
    return (
      <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
        No work items to group.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div
          key={g.room?.id ?? "_unassigned"}
          className="overflow-hidden rounded-md border border-paper-200 bg-white"
        >
          <div className="flex items-baseline justify-between border-b border-paper-200 bg-paper-50 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold text-blueprint-900">
                {g.room?.name ?? "Unassigned"}
              </h3>
              {g.room?.roomType && (
                <span className="rounded-full bg-paper-100 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
                  {ROOM_TYPE_LABELS[g.room.roomType]}
                </span>
              )}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {g.items.length} item{g.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="px-3 py-1.5">Ref</th>
                <th className="px-3 py-1.5">Description</th>
                <th className="px-3 py-1.5 text-right">Qty</th>
                <th className="px-3 py-1.5 text-right">Total</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {g.items.map((w) => (
                <ScopeByRoomRow
                  key={`${g.room?.id ?? "u"}:${w.id}`}
                  item={w}
                  currentRoomId={g.room?.id ?? null}
                  onEdit={() => onEdit(w)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ScopeByRoomRow({
  item,
  currentRoomId,
  onEdit,
}: {
  item: WorkItemRow;
  currentRoomId: string | null;
  onEdit: () => void;
}) {
  const fmt = useFormatters();
  const otherRooms =
    currentRoomId == null
      ? []
      : item.rooms.filter((r) => r.id !== currentRoomId);

  return (
    <tr className="align-top">
      <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
        {item.ref ?? "—"}
      </td>
      <td className="px-3 py-2">
        <div className="font-medium text-blueprint-900">{item.description}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {item.trade && (
            <span className="rounded-full bg-paper-100 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              {item.trade}
            </span>
          )}
          {otherRooms.length > 0 && (
            <span
              className="rounded-full bg-blueprint-50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-blueprint-700 ring-1 ring-inset ring-blueprint-100"
              title={otherRooms.map((r) => r.name).join(", ")}
            >
              also in {otherRooms.length} more
            </span>
          )}
          {item.vendor && (
            <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400">
              · {item.vendor.name}
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] text-slate-700">
        {item.qty
          ? `${trimQty(item.qty)}${item.unit ? ` ${item.unit}` : ""}`
          : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] font-medium text-blueprint-900">
        {item.totalAmount && item.totalCurrency
          ? fmt.currency(item.totalAmount, item.totalCurrency)
          : "—"}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[item.status]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {WORK_ITEM_STATUS_LABELS[item.status].toLowerCase()}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          Edit
        </button>
      </td>
    </tr>
  );
}

function WorkItemsTable({
  items,
  onEdit,
}: {
  items: WorkItemRow[];
  onEdit: (w: WorkItemRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-paper-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-paper-50 text-left">
          <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <th className="px-3 py-2">Ref</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Unit price</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Planned end</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-200">
          {items.map((w) => (
            <WorkItemRowItem key={w.id} item={w} onEdit={() => onEdit(w)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkItemRowItem({
  item,
  onEdit,
}: {
  item: WorkItemRow;
  onEdit: () => void;
}) {
  const fmt = useFormatters();
  const utils = trpc.useUtils();
  const remove = trpc.workItems.remove.useMutation({
    onSuccess: () =>
      utils.workItems.list.invalidate({ projectId: item.projectId }),
  });
  const transition = trpc.workItems.transition.useMutation({
    onSuccess: () =>
      utils.workItems.list.invalidate({ projectId: item.projectId }),
  });

  const advanceTo = nextStatus(item.status);
  const isOverdue =
    item.plannedEnd != null &&
    item.status !== "done" &&
    item.status !== "accepted" &&
    item.status !== "cancelled" &&
    item.plannedEnd < new Date().toISOString().slice(0, 10);

  return (
    <tr className="align-top">
      <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
        {item.ref ?? "—"}
      </td>
      <td className="px-3 py-2">
        <div className="font-medium text-blueprint-900">{item.description}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {item.trade && (
            <span className="rounded-full bg-paper-100 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              {item.trade}
            </span>
          )}
          {item.rooms.map((r) => (
            <span
              key={r.id}
              className="rounded-full bg-blueprint-50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-blueprint-700 ring-1 ring-inset ring-blueprint-100"
            >
              {r.name}
            </span>
          ))}
          {item.vendor && (
            <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400">
              · {item.vendor.name}
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] text-slate-700">
        {item.qty ? `${trimQty(item.qty)}${item.unit ? ` ${item.unit}` : ""}` : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] text-slate-700">
        {item.unitPriceAmount && item.unitPriceCurrency
          ? fmt.currency(item.unitPriceAmount, item.unitPriceCurrency)
          : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] font-medium text-blueprint-900">
        {item.totalAmount && item.totalCurrency
          ? fmt.currency(item.totalAmount, item.totalCurrency)
          : "—"}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[item.status]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {WORK_ITEM_STATUS_LABELS[item.status].toLowerCase()}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">
        {item.plannedEnd ? (
          <span className={isOverdue ? "text-rose-700" : "text-slate-600"}>
            {fmt.date(item.plannedEnd)}
            {isOverdue && (
              <span className="ml-1 rounded-sm bg-rose-50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-200">
                overdue
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="flex justify-end gap-2">
          {advanceTo && (
            <button
              type="button"
              onClick={() => transition.mutate({ id: item.id, to: advanceTo })}
              disabled={transition.isPending}
              className="rounded-md border border-paper-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-paper-50 disabled:opacity-50"
              title={`Mark as ${WORK_ITEM_STATUS_LABELS[advanceTo]}`}
            >
              → {WORK_ITEM_STATUS_LABELS[advanceTo]}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                confirm(`Permanently remove "${item.description.slice(0, 40)}"?`)
              ) {
                remove.mutate({ id: item.id });
              }
            }}
            disabled={remove.isPending}
            className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
          >
            {remove.isPending ? "…" : "Delete"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function nextStatus(status: WorkItemStatus): WorkItemStatus | null {
  const idx = WORK_ITEM_STATUS_FLOW.indexOf(status);
  if (idx < 0 || idx === WORK_ITEM_STATUS_FLOW.length - 1) return null;
  return WORK_ITEM_STATUS_FLOW[idx + 1] ?? null;
}

function trimQty(qty: string): string {
  // 4.0000 → 4 ; 4.5000 → 4.5 ; preserve 4.1250
  const n = parseFloat(qty);
  if (!isFinite(n)) return qty;
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(parseFloat(n.toFixed(4)));
}

// ───────────────────────────────────── work item form ────────

function WorkItemForm({
  projectId,
  mode,
  existing,
  rooms,
  vendors,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: WorkItemRow;
  rooms: RoomRow[];
  vendors: VendorRow[];
  onClose: () => void;
}) {
  const [description, setDescription] = useState(existing?.description ?? "");
  const [trade, setTrade] = useState(existing?.trade ?? "");
  const [ref, setRef] = useState(existing?.ref ?? "");
  const [vendorId, setVendorId] = useState(existing?.vendorId ?? "");
  const [roomIds, setRoomIds] = useState<string[]>(
    existing?.rooms.map((r) => r.id) ?? [],
  );
  const [qty, setQty] = useState(existing?.qty ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [unitPriceAmount, setUnitPriceAmount] = useState(
    existing?.unitPriceAmount ?? "",
  );
  const [unitPriceCurrency, setUnitPriceCurrency] = useState(
    existing?.unitPriceCurrency ?? "MXN",
  );
  const [totalAmount, setTotalAmount] = useState(existing?.totalAmount ?? "");
  const [totalCurrency, setTotalCurrency] = useState(
    existing?.totalCurrency ?? existing?.unitPriceCurrency ?? "MXN",
  );
  const [status, setStatus] = useState<WorkItemStatus>(
    existing?.status ?? "specified",
  );
  const [plannedStart, setPlannedStart] = useState(existing?.plannedStart ?? "");
  const [plannedEnd, setPlannedEnd] = useState(existing?.plannedEnd ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.workItems.create.useMutation({
    onSuccess: () => {
      utils.workItems.list.invalidate({ projectId });
      utils.workItems.listTrades.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.workItems.update.useMutation({
    onSuccess: () => {
      utils.workItems.list.invalidate({ projectId });
      utils.workItems.listTrades.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  // Auto-compute total from qty × unit_price when both present and
  // total hasn't been manually overridden. Only fires on blur to
  // avoid fighting the user mid-typing.
  function autoTotal() {
    const q = parseFloat(qty);
    const u = parseFloat(unitPriceAmount);
    if (!isFinite(q) || !isFinite(u)) return;
    if (totalAmount.trim()) return; // user has set their own
    setTotalAmount((q * u).toFixed(2));
    if (!totalCurrency) setTotalCurrency(unitPriceCurrency);
  }

  function toggleRoom(id: string) {
    setRoomIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const up = unitPriceAmount.trim();
    const upc = unitPriceCurrency.trim();
    const tot = totalAmount.trim();
    const totc = totalCurrency.trim();
    if ((up && !upc) || (!up && upc)) {
      setError("Unit price + currency must be set together.");
      return;
    }
    if ((tot && !totc) || (!tot && totc)) {
      setError("Total + currency must be set together.");
      return;
    }

    const base = {
      description: description.trim(),
      trade: trade.trim() || undefined,
      ref: ref.trim() || undefined,
      vendorId: vendorId || undefined,
      roomIds,
      qty: qty.trim() || undefined,
      unit: unit.trim() || undefined,
      unitPriceAmount: up || undefined,
      unitPriceCurrency: up ? upc : undefined,
      totalAmount: tot || undefined,
      totalCurrency: tot ? totc : undefined,
      status,
      plannedStart: plannedStart || undefined,
      plannedEnd: plannedEnd || undefined,
      notes: notes.trim() || undefined,
    };
    if (mode === "edit" && existing) {
      update.mutate({ id: existing.id, patch: base });
    } else {
      create.mutate({ projectId, ...base });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-md border border-paper-200 bg-white p-4"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {mode === "edit" ? "Edit · work item" : "New · work item"}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Description *" wide>
          <textarea
            required
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="e.g. Cambio de empaques de policarbonato en cancelería de baño"
          />
        </Field>
        <Field label="Trade">
          <input
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className={inputCls}
            placeholder="carpintería / electricidad / tile"
          />
        </Field>
        <Field label="Ref">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className={inputCls}
            placeholder="V14, S1-01…"
          />
        </Field>
        <Field label="Vendor">
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className={selectCls}
          >
            <option value="">— (none)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as WorkItemStatus)}
            className={selectCls}
          >
            {(Object.keys(WORK_ITEM_STATUS_LABELS) as WorkItemStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {WORK_ITEM_STATUS_LABELS[s]}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Rooms" wide>
          {rooms.length === 0 ? (
            <p className="text-xs text-slate-500">
              No rooms yet — add one in the Rooms section below.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => {
                const on = roomIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRoom(r.id)}
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ring-1 ring-inset transition-colors ${
                      on
                        ? "bg-blueprint-100 text-blueprint-900 ring-blueprint-300"
                        : "bg-paper-50 text-slate-500 ring-paper-200 hover:bg-paper-100"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
        <Field label="Qty + unit">
          <div className="flex gap-2">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={autoTotal}
              className={`${inputCls} flex-1`}
              placeholder="1, 24, 12.5"
              inputMode="decimal"
            />
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={`${inputCls} w-20`}
              placeholder="ea, m², ml"
            />
          </div>
        </Field>
        <Field label="Unit price">
          <div className="flex gap-2">
            <input
              value={unitPriceAmount}
              onChange={(e) => setUnitPriceAmount(e.target.value)}
              onBlur={autoTotal}
              className={`${inputCls} flex-1`}
              placeholder="1250.00"
              inputMode="decimal"
            />
            <input
              value={unitPriceCurrency}
              onChange={(e) =>
                setUnitPriceCurrency(e.target.value.toUpperCase())
              }
              className={`${inputCls} w-16 uppercase`}
              maxLength={3}
            />
          </div>
        </Field>
        <Field label="Total">
          <div className="flex gap-2">
            <input
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className={`${inputCls} flex-1`}
              placeholder="auto from qty × unit price"
              inputMode="decimal"
            />
            <input
              value={totalCurrency}
              onChange={(e) => setTotalCurrency(e.target.value.toUpperCase())}
              className={`${inputCls} w-16 uppercase`}
              maxLength={3}
            />
          </div>
        </Field>
        <Field label="Planned start">
          <input
            type="date"
            value={plannedStart}
            onChange={(e) => setPlannedStart(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Planned end">
          <input
            type="date"
            value={plannedEnd}
            onChange={(e) => setPlannedEnd(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Notes" wide>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-paper-200 px-3 py-1 text-xs hover:bg-paper-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : mode === "edit" ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

// ───────────────────────────────────── rooms (sub-section) ────

function RoomsSection({ projectId }: { projectId: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RoomRow | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const list = trpc.projects.listRooms.useQuery({ projectId });

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-1.5 text-left"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
              {collapsed ? "▸" : "▾"}
            </span>
            <h2 className="text-base font-semibold tracking-tight text-blueprint-900">
              Rooms
            </h2>
            <span className="ml-1 rounded-full bg-paper-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-inset ring-paper-200">
              {list.data?.length ?? 0}
            </span>
          </button>
          {!collapsed && (
            <p className="mt-0.5 text-xs text-slate-500">
              Spatial anchor — each room hosts work items, assets, materials,
              and documents.
            </p>
          )}
        </div>
        {!collapsed && !adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md border border-paper-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-paper-50"
          >
            Add room
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {adding && (
            <RoomForm
              projectId={projectId}
              mode="create"
              onClose={() => setAdding(false)}
            />
          )}
          {editing && (
            <RoomForm
              projectId={projectId}
              mode="edit"
              existing={editing}
              onClose={() => setEditing(null)}
            />
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {list.isLoading ? (
              <p className="col-span-full text-xs text-slate-500">Loading…</p>
            ) : !list.data || list.data.length === 0 ? (
              <p className="col-span-full rounded-md border border-paper-200 bg-white p-3 text-xs text-slate-500">
                No rooms yet. Click <strong>Add room</strong> to anchor the
                spatial side of the project.
              </p>
            ) : (
              list.data.map((r) => (
                <RoomRowItem key={r.id} room={r} onEdit={() => setEditing(r)} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RoomRowItem({
  room,
  onEdit,
}: {
  room: RoomRow;
  onEdit: () => void;
}) {
  const utils = trpc.useUtils();
  const remove = trpc.projects.removeRoom.useMutation({
    onSuccess: () =>
      utils.projects.listRooms.invalidate({ projectId: room.projectId }),
  });
  return (
    <div className="flex items-center gap-3 rounded-md border border-paper-200 bg-white px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{room.name}</span>
          {room.roomType && (
            <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              {ROOM_TYPE_LABELS[room.roomType]}
            </span>
          )}
        </div>
        {room.notes && (
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {room.notes}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-slate-500 hover:text-slate-900"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm(`Remove ${room.name}?`)) remove.mutate({ id: room.id });
        }}
        disabled={remove.isPending}
        className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
      >
        {remove.isPending ? "…" : "Remove"}
      </button>
    </div>
  );
}

function RoomForm({
  projectId,
  mode,
  existing,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: RoomRow;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [roomType, setRoomType] = useState<RoomType | "">(
    existing?.roomType ?? "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const add = trpc.projects.addRoom.useMutation({
    onSuccess: () => {
      utils.projects.listRooms.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const upd = trpc.projects.updateRoom.useMutation({
    onSuccess: () => {
      utils.projects.listRooms.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = add.isPending || upd.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const base = {
      name: name.trim(),
      roomType: (roomType || undefined) as RoomType | undefined,
      notes: notes.trim() || undefined,
    };
    if (mode === "edit" && existing) {
      upd.mutate({ id: existing.id, patch: base });
    } else {
      add.mutate({ projectId, ...base });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 rounded-md border border-paper-200 bg-white p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="Kitchen / Primary Bath / Office"
          />
        </Field>
        <Field label="Type">
          <select
            value={roomType}
            onChange={(e) => setRoomType(e.target.value as RoomType | "")}
            className={selectCls}
          >
            <option value="">— (none)</option>
            {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
              <option key={t} value={t}>
                {ROOM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" wide>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
            placeholder="Square footage, ceiling height, scope notes…"
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-paper-200 px-3 py-1 text-xs hover:bg-paper-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : mode === "edit" ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

// ───────────────────────────────────── primitives ─────────────

const inputCls =
  "block w-full rounded-md border border-paper-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

const selectCls =
  "block rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
