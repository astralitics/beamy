import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  BID_FLAG_LABELS,
  BID_PACKAGE_STATUS_LABELS,
  BID_STATUS_LABELS,
  type BidPackageStatus,
  type BidStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";
import {
  Button,
  Field as UIField,
  Icon,
  Input,
  Modal,
  Pill,
  Select as UISelect,
  Textarea,
} from "../../components/ui";

type PackageRow =
  inferRouterOutputs<AppRouter>["bidPackages"]["list"][number];

const PACKAGE_TONE: Record<BidPackageStatus, "warn" | "success" | "muted"> = {
  open: "warn",
  awarded: "success",
  cancelled: "muted",
};

const STATUS_TONE: Record<
  BidStatus,
  "info" | "warn" | "success" | "alert" | "muted"
> = {
  received: "info",
  comparing: "warn",
  accepted: "success",
  rejected: "alert",
  expired: "muted",
};

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type BidRow = inferRouterOutputs<AppRouter>["bids"]["list"][number];
type VendorRow = inferRouterOutputs<AppRouter>["vendors"]["list"][number];

const STATUS_PILL_CLS: Record<BidStatus, string> = {
  received: "bg-sky-50 text-sky-800 ring-sky-200",
  comparing: "bg-amber-50 text-amber-800 ring-amber-200",
  accepted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  expired: "bg-paper-100 text-slate-500 ring-paper-200",
};

const KNOWN_FLAGS: Array<{ slug: string; label: string }> = Object.entries(
  BID_FLAG_LABELS,
).map(([slug, label]) => ({ slug, label }));

/**
 * Bids tab — inbound subcontractor quotes.
 *
 * Each row is one vendor PDF (or its data). v1 is read-write at the
 * header level (trade, dates, totals, flags) — the per-line item
 * breakdown lives on the Plan tab via `work_items.bid_id`. A later
 * PR will add an inline "Lines" expansion + an "Accept bid" verb
 * that auto-creates work_items from a bid's lines.
 */
