import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  ROOM_TYPE_LABELS,
  WORK_ITEM_DEPENDENCY_KIND_LABELS,
  WORK_ITEM_DEPENDENCY_KIND_SHORT,
  WORK_ITEM_STATUS_FLOW,
  WORK_ITEM_STATUS_LABELS,
  type RoomType,
  type WorkItemDependencyKind,
  type WorkItemStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type WorkItemRow = inferRouterOutputs<AppRouter>["workItems"]["list"][number];
type RoomRow = inferRouterOutputs<AppRouter>["projects"]["listRooms"][number];
type VendorRow = inferRouterOutputs<AppRouter>["vendors"]["list"][number];
type BidRow = inferRouterOutputs<AppRouter>["bids"]["list"][number];
type DepRow =
  inferRouterOutputs<AppRouter>["workItems"]["listDependencies"][number];

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

  // Honor the `#rooms` hash from the Rooms sidebar link by scrolling
  // the room section into view after first render. Runs once on hash
  // change so the user can manually scroll back to top without us
  // fighting them.
  useEffect(() => {
    if (window.location.hash === "#rooms") {
      const el = document.getElementById("rooms");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div>
      <WorkItemsSection projectId={project.id} />
      <div
        id="rooms"
        className="mt-10 scroll-mt-24 border-t border-paper-200 pt-8"
      >
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

type PlanView = "table" | "rooms" | "timeline" | "calendar";

type StatusFilter =
  | WorkItemStatus
  | "open"
  | "all"
  | "scope_active"
  | "execution_active";

/**
 * Status filter options — shared by the table's column-header filter and
 * the compact bar the non-table views use. Defaults to "all".
 */
const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open (not done)" },
  { value: "scope_active", label: "Scope · approved" },
  { value: "execution_active", label: "Execution" },
  ...WORK_ITEM_STATUS_FLOW.map((s) => ({
    value: s as StatusFilter,
    label: WORK_ITEM_STATUS_LABELS[s],
  })),
  { value: "cancelled", label: "Cancelled" },
];

/** Compact control styling for the table's per-column header filters. */
const colFilterCls =
  "w-full rounded border border-paper-200 bg-white px-2 py-1 text-[11px] font-normal normal-case tracking-normal text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

type PhaseLens = "proposal" | "execution" | null;

/**
 * Parse `?phase=` and `?view=` query params. They drive the initial
 * defaults for the view toggle and status filter:
 *   phase=proposal   → table view, status=specified-or-approved
 *   phase=execution  → table view, status=scheduled-or-in-progress
 *   view=timeline    → timeline view (independent of phase)
 *   (none)           → table view, status=open
 */
function readUrlDefaults(search: URLSearchParams): {
  view: PlanView;
  statusFilter: WorkItemStatus | "open" | "all" | "scope_active" | "execution_active";
  lens: PhaseLens;
} {
  const view = (search.get("view") as PlanView | null) ?? "table";
  const phase = search.get("phase");
  if (phase === "proposal") {
    return {
      view: ["timeline", "rooms", "calendar"].includes(view) ? view : "table",
      statusFilter: "scope_active",
      lens: "proposal",
    };
  }
  if (phase === "execution") {
    return {
      view: ["timeline", "rooms", "calendar"].includes(view) ? view : "table",
      statusFilter: "execution_active",
      lens: "execution",
    };
  }
  return {
    view: ["table", "rooms", "timeline", "calendar"].includes(view)
      ? view
      : "table",
    statusFilter: "all",
    lens: null,
  };
}

/**
 * Default status for a newly-added work item, chosen so the row is
 * visible in the current filter — otherwise "Add" appears to do nothing.
 * The proposal phase shows only "approved", the default "open" view
 * hides "specified" drafts, etc. A manually-added line is real scope, so
 * it lands "approved" (or matches an explicit status filter).
 */
function defaultStatusForFilter(
  filter:
    | WorkItemStatus
    | "open"
    | "all"
    | "scope_active"
    | "execution_active",
): WorkItemStatus {
  switch (filter) {
    case "execution_active":
      return "scheduled";
    case "open":
    case "all":
    case "scope_active":
      return "approved";
    default:
      return filter;
  }
}

function WorkItemsSection({ projectId }: { projectId: string }) {
  const [searchParams] = useSearchParams();
  const urlDefaults = useMemo(
    () => readUrlDefaults(searchParams),
    [searchParams],
  );
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<PlanView>(urlDefaults.view);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    urlDefaults.statusFilter,
  );

  // When the URL changes (user clicks a different sidebar phase link),
  // reset the controls to the new defaults. We only do this on URL
  // change so the user's local state edits aren't clobbered.
  const lastSearch = useRef(searchParams.toString());
  useEffect(() => {
    const cur = searchParams.toString();
    if (cur !== lastSearch.current) {
      const d = readUrlDefaults(searchParams);
      setView(d.view);
      setStatusFilter(d.statusFilter);
      lastSearch.current = cur;
    }
  }, [searchParams]);

  const [tradeFilter, setTradeFilter] = useState<string>("");
  const [roomFilter, setRoomFilter] = useState<string>("");
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [search, setSearch] = useState("");

  // Multi-status filters. "specified" items are intentionally hidden
  // from the default views — they're un-approved bid lines that haven't
  // been promoted to the live Plan yet (awarding a bid flips them to
  // "approved"). To see them, pick status=Specified explicitly.
  const multiStatusFilters: Record<string, WorkItemStatus[]> = {
    open: ["approved", "scheduled", "in_progress"],
    scope_active: ["approved"],
    execution_active: ["scheduled", "in_progress", "done"],
  };
  const isMulti = statusFilter in multiStatusFilters;
  const statusInput =
    isMulti || statusFilter === "all"
      ? undefined
      : (statusFilter as WorkItemStatus);
  const list = trpc.workItems.list.useQuery({
    projectId,
    status: statusInput,
    trade: tradeFilter || undefined,
    roomId: roomFilter || undefined,
    vendorId: vendorFilter || undefined,
    search: search.trim() || undefined,
  });
  const trades = trpc.workItems.listTrades.useQuery({ projectId });
  const rooms = trpc.projects.listRooms.useQuery({ projectId });
  const vendors = trpc.vendors.list.useQuery({});
  const bids = trpc.bids.list.useQuery({ projectId });
  const deps = trpc.workItems.listDependencies.useQuery({ projectId });

  const filtered = useMemo(() => {
    if (!isMulti) return list.data ?? [];
    const allowed = new Set(multiStatusFilters[statusFilter as string]);
    return (list.data ?? []).filter((w) => allowed.has(w.status));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, statusFilter, isMulti]);

  // Dependency indexes derived from the deps query + full work_items
  // list. We want:
  //   dependsOnByItem: itemId → predecessor work_items (full rows)
  //   blockedByItem:   itemId → unfinished predecessor work_items
  // Computed against the *unfiltered* list so the "blocked" badge
  // doesn't lie when filters hide the predecessor row.
  const allItems = list.data ?? [];
  const allItemsById = useMemo(() => {
    const m = new Map<string, WorkItemRow>();
    for (const w of allItems) m.set(w.id, w);
    return m;
  }, [allItems]);
  const depsByItem = useMemo(() => {
    const m = new Map<string, DepRow[]>();
    for (const d of deps.data ?? []) {
      const arr = m.get(d.workItemId) ?? [];
      arr.push(d);
      m.set(d.workItemId, arr);
    }
    return m;
  }, [deps.data]);
  const blockedByItem = useMemo(() => {
    const m = new Map<string, WorkItemRow[]>();
    for (const [itemId, edges] of depsByItem) {
      const blockers: WorkItemRow[] = [];
      for (const edge of edges) {
        const pred = allItemsById.get(edge.dependsOnId);
        if (!pred) continue;
        if (pred.status !== "done" && pred.status !== "accepted") {
          blockers.push(pred);
        }
      }
      if (blockers.length > 0) m.set(itemId, blockers);
    }
    return m;
  }, [depsByItem, allItemsById]);

  const openDetail = (w: WorkItemRow) =>
    navigate(`/projects/${projectId}/plan/${w.id}`);
  const hasActiveFilters =
    !!search.trim() ||
    !!tradeFilter ||
    !!roomFilter ||
    !!vendorFilter ||
    statusFilter !== "all";

  // Grouping (swimlanes / color) applies only to the timeline + calendar.
  const groupingActive =
    groupBy !== "none" && (view === "timeline" || view === "calendar");
  const grouping = useMemo(
    () => buildGrouping(filtered, groupingActive ? groupBy : "none"),
    [filtered, groupBy, groupingActive],
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            Work items
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Quoted → approved → scheduled → executed → billed.
          </p>
        </div>
        {!adding && (
          <div className="flex items-center gap-2">
            <ViewToggle view={view} onChange={setView} />
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800"
            >
              Add work item
            </button>
          </div>
        )}
      </div>

      {/* Compact filter bar — only for the non-table views. The Table
          carries its own per-column header filters (same state). */}
      {!adding && view !== "table" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(view === "timeline" || view === "calendar") && (
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className={selectCls}
              title="Group by"
            >
              <option value="none">No grouping</option>
              <option value="room">Group by room</option>
              <option value="vendor">Group by vendor</option>
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={selectCls}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">All types</option>
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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, ref, notes…"
            className="flex-1 rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
          />
        </div>
      )}

      {adding && (
        <WorkItemForm
          projectId={projectId}
          mode="create"
          defaultStatus={defaultStatusForFilter(statusFilter)}
          onClose={() => setAdding(false)}
          rooms={rooms.data ?? []}
          vendors={vendors.data ?? []}
          bids={bids.data ?? []}
          allItems={allItems}
        />
      )}
      <div className="mt-4">
        {list.isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : list.error ? (
          <p className="text-xs text-rose-700">{list.error.message}</p>
        ) : view === "rooms" ? (
          filtered.length === 0 ? (
            <EmptyPlan hasActiveFilters={hasActiveFilters} />
          ) : (
            <ScopeByRoom
              items={filtered}
              rooms={rooms.data ?? []}
              blockedByItem={blockedByItem}
              onEdit={openDetail}
            />
          )
        ) : view === "timeline" ? (
          filtered.length === 0 ? (
            <EmptyPlan hasActiveFilters={hasActiveFilters} />
          ) : groupingActive ? (
            <GroupedTimeline
              groups={grouping.groups}
              blockedByItem={blockedByItem}
              onEdit={openDetail}
            />
          ) : (
            <TimelineView
              items={filtered}
              depsByItem={depsByItem}
              blockedByItem={blockedByItem}
              onEdit={openDetail}
            />
          )
        ) : view === "calendar" ? (
          filtered.length === 0 ? (
            <EmptyPlan hasActiveFilters={hasActiveFilters} />
          ) : (
            <CalendarView
              items={filtered}
              onEdit={openDetail}
              colorForItem={groupingActive ? grouping.colorForItem : undefined}
              legend={groupingActive ? grouping.groups : undefined}
            />
          )
        ) : (
          <WorkItemsTable
            items={filtered}
            onRowClick={openDetail}
            trades={trades.data ?? []}
            rooms={rooms.data ?? []}
            vendors={vendors.data ?? []}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            tradeFilter={tradeFilter}
            setTradeFilter={setTradeFilter}
            roomFilter={roomFilter}
            setRoomFilter={setRoomFilter}
            vendorFilter={vendorFilter}
            setVendorFilter={setVendorFilter}
            search={search}
            setSearch={setSearch}
            hasActiveFilters={hasActiveFilters}
          />
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: PlanView;
  onChange: (v: PlanView) => void;
}) {
  const opts: { value: PlanView; label: string }[] = [
    { value: "table", label: "Table" },
    { value: "rooms", label: "By room" },
    { value: "timeline", label: "Timeline" },
    { value: "calendar", label: "Calendar" },
  ];
  return (
    <div className="inline-flex rounded-md border border-paper-200 bg-white p-0.5 text-xs">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 transition-colors ${
            view === o.value
              ? "bg-paper-100 font-medium text-blueprint-900"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {o.label}
        </button>
      ))}
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
  blockedByItem,
  onEdit,
}: {
  items: WorkItemRow[];
  rooms: RoomRow[];
  blockedByItem: Map<string, WorkItemRow[]>;
  onEdit: (w: WorkItemRow) => void;
}) {
  const L = useLabels();
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
                  {L.roomType(g.room.roomType)}
                </span>
              )}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              {g.items.length} item{g.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="px-3 py-1.5">Ref</th>
                <th className="px-3 py-1.5">Description</th>
                <th className="px-3 py-1.5 text-right">Qty</th>
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
                  blockedBy={blockedByItem.get(w.id) ?? null}
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
  blockedBy,
  onEdit,
}: {
  item: WorkItemRow;
  currentRoomId: string | null;
  blockedBy: WorkItemRow[] | null;
  onEdit: () => void;
}) {
  const L = useLabels();
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
          {blockedBy && blockedBy.length > 0 && <BlockedPill blockers={blockedBy} />}
          {item.bid && (
            <Link
              to={`/projects/${item.projectId}/bids/${item.bid.id}`}
              title={
                item.bid.bidNumber
                  ? `Bid #${item.bid.bidNumber}`
                  : "Source bid"
              }
              className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-100"
            >
              ↗ {item.vendor?.name ?? "Bid"}
            </Link>
          )}
          {!item.bid && item.vendor && (
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
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[item.status]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {L.workItemStatus(item.status).toLowerCase()}
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
  onRowClick,
  trades,
  rooms,
  vendors,
  statusFilter,
  setStatusFilter,
  tradeFilter,
  setTradeFilter,
  roomFilter,
  setRoomFilter,
  vendorFilter,
  setVendorFilter,
  search,
  setSearch,
  hasActiveFilters,
}: {
  items: WorkItemRow[];
  onRowClick: (w: WorkItemRow) => void;
  trades: string[];
  rooms: RoomRow[];
  vendors: VendorRow[];
  statusFilter: StatusFilter;
  setStatusFilter: (s: StatusFilter) => void;
  tradeFilter: string;
  setTradeFilter: (s: string) => void;
  roomFilter: string;
  setRoomFilter: (s: string) => void;
  vendorFilter: string;
  setVendorFilter: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  hasActiveFilters: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-paper-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-paper-50">
          <tr className="text-left text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
            <th className="px-3 pt-2">Ref</th>
            <th className="px-3 pt-2">Description</th>
            <th className="px-3 pt-2">Type of work</th>
            <th className="px-3 pt-2">Rooms</th>
            <th className="px-3 pt-2">Vendor</th>
            <th className="px-3 pt-2">Status</th>
            <th className="px-3 pt-2">Start</th>
            <th className="px-3 pt-2">End</th>
          </tr>
          <tr className="align-top">
            <th className="px-3 pb-2 pt-1.5" />
            <th className="px-3 pb-2 pt-1.5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className={colFilterCls}
              />
            </th>
            <th className="px-3 pb-2 pt-1.5">
              <select
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value)}
                className={colFilterCls}
              >
                <option value="">All</option>
                {trades.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </th>
            <th className="px-3 pb-2 pt-1.5">
              <select
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                className={colFilterCls}
              >
                <option value="">All</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </th>
            <th className="px-3 pb-2 pt-1.5">
              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className={colFilterCls}
              >
                <option value="">All</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </th>
            <th className="px-3 pb-2 pt-1.5">
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                className={colFilterCls}
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </th>
            <th className="px-3 pb-2 pt-1.5" />
            <th className="px-3 pb-2 pt-1.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-200">
          {items.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="px-3 py-10 text-center text-xs text-slate-500"
              >
                {hasActiveFilters
                  ? "No work items match these filters."
                  : "No work items yet. Click Add work item to start."}
              </td>
            </tr>
          ) : (
            items.map((w) => (
              <WorkItemRowItem
                key={w.id}
                item={w}
                onClick={() => onRowClick(w)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyPlan({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
      {hasActiveFilters ? (
        "No work items match these filters."
      ) : (
        <>
          No work items yet. Click <strong>Add work item</strong> to start
          sketching the plan — or upload a vendor bid once that lands.
        </>
      )}
    </p>
  );
}

function WorkItemRowItem({
  item,
  onClick,
}: {
  item: WorkItemRow;
  onClick: () => void;
}) {
  const fmt = useFormatters();
  const L = useLabels();
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer align-top transition-colors hover:bg-paper-50"
    >
      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
        {item.ref ?? "—"}
      </td>
      <td className="px-3 py-2.5 font-medium text-blueprint-900">
        {item.description}
      </td>
      <td className="px-3 py-2.5 text-[13px] text-slate-600">
        {item.trade ?? "—"}
      </td>
      <td className="px-3 py-2.5 text-[13px] text-slate-600">
        {item.rooms.length > 0 ? item.rooms.map((r) => r.name).join(", ") : "—"}
      </td>
      <td className="px-3 py-2.5 text-[13px] text-slate-600">
        {item.vendor?.name ?? "—"}
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[item.status]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {L.workItemStatus(item.status).toLowerCase()}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-slate-600">
        {item.plannedStart ? fmt.date(item.plannedStart) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-slate-600">
        {item.plannedEnd ? fmt.date(item.plannedEnd) : "—"}
      </td>
    </tr>
  );
}

export function nextStatus(status: WorkItemStatus): WorkItemStatus | null {
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

function BlockedPill({ blockers }: { blockers: WorkItemRow[] }) {
  const title = blockers
    .map((b) => `${b.ref ? `${b.ref} — ` : ""}${b.description}`)
    .join("\n");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-200"
      title={`Blocked by ${blockers.length} unfinished predecessor${blockers.length === 1 ? "" : "s"}:\n${title}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      blocked
      {blockers.length > 1 && <span>· {blockers.length}</span>}
    </span>
  );
}

// ───────────────────────────────────── timeline view ─────────

/**
 * Timeline — items with both plannedStart and plannedEnd render as
 * horizontal bars on a shared date axis. Sorted by plannedStart.
 * Dependencies drawn as thin SVG arrows between bars. Items missing
 * dates fall into an "Undated" list below.
 *
 * Intentionally light on visual chrome — this is a "see the chain"
 * view, not a full CPM Gantt. If the firm needs lag calculations or
 * critical-path highlighting that's a follow-up PR.
 */
// ───────────────────────────────────── grouping ─────────────

type GroupBy = "none" | "room" | "vendor";
type GroupColor = { dot: string; chip: string };
type ItemGroup = {
  key: string;
  label: string;
  color: GroupColor;
  items: WorkItemRow[];
};

/** Stable palette for group color-coding (calendar chips, lane accents). */
const GROUP_PALETTE: GroupColor[] = [
  { dot: "#0284c7", chip: "bg-sky-50 text-sky-800 ring-sky-200" },
  { dot: "#7c3aed", chip: "bg-violet-50 text-violet-800 ring-violet-200" },
  { dot: "#059669", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  { dot: "#d97706", chip: "bg-amber-50 text-amber-900 ring-amber-200" },
  { dot: "#db2777", chip: "bg-pink-50 text-pink-800 ring-pink-200" },
  { dot: "#0d9488", chip: "bg-teal-50 text-teal-800 ring-teal-200" },
  { dot: "#4f46e5", chip: "bg-indigo-50 text-indigo-800 ring-indigo-200" },
  { dot: "#ca8a04", chip: "bg-yellow-50 text-yellow-800 ring-yellow-200" },
];
const UNGROUPED_COLOR: GroupColor = {
  dot: "#94a3b8",
  chip: "bg-slate-50 text-slate-600 ring-slate-200",
};

/**
 * Partition work items by room or vendor. Room grouping is many-to-one
 * (a multi-room item appears in each room's group, like the By-room
 * view); vendor grouping is one-to-one. Named groups sort by label,
 * "Unassigned" last, each with a stable palette color. Also returns a
 * per-item color lookup (by the item's primary group) for the calendar.
 */
function buildGrouping(
  items: WorkItemRow[],
  by: GroupBy,
): { groups: ItemGroup[]; colorForItem: (w: WorkItemRow) => GroupColor } {
  if (by === "none") {
    return { groups: [], colorForItem: () => UNGROUPED_COLOR };
  }
  const map = new Map<string, { label: string; items: WorkItemRow[] }>();
  const add = (key: string, label: string, w: WorkItemRow) => {
    const g = map.get(key) ?? { label, items: [] };
    g.items.push(w);
    map.set(key, g);
  };
  const primaryKey = (w: WorkItemRow): string =>
    by === "vendor"
      ? (w.vendor?.id ?? "__none")
      : (w.rooms[0]?.id ?? "__none");
  for (const w of items) {
    if (by === "vendor") {
      add(w.vendor?.id ?? "__none", w.vendor?.name ?? "Unassigned", w);
    } else if (w.rooms.length === 0) {
      add("__none", "Unassigned", w);
    } else {
      for (const r of w.rooms) add(r.id, r.name, w);
    }
  }
  const named = [...map.keys()]
    .filter((k) => k !== "__none")
    .sort((a, b) => map.get(a)!.label.localeCompare(map.get(b)!.label));
  const orderedKeys = map.has("__none") ? [...named, "__none"] : named;
  const colorByKey = new Map<string, GroupColor>();
  const groups: ItemGroup[] = orderedKeys.map((key, i) => {
    const color =
      key === "__none"
        ? UNGROUPED_COLOR
        : (GROUP_PALETTE[i % GROUP_PALETTE.length] ?? UNGROUPED_COLOR);
    colorByKey.set(key, color);
    const entry = map.get(key)!;
    return { key, label: entry.label, color, items: entry.items };
  });
  return {
    groups,
    colorForItem: (w) => colorByKey.get(primaryKey(w)) ?? UNGROUPED_COLOR,
  };
}

function TimelineView({
  items,
  depsByItem,
  blockedByItem,
  onEdit,
}: {
  items: WorkItemRow[];
  depsByItem: Map<string, DepRow[]>;
  blockedByItem: Map<string, WorkItemRow[]>;
  onEdit: (w: WorkItemRow) => void;
}) {
  const fmt = useFormatters();
  const L = useLabels();
  const dated = items.filter((w) => w.plannedStart && w.plannedEnd);
  const undated = items.filter((w) => !w.plannedStart || !w.plannedEnd);

  const sorted = useMemo(
    () =>
      [...dated].sort((a, b) =>
        (a.plannedStart ?? "").localeCompare(b.plannedStart ?? ""),
      ),
    [dated],
  );
  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>();
    sorted.forEach((w, i) => m.set(w.id, i));
    return m;
  }, [sorted]);

  // Date axis: span min(plannedStart) → max(plannedEnd). Pad both
  // ends by a day so labels aren't flush against edges.
  const bounds = useMemo(() => {
    if (sorted.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const w of sorted) {
      const s = Date.parse(w.plannedStart!);
      const e = Date.parse(w.plannedEnd!);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    const pad = 86400_000;
    return { min: min - pad, max: max + pad };
  }, [sorted]);

  const ROW_H = 36;
  const BAR_H = 18;
  const W = 760; // svg width in viewBox units

  function xFor(dateStr: string): number {
    if (!bounds) return 0;
    const t = Date.parse(dateStr);
    return ((t - bounds.min) / (bounds.max - bounds.min)) * W;
  }

  // Date axis tick marks — one per week.
  const ticks = useMemo(() => {
    if (!bounds) return [];
    const result: { x: number; label: string }[] = [];
    const start = new Date(bounds.min);
    start.setHours(0, 0, 0, 0);
    const step = 7 * 86400_000;
    for (let t = start.getTime(); t <= bounds.max; t += step) {
      const x = ((t - bounds.min) / (bounds.max - bounds.min)) * W;
      const d = new Date(t);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      result.push({ x, label });
    }
    return result;
  }, [bounds]);

  if (sorted.length === 0 && undated.length === 0) {
    return (
      <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
        No work items to plot.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-paper-200 bg-white">
          <svg
            viewBox={`0 0 ${W} ${sorted.length * ROW_H + 32}`}
            className="block w-full"
            style={{ minWidth: 600 }}
          >
            {/* axis */}
            {ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={t.x}
                  x2={t.x}
                  y1={20}
                  y2={sorted.length * ROW_H + 24}
                  stroke="#e6e9ef"
                  strokeWidth={1}
                />
                <text
                  x={t.x}
                  y={14}
                  fontSize={9}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontFamily="ui-monospace, monospace"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* bars */}
            {sorted.map((w, i) => {
              const x1 = xFor(w.plannedStart!);
              const x2 = xFor(w.plannedEnd!);
              const y = 24 + i * ROW_H;
              const blocked = blockedByItem.has(w.id);
              const fill = STATUS_BAR_FILL[w.status];
              const stroke = blocked ? "#b45309" : STATUS_BAR_STROKE[w.status];
              return (
                <g
                  key={w.id}
                  className="cursor-pointer"
                  onClick={() => onEdit(w)}
                >
                  <rect
                    x={x1}
                    y={y}
                    width={Math.max(2, x2 - x1)}
                    height={BAR_H}
                    rx={3}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={blocked ? 1.5 : 1}
                  />
                  <text
                    x={x1 + 4}
                    y={y + BAR_H / 2 + 3}
                    fontSize={10}
                    fill="#1e293b"
                  >
                    {w.ref ? `${w.ref} · ` : ""}
                    {w.description.length > 40
                      ? w.description.slice(0, 40) + "…"
                      : w.description}
                  </text>
                </g>
              );
            })}

            {/* dep arrows */}
            {sorted.flatMap((w) => {
              const edges = depsByItem.get(w.id) ?? [];
              return edges
                .map((e, ei) => {
                  const pred = sorted.find((s) => s.id === e.dependsOnId);
                  if (!pred) return null;
                  const fromX = xFor(pred.plannedEnd!);
                  const fromY = 24 + rowIndexById.get(pred.id)! * ROW_H + BAR_H / 2;
                  const toX = xFor(w.plannedStart!);
                  const toY = 24 + rowIndexById.get(w.id)! * ROW_H + BAR_H / 2;
                  return (
                    <g key={`${w.id}-${ei}`}>
                      <path
                        d={`M ${fromX} ${fromY} L ${(fromX + toX) / 2} ${fromY} L ${(fromX + toX) / 2} ${toY} L ${toX} ${toY}`}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth={1}
                        strokeDasharray="3 2"
                      />
                      <polygon
                        points={`${toX},${toY} ${toX - 4},${toY - 3} ${toX - 4},${toY + 3}`}
                        fill="#94a3b8"
                      />
                    </g>
                  );
                })
                .filter(Boolean);
            })}
          </svg>
        </div>
      )}

      {undated.length > 0 && (
        <div className="overflow-hidden rounded-md border border-paper-200 bg-white">
          <div className="border-b border-paper-200 bg-paper-50 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            Undated · {undated.length} item{undated.length === 1 ? "" : "s"}
          </div>
          <ul className="divide-y divide-paper-200 text-sm">
            {undated.map((w) => (
              <li key={w.id} className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onEdit(w)}
                  className="text-left text-blueprint-900 hover:underline"
                >
                  {w.ref && (
                    <span className="mr-2 font-mono text-[11px] text-slate-500">
                      {w.ref}
                    </span>
                  )}
                  {w.description}
                </button>
                <span className="ml-2 text-[10px] text-slate-500">
                  {L.workItemStatus(w.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const STATUS_BAR_FILL: Record<WorkItemStatus, string> = {
  specified: "#f1f5f9",
  approved: "#e0f2fe",
  scheduled: "#e0e7ff",
  in_progress: "#fef3c7",
  done: "#d1fae5",
  accepted: "#ede9fe",
  cancelled: "#fee2e2",
};
const STATUS_BAR_STROKE: Record<WorkItemStatus, string> = {
  specified: "#cbd5e1",
  approved: "#bae6fd",
  scheduled: "#c7d2fe",
  in_progress: "#fde68a",
  done: "#a7f3d0",
  accepted: "#ddd6fe",
  cancelled: "#fecaca",
};

/**
 * Grouped timeline — swimlanes. One labeled lane per room/vendor group,
 * all sharing a single global date axis so dates line up across lanes.
 * Bars keep their status color; the lane header carries the group color.
 * Dependency arrows are omitted in grouped mode (rows repeat across
 * lanes for multi-room items, so cross-lane arrows would be ambiguous).
 */
function GroupedTimeline({
  groups,
  blockedByItem,
  onEdit,
}: {
  groups: ItemGroup[];
  blockedByItem: Map<string, WorkItemRow[]>;
  onEdit: (w: WorkItemRow) => void;
}) {
  const ROW_H = 30;
  const BAR_H = 16;
  const HEADER_H = 24;
  const W = 760;

  const bounds = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const g of groups) {
      for (const w of g.items) {
        if (!w.plannedStart || !w.plannedEnd) continue;
        const s = Date.parse(w.plannedStart);
        const e = Date.parse(w.plannedEnd);
        if (s < min) min = s;
        if (e > max) max = e;
      }
    }
    if (!isFinite(min) || !isFinite(max)) return null;
    const pad = 86400_000;
    return { min: min - pad, max: max + pad };
  }, [groups]);

  const xFor = (dateStr: string): number => {
    if (!bounds) return 0;
    return ((Date.parse(dateStr) - bounds.min) / (bounds.max - bounds.min)) * W;
  };

  const ticks = useMemo(() => {
    if (!bounds) return [];
    const result: { x: number; label: string }[] = [];
    const start = new Date(bounds.min);
    start.setHours(0, 0, 0, 0);
    for (let t = start.getTime(); t <= bounds.max; t += 7 * 86400_000) {
      const x = ((t - bounds.min) / (bounds.max - bounds.min)) * W;
      const d = new Date(t);
      result.push({ x, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    return result;
  }, [bounds]);

  const layout = useMemo(() => {
    const rows: Array<
      | { type: "header"; group: ItemGroup; y: number }
      | { type: "bar"; w: WorkItemRow; y: number }
    > = [];
    let y = 26;
    for (const g of groups) {
      const dated = g.items.filter((w) => w.plannedStart && w.plannedEnd);
      if (dated.length === 0) continue;
      rows.push({ type: "header", group: g, y });
      y += HEADER_H;
      for (const w of dated) {
        rows.push({ type: "bar", w, y });
        y += ROW_H;
      }
      y += 6;
    }
    return { rows, height: Math.max(y, 60) };
  }, [groups]);

  const undatedGroups = groups
    .map((g) => ({
      g,
      undated: g.items.filter((w) => !w.plannedStart || !w.plannedEnd),
    }))
    .filter((x) => x.undated.length > 0);

  return (
    <div className="space-y-4">
      {bounds && layout.rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-paper-200 bg-white">
          <svg
            viewBox={`0 0 ${W} ${layout.height}`}
            className="block w-full"
            style={{ minWidth: 600 }}
          >
            {ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={t.x}
                  x2={t.x}
                  y1={18}
                  y2={layout.height}
                  stroke="#eef1f5"
                  strokeWidth={1}
                />
                <text
                  x={t.x}
                  y={12}
                  fontSize={9}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontFamily="ui-monospace, monospace"
                >
                  {t.label}
                </text>
              </g>
            ))}
            {layout.rows.map((row, i) => {
              if (row.type === "header") {
                return (
                  <g key={`h-${row.group.key}`}>
                    <rect
                      x={0}
                      y={row.y}
                      width={W}
                      height={HEADER_H - 4}
                      fill="#f8fafc"
                    />
                    <circle
                      cx={6}
                      cy={row.y + (HEADER_H - 4) / 2}
                      r={4}
                      fill={row.group.color.dot}
                    />
                    <text
                      x={16}
                      y={row.y + (HEADER_H - 4) / 2 + 3}
                      fontSize={11}
                      fontWeight={600}
                      fill="#334155"
                    >
                      {row.group.label} · {row.group.items.length}
                    </text>
                  </g>
                );
              }
              const w = row.w;
              const x1 = xFor(w.plannedStart!);
              const x2 = xFor(w.plannedEnd!);
              const blocked = blockedByItem.has(w.id);
              return (
                <g
                  key={`b-${w.id}-${i}`}
                  className="cursor-pointer"
                  onClick={() => onEdit(w)}
                >
                  <rect
                    x={x1}
                    y={row.y}
                    width={Math.max(2, x2 - x1)}
                    height={BAR_H}
                    rx={3}
                    fill={STATUS_BAR_FILL[w.status]}
                    stroke={blocked ? "#b45309" : STATUS_BAR_STROKE[w.status]}
                    strokeWidth={blocked ? 1.5 : 1}
                  />
                  <text
                    x={x1 + 4}
                    y={row.y + BAR_H / 2 + 3}
                    fontSize={10}
                    fill="#1e293b"
                  >
                    {w.ref ? `${w.ref} · ` : ""}
                    {w.description.length > 38
                      ? w.description.slice(0, 38) + "…"
                      : w.description}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {undatedGroups.length > 0 && (
        <div className="overflow-hidden rounded-md border border-paper-200 bg-white">
          <div className="border-b border-paper-200 bg-paper-50 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            Undated — no planned dates
          </div>
          <div className="divide-y divide-paper-200">
            {undatedGroups.map(({ g, undated }) => (
              <div key={g.key} className="px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: g.color.dot }}
                  />
                  {g.label}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {undated.map((w) => (
                    <li key={`${g.key}-${w.id}`}>
                      <button
                        type="button"
                        onClick={() => onEdit(w)}
                        className="text-left text-[13px] text-blueprint-900 hover:underline"
                      >
                        {w.ref && (
                          <span className="mr-2 font-mono text-[11px] text-slate-500">
                            {w.ref}
                          </span>
                        )}
                        {w.description}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────── calendar view ─────────

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Primary calendar date: planned end (deadline), falling back to start. */
function planDate(w: WorkItemRow): string | null {
  return w.plannedEnd ?? w.plannedStart ?? null;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Calendar — work items placed on a month grid by their planned date
 * (deadline; falls back to start). Click a chip to open the editor.
 * Items with no planned dates list in an "Unscheduled" panel below.
 * Prev / Today / Next navigate months.
 *
 * Deadline-based placement (one cell per item), not multi-day span
 * bars — a clean "what's due when" read. Spans are a follow-up.
 */
function CalendarView({
  items,
  onEdit,
  colorForItem,
  legend,
}: {
  items: WorkItemRow[];
  onEdit: (w: WorkItemRow) => void;
  colorForItem?: (w: WorkItemRow) => GroupColor;
  legend?: ItemGroup[];
}) {
  const L = useLabels();
  const { byDate, unscheduled, firstDate } = useMemo(() => {
    const byDate = new Map<string, WorkItemRow[]>();
    const unscheduled: WorkItemRow[] = [];
    let firstDate: string | null = null;
    for (const w of items) {
      const d = planDate(w);
      if (!d) {
        unscheduled.push(w);
        continue;
      }
      const arr = byDate.get(d) ?? [];
      arr.push(w);
      byDate.set(d, arr);
      if (!firstDate || d < firstDate) firstDate = d;
    }
    return { byDate, unscheduled, firstDate };
  }, [items]);

  // Cursor month — initialised to the earliest scheduled item's month,
  // else the current month. Only the initial value is read.
  const [cursor, setCursor] = useState(() => {
    const base = firstDate ?? new Date().toISOString().slice(0, 10);
    const [ys, ms] = base.split("-");
    return { year: Number(ys), month: Number(ms) - 1 }; // month 0-indexed
  });

  // 6-week (42-cell) grid starting on the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const start = new Date(cursor.year, cursor.month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const dt = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + i,
      );
      return {
        date: ymd(dt.getFullYear(), dt.getMonth(), dt.getDate()),
        day: dt.getDate(),
        inMonth: dt.getMonth() === cursor.month,
      };
    });
  }, [cursor]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const dt = new Date(c.year, c.month + delta, 1);
      return { year: dt.getFullYear(), month: dt.getMonth() };
    });
  }
  function goToday() {
    const n = new Date();
    setCursor({ year: n.getFullYear(), month: n.getMonth() });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blueprint-900">
          {monthLabel}
        </h3>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-md border border-paper-200 px-2 py-1 text-xs text-slate-600 hover:bg-paper-50"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-paper-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-paper-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-md border border-paper-200 px-2 py-1 text-xs text-slate-600 hover:bg-paper-50"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {legend && legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {legend.map((g) => (
            <span key={g.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: g.color.dot }}
              />
              {g.label}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-paper-200 bg-white">
        <div className="grid grid-cols-7 border-b border-paper-200 bg-paper-50">
          {WEEKDAY_LABELS.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayItems = byDate.get(cell.date) ?? [];
            const isToday = cell.date === todayStr;
            return (
              <div
                key={cell.date}
                className={`min-h-[96px] border-b border-r border-paper-100 p-1 ${
                  cell.inMonth ? "bg-white" : "bg-paper-50/40"
                }`}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] ${
                      isToday
                        ? "bg-safety-700 font-semibold text-white"
                        : cell.inMonth
                          ? "text-slate-600"
                          : "text-slate-300"
                    }`}
                  >
                    {cell.day}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onEdit(w)}
                      title={`${w.ref ? `${w.ref} · ` : ""}${w.description}`}
                      className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] ring-1 ring-inset ${colorForItem ? colorForItem(w).chip : STATUS_PILL_CLS[w.status]}`}
                    >
                      {w.ref ? `${w.ref} · ` : ""}
                      {w.description}
                    </button>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="px-1 text-[9px] text-slate-400">
                      +{dayItems.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="overflow-hidden rounded-md border border-paper-200 bg-white">
          <div className="border-b border-paper-200 bg-paper-50 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            Unscheduled · {unscheduled.length} item
            {unscheduled.length === 1 ? "" : "s"} — no planned dates
          </div>
          <ul className="divide-y divide-paper-200 text-sm">
            {unscheduled.map((w) => (
              <li key={w.id} className="flex items-baseline gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onEdit(w)}
                  className="text-left text-blueprint-900 hover:underline"
                >
                  {w.ref && (
                    <span className="mr-2 font-mono text-[11px] text-slate-500">
                      {w.ref}
                    </span>
                  )}
                  {w.description}
                </button>
                <span
                  className={`ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ring-1 ring-inset ${STATUS_PILL_CLS[w.status]}`}
                >
                  {L.workItemStatus(w.status).toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────── work item form ────────

export function WorkItemForm({
  projectId,
  mode,
  existing,
  existingDeps,
  rooms,
  vendors,
  bids,
  allItems,
  defaultStatus = "specified",
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: WorkItemRow;
  existingDeps?: DepRow[];
  rooms: RoomRow[];
  vendors: VendorRow[];
  bids: BidRow[];
  allItems: WorkItemRow[];
  defaultStatus?: WorkItemStatus;
  onClose: () => void;
}) {
  const L = useLabels();
  const [description, setDescription] = useState(existing?.description ?? "");
  const [trade, setTrade] = useState(existing?.trade ?? "");
  const [ref, setRef] = useState(existing?.ref ?? "");
  const [vendorId, setVendorId] = useState(existing?.vendorId ?? "");
  const [bidId, setBidId] = useState(existing?.bid?.id ?? "");
  const [roomIds, setRoomIds] = useState<string[]>(
    existing?.rooms.map((r) => r.id) ?? [],
  );
  const [qty, setQty] = useState(existing?.qty ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [status, setStatus] = useState<WorkItemStatus>(
    existing?.status ?? defaultStatus,
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
      if (existing) utils.workItems.get.invalidate({ id: existing.id });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  function toggleRoom(id: string) {
    setRoomIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const base = {
      description: description.trim(),
      trade: trade.trim() || undefined,
      ref: ref.trim() || undefined,
      vendorId: vendorId || undefined,
      roomIds,
      qty: qty.trim() || undefined,
      unit: unit.trim() || undefined,
      status,
      plannedStart: plannedStart || undefined,
      plannedEnd: plannedEnd || undefined,
      notes: notes.trim() || undefined,
    };
    if (mode === "edit" && existing) {
      // `null` clears the link in a patch; `undefined` would leave it.
      update.mutate({ id: existing.id, patch: { ...base, bidId: bidId || null } });
    } else {
      create.mutate({ projectId, ...base, bidId: bidId || undefined });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-md border border-paper-200 bg-white p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
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
        <Field label="Source quote">
          <select
            value={bidId}
            onChange={(e) => setBidId(e.target.value)}
            className={selectCls}
          >
            <option value="">— (none)</option>
            {bids.map((b) => (
              <option key={b.id} value={b.id}>
                {[
                  b.vendor?.name ?? "Quote",
                  b.bidNumber ? `#${b.bidNumber}` : null,
                  b.trade,
                ]
                  .filter(Boolean)
                  .join(" · ")}
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
                  {L.workItemStatus(s)}
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
                    className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide ring-1 ring-inset transition-colors ${
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
              className={`${inputCls} !w-auto flex-1`}
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

      {mode === "edit" && existing && (
        <DependenciesEditor
          projectId={projectId}
          workItem={existing}
          existingDeps={existingDeps ?? []}
          allItems={allItems}
        />
      )}
      {mode === "create" && (
        <p className="mt-3 rounded-md border border-paper-200 bg-paper-50 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">
          Save first, then add dependencies from the edit view.
        </p>
      )}

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

// ───────────────────────────────────── dep editor ────────────

function DependenciesEditor({
  projectId,
  workItem,
  existingDeps,
  allItems,
}: {
  projectId: string;
  workItem: WorkItemRow;
  existingDeps: DepRow[];
  allItems: WorkItemRow[];
}) {
  const L = useLabels();
  const utils = trpc.useUtils();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const [pickedKind, setPickedKind] =
    useState<WorkItemDependencyKind>("finish_to_start");
  const [error, setError] = useState<string | null>(null);

  const add = trpc.workItems.addDependency.useMutation({
    onSuccess: () => {
      utils.workItems.listDependencies.invalidate({ projectId });
      utils.projects.overviewStats.invalidate({ projectId });
      setPickerOpen(false);
      setPickedId("");
      setError(null);
    },
    onError: (err) => setError(err.message),
  });
  const remove = trpc.workItems.removeDependency.useMutation({
    onSuccess: () => {
      utils.workItems.listDependencies.invalidate({ projectId });
      utils.projects.overviewStats.invalidate({ projectId });
    },
  });

  const allItemsById = useMemo(() => {
    const m = new Map<string, WorkItemRow>();
    for (const w of allItems) m.set(w.id, w);
    return m;
  }, [allItems]);

  // Items eligible to pick: not self, not already a predecessor.
  const existingPredIds = new Set(existingDeps.map((d) => d.dependsOnId));
  const eligible = allItems.filter(
    (w) => w.id !== workItem.id && !existingPredIds.has(w.id),
  );

  return (
    <div className="mt-4 rounded-md border border-paper-200 bg-paper-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          Depends on
        </p>
        {!pickerOpen && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            + Add dependency
          </button>
        )}
      </div>

      {existingDeps.length === 0 && !pickerOpen ? (
        <p className="mt-1 text-xs text-slate-500">
          None. Add a predecessor to block this item until that one's done.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-paper-200 rounded-md border border-paper-200 bg-white">
          {existingDeps.map((d) => {
            const pred = allItemsById.get(d.dependsOnId);
            return (
              <li
                key={d.id}
                className="flex items-baseline gap-2 px-3 py-2 text-sm"
              >
                <span
                  className="rounded-sm bg-paper-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200"
                  title={L.workItemDepKind(d.kind)}
                >
                  {WORK_ITEM_DEPENDENCY_KIND_SHORT[d.kind]}
                </span>
                <span className="text-blueprint-900">
                  {pred?.ref && (
                    <span className="font-mono text-[11px] text-slate-500">
                      {pred.ref} · {" "}
                    </span>
                  )}
                  {pred?.description ?? "(unknown item)"}
                </span>
                {pred && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ring-1 ring-inset ${STATUS_PILL_CLS[pred.status]}`}
                  >
                    {L.workItemStatus(pred.status).toLowerCase()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    remove.mutate({
                      workItemId: workItem.id,
                      dependsOnId: d.dependsOnId,
                    })
                  }
                  disabled={remove.isPending}
                  className="ml-auto text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pickerOpen && (
        <div className="mt-2 rounded-md border border-paper-200 bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
              className={`${selectCls} flex-1 min-w-[14rem]`}
            >
              <option value="">— pick a predecessor work item</option>
              {eligible.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.ref ? `${w.ref} — ` : ""}
                  {w.description.slice(0, 80)}
                </option>
              ))}
            </select>
            <select
              value={pickedKind}
              onChange={(e) =>
                setPickedKind(e.target.value as WorkItemDependencyKind)
              }
              className={selectCls}
            >
              {(
                Object.keys(
                  WORK_ITEM_DEPENDENCY_KIND_LABELS,
                ) as WorkItemDependencyKind[]
              ).map((k) => (
                <option key={k} value={k}>
                  {L.workItemDepKind(k)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                add.mutate({
                  workItemId: workItem.id,
                  dependsOnId: pickedId,
                  kind: pickedKind,
                })
              }
              disabled={!pickedId || add.isPending}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {add.isPending ? "…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                setError(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
        </div>
      )}
    </div>
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
            <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
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
  const L = useLabels();
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
              {L.roomType(room.roomType)}
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
  const L = useLabels();
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
                {L.roomType(t)}
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
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

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