export default function ProjectBids() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BidRow | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [packageModal, setPackageModal] = useState<
    | { mode: "closed" }
    | { mode: "create" }
    | { mode: "edit"; pkg: PackageRow }
  >({ mode: "closed" });
  const [statusFilter, setStatusFilter] = useState<BidStatus | "open" | "all">(
    "open",
  );
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const list = trpc.bids.list.useQuery({
    projectId: project.id,
    status:
      statusFilter === "open" || statusFilter === "all"
        ? undefined
        : statusFilter,
    vendorId: vendorFilter || undefined,
  });
  const packages = trpc.bidPackages.list.useQuery({ projectId: project.id });
  const vendors = trpc.vendors.list.useQuery({});

  // Detail page links here with ?edit=<bidId> to open the edit form.
  const editParam = searchParams.get("edit");
  useEffect(() => {
    if (!editParam || !list.data) return;
    const found = list.data.find((b) => b.id === editParam);
    if (found) setEditing(found);
    // Drop the param so reload doesn't reopen.
    searchParams.delete("edit");
    setSearchParams(searchParams, { replace: true });
  }, [editParam, list.data, searchParams, setSearchParams]);

  // Derive the vendor set actually used by bids on this project — that's
  // a more useful filter than every vendor in the org.
  const projectVendors = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const b of list.data ?? []) {
      if (b.vendor && !seen.has(b.vendor.id)) {
        seen.set(b.vendor.id, { id: b.vendor.id, name: b.vendor.name });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [list.data]);

  const filtered = useMemo(() => {
    let rows = list.data ?? [];
    if (statusFilter === "open") {
      rows = rows.filter(
        (b) => b.status === "received" || b.status === "comparing",
      );
    }
    const s = search.trim().toLowerCase();
    if (s) {
      rows = rows.filter((b) => {
        const blob = [b.bidNumber, b.vendor?.name, b.trade, b.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(s);
      });
    }
    return rows;
  }, [list.data, statusFilter, search]);

  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of filtered) {
      if (b.totalAmount && b.currency) {
        m.set(b.currency, (m.get(b.currency) ?? 0) + parseFloat(b.totalAmount));
      }
    }
    return m;
  }, [filtered]);

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            Bids
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Subcontractor quotes.
          </p>
        </div>
        {!creating && !editing && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPackageModal({ mode: "create" })}
            >
              <Icon name="plus" className="h-4 w-4" />
              New package
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" className="h-4 w-4" />
              New bid
            </Button>
          </div>
        )}
      </div>

      {!creating && !editing && packages.data && packages.data.length > 0 && (
        <PackagesStrip
          packages={packages.data}
          bids={list.data ?? []}
          onEdit={(pkg) => setPackageModal({ mode: "edit", pkg })}
        />
      )}

      {!creating && !editing && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="w-56">
            <UISelect
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as BidStatus | "open" | "all",
                )
              }
            >
              <option value="open">Open (received + comparing)</option>
              <option value="all">All statuses</option>
              {(Object.keys(BID_STATUS_LABELS) as BidStatus[]).map((s) => (
                <option key={s} value={s}>
                  {BID_STATUS_LABELS[s]}
                </option>
              ))}
            </UISelect>
          </div>
          <div className="w-56">
            <UISelect
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
            >
              <option value="">All vendors</option>
              {projectVendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </UISelect>
          </div>
          <div className="relative min-w-[240px] flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bid #, vendor, trade, notes"
              className="pl-10"
            />
          </div>
        </div>
      )}

      {creating && (
        <BidForm
          projectId={project.id}
          mode="create"
          vendors={vendors.data ?? []}
          defaultCurrency={project.contractCurrency ?? "MXN"}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <BidForm
          projectId={project.id}
          mode="edit"
          existing={editing}
          vendors={vendors.data ?? []}
          defaultCurrency={project.contractCurrency ?? "MXN"}
          onClose={() => setEditing(null)}
        />
      )}

      {!creating && !editing && (
      <div className="mt-4 overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
        {list.isLoading ? (
          <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
        ) : list.error ? (
          <p className="px-6 py-8 text-sm text-rose-700">{list.error.message}</p>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-display text-xl text-ink-900">
              {search.trim() || vendorFilter
                ? "No bids match these filters."
                : statusFilter === "open"
                  ? "No open bids."
                  : "No bids yet."}
            </p>
            {!search.trim() && !vendorFilter && statusFilter === "open" && (
              <p className="mt-2 text-[13px] text-ink-500">
                Click <strong>New bid</strong> when a vendor sends a quote.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="border-b border-ink-100 bg-paper-50">
              <tr className="text-left">
                <Th align="right" />
                <Th>Vendor</Th>
                <Th>Trade</Th>
                <Th>Package</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
                <Th>Bid date</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <BidTableRow
                  key={b.id}
                  bid={b}
                  projectId={project.id}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {!creating && !editing && filtered.length > 0 && totalsByCurrency.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[10px] uppercase tracking-wider text-slate-500">
          <span>filtered total ·</span>
          {Array.from(totalsByCurrency.entries()).map(([cur, amt]) => (
            <BidSubtotal key={cur} amount={amt.toFixed(2)} currency={cur} />
          ))}
        </div>
      )}

      {packageModal.mode !== "closed" && (
        <PackageFormModal
          projectId={project.id}
          mode={packageModal.mode}
          existing={
            packageModal.mode === "edit" ? packageModal.pkg : undefined
          }
          onClose={() => setPackageModal({ mode: "closed" })}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────── Packages strip ─────────

function PackagesStrip({
  packages,
  bids,
  onEdit,
}: {
  packages: PackageRow[];
  bids: BidRow[];
  onEdit: (pkg: PackageRow) => void;
}) {
  const fmt = useFormatters();
  // Derive per-package bid count + totals from the bids list we already
  // have. Avoids a correlated subquery on the server.
  const aggByPkg = useMemo(() => {
    const map = new Map<
      string,
      { count: number; totals: Map<string, number> }
    >();
    for (const b of bids) {
      if (!b.packageId) continue;
      const agg = map.get(b.packageId) ?? {
        count: 0,
        totals: new Map<string, number>(),
      };
      agg.count += 1;
      if (b.totalAmount && b.currency) {
        agg.totals.set(
          b.currency,
          (agg.totals.get(b.currency) ?? 0) + parseFloat(b.totalAmount),
        );
      }
      map.set(b.packageId, agg);
    }
    return map;
  }, [bids]);

  return (
    <section className="mt-6">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        Packages
      </h3>
      <ul className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => {
          const agg = aggByPkg.get(p.id);
          const count = agg?.count ?? 0;
          const totalsStr = agg
            ? Array.from(agg.totals.entries())
                .map(([c, a]) => fmt.currency(a.toFixed(2), c))
                .join(" · ")
            : null;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onEdit(p)}
                className="block w-full rounded-xl border border-ink-200/70 bg-white px-4 py-3 text-left transition-colors hover:border-ink-300 hover:bg-paper-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[14px] font-medium text-ink-900">
                    {p.name}
                  </p>
                  <Pill tone={PACKAGE_TONE[p.status]} dot>
                    {BID_PACKAGE_STATUS_LABELS[p.status]}
                  </Pill>
                </div>
                {p.scope && (
                  <p className="mt-1 line-clamp-2 text-[13px] text-ink-500">
                    {p.scope}
                  </p>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-2 text-[12px] text-ink-500">
                  <span>
                    {count} {count === 1 ? "bid" : "bids"}
                  </span>
                  {totalsStr && (
                    <span className="tnum text-ink-700">{totalsStr}</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ───────────────────────────────────── Package modal ───────────

function PackageFormModal({
  projectId,
  mode,
  existing,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: PackageRow;
  onClose: () => void;
}) {
  const isEdit = mode === "edit";
  const [name, setName] = useState(existing?.name ?? "");
  const [scope, setScope] = useState(existing?.scope ?? "");
  const [status, setStatus] = useState<BidPackageStatus>(
    existing?.status ?? "open",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.bidPackages.create.useMutation({
    onSuccess: () => {
      utils.bidPackages.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.bidPackages.update.useMutation({
    onSuccess: () => {
      utils.bidPackages.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const remove = trpc.bidPackages.remove.useMutation({
    onSuccess: () => {
      utils.bidPackages.list.invalidate({ projectId });
      utils.bids.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isEdit && existing) {
      update.mutate({
        id: existing.id,
        patch: {
          name: name.trim(),
          scope: scope.trim() || null,
          status,
          notes: notes.trim() || null,
        },
      });
    } else {
      create.mutate({
        projectId,
        name: name.trim(),
        scope: scope.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    }
  }

  return (
    <Modal
      title={isEdit && existing ? `Edit ${existing.name}` : "New bid package"}
      subtitle={
        isEdit
          ? undefined
          : "Group competing bids for one piece of work. You can add bids to it from the bid form."
      }
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-rose-600">{error}</p>
          <div className="flex gap-2">
            {isEdit && existing && (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (
                    confirm(
                      `Delete package "${existing.name}"? Bids in it become loose (not deleted).`,
                    )
                  ) {
                    remove.mutate({ id: existing.id });
                  }
                }}
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="bid-package-form"
              variant="primary"
              disabled={submitting}
            >
              {submitting
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create package"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="bid-package-form"
        onSubmit={onSubmit}
        className="grid gap-5"
      >
        <UIField label="Name" required>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder='Paint — primary bedroom + bath'
          />
        </UIField>
        <UIField label="Scope" hint="Optional">
          <Textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={2}
            placeholder="What this package is for — rooms, deliverables, exclusions."
          />
        </UIField>
        {isEdit && (
          <UIField label="Status">
            <UISelect
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as BidPackageStatus)
              }
            >
              {(
                Object.keys(BID_PACKAGE_STATUS_LABELS) as BidPackageStatus[]
              ).map((s) => (
                <option key={s} value={s}>
                  {BID_PACKAGE_STATUS_LABELS[s]}
                </option>
              ))}
            </UISelect>
          </UIField>
        )}
        <UIField label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </UIField>
      </form>
    </Modal>
  );
}

// ───────────────────────────────────── Table row ───────────────

function BidTableRow({
  bid,
  projectId,
}: {
  bid: BidRow;
  projectId: string;
}) {
  const fmt = useFormatters();
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();
  const award = trpc.bids.award.useMutation({
    onSuccess: () => {
      utils.bids.list.invalidate({ projectId: bid.projectId });
      utils.bidPackages.list.invalidate({ projectId: bid.projectId });
      utils.projects.overviewStats.invalidate({ projectId: bid.projectId });
      utils.projects.phaseAndCompleteness.invalidate({
        projectId: bid.projectId,
      });
    },
  });
  // Only fetch line items when the user expands the row — saves a roundtrip
  // per collapsed row. Cached afterward via tRPC.
  const lines = trpc.workItems.list.useQuery(
    { projectId, bidId: bid.id },
    { enabled: expanded },
  );

  const today = new Date().toISOString().slice(0, 10);
  const validityExpired = bid.validUntil && bid.validUntil < today;
  const inPkg = bid.package;
  const canAward =
    inPkg && inPkg.status === "open" && bid.status !== "accepted";

  return (
    <>
      <tr
        className={`group border-b border-ink-100 transition-colors hover:bg-paper-50 ${expanded ? "bg-paper-50" : ""}`}
      >
        <Td align="right" className="!py-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <Icon
              name="chevron-down"
              className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
          </button>
        </Td>
        <Td>
          <Link
            to={`/projects/${projectId}/bids/${bid.id}`}
            className="block text-left"
          >
            <span className="font-medium text-ink-900 hover:text-ink-900">
              {bid.vendor?.name ?? "(vendor unassigned)"}
            </span>
            {bid.bidNumber && (
              <span className="block font-mono text-[11px] text-ink-500">
                #{bid.bidNumber}
              </span>
            )}
          </Link>
        </Td>
        <Td className="text-ink-600">{bid.trade ?? "—"}</Td>
        <Td>
          {inPkg ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200"
              title={inPkg.scope ?? undefined}
            >
              ◆ {inPkg.name}
            </span>
          ) : (
            <span className="text-ink-400">—</span>
          )}
        </Td>
        <Td>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={STATUS_TONE[bid.status]} dot>
              {BID_STATUS_LABELS[bid.status]}
            </Pill>
            {validityExpired && bid.status !== "accepted" && (
              <Pill tone="alert">Expired</Pill>
            )}
          </div>
        </Td>
        <Td align="right" className="tnum text-ink-900 font-medium">
          {bid.totalAmount && bid.currency
            ? fmt.currency(bid.totalAmount, bid.currency)
            : "—"}
        </Td>
        <Td className="tnum text-ink-600">
          {bid.bidDate ? fmt.date(bid.bidDate) : "—"}
        </Td>
        <Td align="right">
          <div className="flex items-center justify-end gap-2">
            {canAward && (
              <button
                type="button"
                onClick={() => {
                  const siblingMsg = inPkg
                    ? ` Other bids in "${inPkg.name}" will be marked rejected.`
                    : "";
                  if (
                    confirm(
                      `Award this bid to ${bid.vendor?.name ?? "this vendor"}?${siblingMsg}`,
                    )
                  ) {
                    award.mutate({ id: bid.id });
                  }
                }}
                disabled={award.isPending}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {award.isPending ? "Awarding…" : "Award"}
              </button>
            )}
            <Link
              to={`/projects/${projectId}/bids/${bid.id}`}
              className="text-[12px] text-ink-500 hover:text-ink-900"
            >
              Open →
            </Link>
          </div>
        </Td>
      </tr>
      {expanded && (
        <tr className="border-b border-ink-100 bg-paper-50/60">
          <td colSpan={8} className="px-5 pb-4 pt-1">
            <BidLineItems
              projectId={projectId}
              bidId={bid.id}
              lines={lines.data ?? []}
              loading={lines.isLoading}
              error={lines.error?.message}
              currencyDefault={bid.currency ?? null}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function BidLineItems({
  projectId,
  bidId,
  lines,
  loading,
  error,
  currencyDefault,
}: {
  projectId: string;
  bidId: string;
  lines: inferRouterOutputs<AppRouter>["workItems"]["list"];
  loading: boolean;
  error: string | undefined;
  currencyDefault: string | null;
}) {
  const fmt = useFormatters();
  if (loading) {
    return <p className="px-2 py-3 text-xs text-ink-500">Loading lines…</p>;
  }
  if (error) {
    return <p className="px-2 py-3 text-xs text-rose-700">{error}</p>;
  }
  if (lines.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-ink-500">
        No itemized lines on this bid.{" "}
        <Link
          to={`/projects/${projectId}/bids/${bidId}`}
          className="text-ink-700 underline-offset-2 hover:underline"
        >
          Open bid →
        </Link>
      </p>
    );
  }
  const total = lines.reduce((acc, li) => {
    if (li.totalAmount && li.totalCurrency) {
      const c = li.totalCurrency;
      acc.set(c, (acc.get(c) ?? 0) + parseFloat(li.totalAmount));
    }
    return acc;
  }, new Map<string, number>());

  return (
    <div className="overflow-hidden rounded-lg border border-ink-200/70 bg-white">
      <table className="w-full text-[13px]">
        <thead className="border-b border-ink-100 bg-paper-50">
          <tr className="text-left">
            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Ref
            </th>
            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Description
            </th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Qty
            </th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Unit
            </th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((li) => (
            <tr
              key={li.id}
              className="border-b border-ink-100 last:border-b-0"
            >
              <td className="px-4 py-2 font-mono text-[11px] text-ink-500">
                {li.ref ?? "—"}
              </td>
              <td className="px-4 py-2 text-ink-800">{li.description}</td>
              <td className="px-4 py-2 text-right text-ink-600 tnum">
                {li.qty
                  ? `${trimZero(li.qty)}${li.unit ? ` ${li.unit}` : ""}`
                  : "—"}
              </td>
              <td className="px-4 py-2 text-right text-ink-600 tnum">
                {li.unitPriceAmount && li.unitPriceCurrency
                  ? fmt.currency(li.unitPriceAmount, li.unitPriceCurrency)
                  : "—"}
              </td>
              <td className="px-4 py-2 text-right font-medium text-ink-900 tnum">
                {li.totalAmount && li.totalCurrency
                  ? fmt.currency(li.totalAmount, li.totalCurrency)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        {total.size > 0 && (
          <tfoot className="bg-paper-50">
            <tr>
              <td className="px-4 py-2" colSpan={4}>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                  Sum of lines
                </span>
              </td>
              <td className="px-4 py-2 text-right font-semibold text-ink-900 tnum">
                {Array.from(total.entries())
                  .map(([c, a]) =>
                    fmt.currency(a.toFixed(2), c ?? currencyDefault ?? "USD"),
                  )
                  .join(" · ")}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function trimZero(n: string): string {
  if (!n.includes(".")) return n;
  return n.replace(/\.?0+$/, "");
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-5 py-3 align-top ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}

function BidSubtotal({
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


// ───────────────────────────────────── form ──────────────────

function BidForm({
  projectId,
  mode,
  existing,
  vendors,
  defaultCurrency,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: BidRow;
  vendors: VendorRow[];
  defaultCurrency: string;
  onClose: () => void;
}) {
  const packagesQ = trpc.bidPackages.list.useQuery({ projectId });
  const [vendorId, setVendorId] = useState(existing?.vendorId ?? "");
  const [packageId, setPackageId] = useState(existing?.packageId ?? "");
  const [trade, setTrade] = useState(existing?.trade ?? "");
  const [bidNumber, setBidNumber] = useState(existing?.bidNumber ?? "");
  const [bidDate, setBidDate] = useState(existing?.bidDate ?? "");
  const [validUntil, setValidUntil] = useState(existing?.validUntil ?? "");
  const [subtotal, setSubtotal] = useState(existing?.subtotalAmount ?? "");
  const [iva, setIva] = useState(existing?.ivaAmount ?? "");
  const [total, setTotal] = useState(existing?.totalAmount ?? "");
  const [currency, setCurrency] = useState(
    existing?.currency ?? defaultCurrency,
  );
  const [ivaIncluded, setIvaIncluded] = useState(existing?.ivaIncluded ?? false);
  const [status, setStatus] = useState<BidStatus>(
    existing?.status ?? "received",
  );
  const [flags, setFlags] = useState<string[]>(existing?.flags ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.bids.create.useMutation({
    onSuccess: () => {
      utils.bids.list.invalidate({ projectId });
      utils.projects.overviewStats.invalidate({ projectId });
      utils.projects.phaseAndCompleteness.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.bids.update.useMutation({
    onSuccess: () => {
      utils.bids.list.invalidate({ projectId });
      utils.projects.overviewStats.invalidate({ projectId });
      utils.projects.phaseAndCompleteness.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  function toggleFlag(slug: string) {
    setFlags((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cur = currency.trim().toUpperCase();
    if (cur.length !== 3 && (subtotal || iva || total)) {
      setError("Currency must be a 3-letter code when money is set.");
      return;
    }
    const base = {
      vendorId: vendorId || undefined,
      packageId: packageId || undefined,
      trade: trade.trim() || undefined,
      bidNumber: bidNumber.trim() || undefined,
      bidDate: bidDate || undefined,
      validUntil: validUntil || undefined,
      subtotalAmount: subtotal.trim() || undefined,
      ivaAmount: iva.trim() || undefined,
      totalAmount: total.trim() || undefined,
      currency: subtotal.trim() || iva.trim() || total.trim() ? cur : undefined,
      ivaIncluded,
      status,
      flags,
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
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {mode === "edit" ? "Edit · bid" : "New · bid"}
      </p>

      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Field label="Vendor *">
          <select
            required
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className={selectCls}
          >
            <option value="">— pick a vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Trade">
          <input
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className={inputCls}
            placeholder="carpintería / electricidad / tile"
          />
        </Field>
        <Field label="Bid number">
          <input
            value={bidNumber}
            onChange={(e) => setBidNumber(e.target.value)}
            className={inputCls}
            placeholder="C-3636 / COTIZACION 10321-1"
          />
        </Field>

        <Field label="Package" wide>
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className={selectCls}
          >
            <option value="">— None (loose bid)</option>
            {packagesQ.data?.map((p) => (
              <option key={p.id} value={p.id} disabled={p.status !== "open"}>
                {p.name}
                {p.status !== "open" ? ` (${p.status})` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BidStatus)}
            className={selectCls}
          >
            {(Object.keys(BID_STATUS_LABELS) as BidStatus[]).map((s) => (
              <option key={s} value={s}>
                {BID_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bid date">
          <input
            type="date"
            value={bidDate}
            onChange={(e) => setBidDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Valid until">
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Subtotal">
          <input
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            className={inputCls}
            inputMode="decimal"
          />
        </Field>
        <Field label="IVA">
          <input
            value={iva}
            onChange={(e) => setIva(e.target.value)}
            className={inputCls}
            inputMode="decimal"
          />
        </Field>
        <Field label="Total + currency">
          <div className="flex gap-2">
            <input
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={`${inputCls} !w-auto flex-1`}
              inputMode="decimal"
            />
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${inputCls} !w-24 uppercase text-center tracking-wider`}
              maxLength={3}
            />
          </div>
        </Field>

        <Field label="IVA treatment" wide>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={ivaIncluded}
              onChange={(e) => setIvaIncluded(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Total already includes IVA
          </label>
        </Field>
        <Field label="Notes" wide>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
            placeholder="Validity caveats, exclusions, deposit terms…"
          />
        </Field>
      </div>

      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          Flags
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {KNOWN_FLAGS.map(({ slug, label }) => {
            const on = flags.includes(slug);
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggleFlag(slug)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wide ring-1 ring-inset transition-colors ${
                  on
                    ? "bg-amber-100 text-amber-900 ring-amber-300"
                    : "bg-paper-50 text-slate-500 ring-paper-200 hover:bg-paper-100"
                }`}
              >
                {on ? "✓ " : ""}
                {label}
              </button>
            );
          })}
        </div>
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
  "block w-full rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

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
    <label className={`block text-sm ${wide ? "sm:col-span-3" : ""}`}>
      <span className="text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
