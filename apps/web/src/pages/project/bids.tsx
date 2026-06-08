import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  BID_FLAG_LABELS,
  BID_STATUS_LABELS,
  isBillOverdue,
  type BidStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT, type MessageKey } from "../../lib/i18n";
import { Button, Icon, Pill } from "../../components/ui";

const STATUS_TONE: Record<
  BidStatus,
  "info" | "warn" | "success" | "alert" | "muted"
> = {
  received: "info",
  comparing: "warn",
  accepted: "info",
  completed: "success",
  rejected: "alert",
  expired: "muted",
};

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type BidRow = inferRouterOutputs<AppRouter>["bids"]["list"][number];
type VendorRow = inferRouterOutputs<AppRouter>["vendors"]["list"][number];

const KNOWN_FLAG_SLUGS: string[] = Object.keys(BID_FLAG_LABELS);

/** The bill auto-created on approval, joined onto each quote row. */
type BidBill = NonNullable<BidRow["bill"]>;

/** Returns a message key; resolve with `t()` at the render site. */
function paymentLabelKey(bill: BidBill): MessageKey {
  if (bill.status === "paid") return "bids.payment.paid";
  if (bill.status === "void") return "bids.payment.void";
  return isBillOverdue(bill.status, bill.dueAt)
    ? "bids.payment.overdue"
    : "bids.payment.unpaid";
}

function paymentTone(
  bill: BidBill,
): "success" | "muted" | "alert" | "warn" {
  if (bill.status === "paid") return "success";
  if (bill.status === "void") return "muted";
  return isBillOverdue(bill.status, bill.dueAt) ? "alert" : "warn";
}

/**
 * Bids tab — inbound subcontractor quotes.
 *
 * Each row is one vendor PDF (or its data). Quotes are grouped into
 * status sections (Open / Ongoing / Completed / Rejected & expired) so
 * the whole picture is visible at a glance — nothing hidden behind a
 * default filter. Header-level fields (trade, dates, totals, flags) are
 * read-write here; the per-line breakdown lives on the Plan tab via
 * `work_items.bid_id` and expands inline per row. Approving a quote —
 * inline or from the detail page — promotes its line items into the
 * Plan and drops a matching "money owed" bill into the Money tab; the
 * Payment column tracks that bill's status.
 */
const SECTIONS: { key: string; labelKey: MessageKey; statuses: BidStatus[] }[] = [
  {
    key: "open",
    labelKey: "bids.section.open",
    statuses: ["received", "comparing"],
  },
  { key: "ongoing", labelKey: "bids.section.ongoing", statuses: ["accepted"] },
  {
    key: "completed",
    labelKey: "bids.section.completed",
    statuses: ["completed"],
  },
  {
    key: "closed",
    labelKey: "bids.section.closed",
    statuses: ["rejected", "expired"],
  },
];

export default function ProjectBids() {
  const t = useT();
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BidRow | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tradeFilter, setTradeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  // All quotes for the project — grouped into status sections below so
  // nothing's hidden by default (Open / Accepted / Rejected & expired).
  const list = trpc.bids.list.useQuery({ projectId: project.id });
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

  // Distinct trades actually used by bids on this project — powers the
  // Type-of-work column filter.
  const projectTrades = useMemo(() => {
    const set = new Set<string>();
    for (const b of list.data ?? []) if (b.trade) set.add(b.trade);
    return Array.from(set).sort();
  }, [list.data]);

  const filtered = useMemo(() => {
    let rows = list.data ?? [];
    if (tradeFilter) rows = rows.filter((b) => b.trade === tradeFilter);
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
  }, [list.data, tradeFilter, search]);

  const sections = useMemo(
    () =>
      SECTIONS.map((sec) => ({
        ...sec,
        rows: filtered.filter((b) => sec.statuses.includes(b.status)),
      })),
    [filtered],
  );

  const hasActiveFilters = !!search.trim() || !!tradeFilter;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            {t("bids.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {t("bids.lede")}
          </p>
        </div>
        {!creating && !editing && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" className="h-4 w-4" />
            {t("bids.new")}
          </Button>
        )}
      </div>

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
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("bids.search")}
              className="h-10 min-w-[220px] flex-1 rounded-md border border-ink-200 bg-white px-3.5 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
            />
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="h-10 rounded-md border border-ink-200 bg-white px-3 text-[14px] text-ink-700 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
            >
              <option value="">{t("bids.all_trades")}</option>
              {projectTrades.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {list.isLoading ? (
            <p className="mt-6 text-sm text-ink-500">{t("common.loading")}</p>
          ) : list.error ? (
            <p className="mt-6 text-sm text-rose-700">{list.error.message}</p>
          ) : filtered.length === 0 ? (
            <div className="mt-6 overflow-hidden rounded-xl border border-ink-200/70 bg-white px-6 py-12 text-center shadow-soft">
              <p className="font-display text-xl text-ink-900">
                {hasActiveFilters
                  ? t("bids.empty_filtered")
                  : t("bids.empty")}
              </p>
              {!hasActiveFilters && (
                <p className="mt-2 text-[13px] text-ink-500">
                  {t("bids.empty_hint_prefix")}{" "}
                  <strong>{t("bids.new")}</strong>{" "}
                  {t("bids.empty_hint_suffix")}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-8">
              {sections.map((sec) =>
                sec.rows.length > 0 ? (
                  <BidSection
                    key={sec.key}
                    label={t(sec.labelKey)}
                    bids={sec.rows}
                    projectId={project.id}
                  />
                ) : null,
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────── section ─────────────────

function BidSection({
  label,
  bids,
  projectId,
}: {
  label: string;
  bids: BidRow[];
  projectId: string;
}) {
  const t = useT();
  const subtotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bids) {
      if (b.totalAmount && b.currency) {
        m.set(b.currency, (m.get(b.currency) ?? 0) + parseFloat(b.totalAmount));
      }
    }
    return m;
  }, [bids]);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          {label}
          <span className="ml-2 text-ink-400">{bids.length}</span>
        </h3>
        {subtotals.size > 0 && (
          <span className="flex flex-wrap items-center gap-x-3 text-[11px]">
            {Array.from(subtotals.entries()).map(([cur, amt]) => (
              <BidSubtotal key={cur} amount={amt.toFixed(2)} currency={cur} />
            ))}
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
        <table className="w-full text-[14px]">
          <thead className="border-b border-ink-100 bg-paper-50">
            <tr className="text-left">
              <Th align="right" />
              <Th>{t("col.vendor")}</Th>
              <Th>{t("bids.col.trade")}</Th>
              <Th>{t("col.status")}</Th>
              <Th align="right">{t("bids.col.total")}</Th>
              <Th>{t("bids.col.payment")}</Th>
              <Th>{t("bids.col.bid_date")}</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {bids.map((b) => (
              <BidTableRow key={b.id} bid={b} projectId={projectId} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
  const L = useLabels();
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  // Only fetch line items when the user expands the row — saves a roundtrip
  // per collapsed row. Cached afterward via tRPC.
  const lines = trpc.workItems.list.useQuery(
    { projectId, bidId: bid.id },
    { enabled: expanded },
  );

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.bids.list.invalidate({ projectId });
    // Approving promotes the quote's line items into the Plan and books
    // a payable in Money; both it and completing move the overview.
    utils.workItems.list.invalidate({ projectId });
    utils.bills.list.invalidate({ projectId });
    utils.projects.overviewStats.invalidate({ projectId });
    utils.projects.phaseAndCompleteness.invalidate({ projectId });
  };
  const decide = trpc.bids.decide.useMutation({ onSuccess: invalidate });
  const complete = trpc.bids.update.useMutation({ onSuccess: invalidate });

  const today = new Date().toISOString().slice(0, 10);
  const validityExpired = bid.validUntil && bid.validUntil < today;
  const canApprove = bid.status === "received" || bid.status === "comparing";
  const canComplete = bid.status === "accepted";

  return (
    <>
      <tr
        className={`group border-b border-ink-100 transition-colors hover:bg-paper-50 ${expanded ? "bg-paper-50" : ""}`}
      >
        <Td align="right" className="!py-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? t("bids.collapse") : t("bids.expand")}
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
              {bid.vendor?.name ?? t("bids.vendor_unassigned")}
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
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={STATUS_TONE[bid.status]} dot>
              {L.bidStatus(bid.status)}
            </Pill>
            {validityExpired &&
              bid.status !== "accepted" &&
              bid.status !== "completed" && (
                <Pill tone="alert">{t("bids.expired")}</Pill>
              )}
          </div>
        </Td>
        <Td align="right" className="tnum text-ink-900 font-medium">
          {bid.totalAmount && bid.currency
            ? fmt.currency(bid.totalAmount, bid.currency)
            : "—"}
        </Td>
        <Td>
          {bid.bill ? (
            <Link
              to={`/projects/${projectId}/bills/${bid.bill.id}`}
              className="transition-opacity hover:opacity-80"
              title={t("bids.open_linked_bill")}
            >
              <Pill tone={paymentTone(bid.bill)} dot>
                {t(paymentLabelKey(bid.bill))}
              </Pill>
            </Link>
          ) : (
            <span className="text-ink-400">—</span>
          )}
        </Td>
        <Td className="tnum text-ink-600">
          {bid.bidDate ? fmt.date(bid.bidDate) : "—"}
        </Td>
        <Td align="right">
          <div className="flex items-center justify-end gap-2">
            {canApprove && (
              <button
                type="button"
                onClick={() =>
                  decide.mutate({ id: bid.id, decision: "accepted" })
                }
                disabled={decide.isPending}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {decide.isPending ? t("bids.approving") : t("bids.approve")}
              </button>
            )}
            {canComplete && (
              <button
                type="button"
                onClick={() =>
                  complete.mutate({ id: bid.id, patch: { status: "completed" } })
                }
                disabled={complete.isPending}
                className="rounded-md border border-ink-300 bg-white px-2.5 py-1 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
              >
                {complete.isPending ? t("bids.completing") : t("bids.complete")}
              </button>
            )}
            <Link
              to={`/projects/${projectId}/bids/${bid.id}`}
              className="text-[12px] text-ink-500 hover:text-ink-900"
            >
              {t("bids.open")}
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
  const t = useT();
  if (loading) {
    return (
      <p className="px-2 py-3 text-xs text-ink-500">{t("bids.loading_lines")}</p>
    );
  }
  if (error) {
    return <p className="px-2 py-3 text-xs text-rose-700">{error}</p>;
  }
  if (lines.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-ink-500">
        {t("bids.no_itemized_lines")}{" "}
        <Link
          to={`/projects/${projectId}/bids/${bidId}`}
          className="text-ink-700 underline-offset-2 hover:underline"
        >
          {t("bids.open_bid")}
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
              {t("bids.col.ref")}
            </th>
            <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {t("col.description")}
            </th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {t("bids.col.qty")}
            </th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {t("bids.col.unit")}
            </th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {t("bids.col.total")}
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
                  {t("bids.sum_of_lines")}
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
  const L = useLabels();
  const t = useT();
  const [vendorId, setVendorId] = useState(existing?.vendorId ?? "");
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
      setError(t("bids.err_currency_money"));
      return;
    }
    const base = {
      vendorId: vendorId || undefined,
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
        {mode === "edit" ? t("bids.form.edit") : t("bids.form.new")}
      </p>

      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Field label={t("bids.field.vendor_req")}>
          <select
            required
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className={selectCls}
          >
            <option value="">{t("bids.field.pick_vendor")}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("bids.field.trade")}>
          <input
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className={inputCls}
            placeholder={t("bids.field.trade_ph")}
          />
        </Field>
        <Field label={t("bids.field.bid_number")}>
          <input
            value={bidNumber}
            onChange={(e) => setBidNumber(e.target.value)}
            className={inputCls}
            placeholder={t("bids.field.bid_number_ph")}
          />
        </Field>

        <Field label={t("col.status")}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BidStatus)}
            className={selectCls}
          >
            {(Object.keys(BID_STATUS_LABELS) as BidStatus[]).map((s) => (
              <option key={s} value={s}>
                {L.bidStatus(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("bids.col.bid_date")}>
          <input
            type="date"
            value={bidDate}
            onChange={(e) => setBidDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={t("bids.field.valid_until")}>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label={t("bids.field.subtotal")}>
          <input
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
            className={inputCls}
            inputMode="decimal"
          />
        </Field>
        <Field label={t("bids.field.iva")}>
          <input
            value={iva}
            onChange={(e) => setIva(e.target.value)}
            className={inputCls}
            inputMode="decimal"
          />
        </Field>
        <Field label={t("bids.field.total_currency")}>
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

        <Field label={t("bids.field.iva_treatment")} wide>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={ivaIncluded}
              onChange={(e) => setIvaIncluded(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            {t("bids.field.iva_included")}
          </label>
        </Field>
        <Field label={t("bids.field.notes")} wide>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
            placeholder={t("bids.field.notes_ph")}
          />
        </Field>
      </div>

      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          {t("bids.flags")}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {KNOWN_FLAG_SLUGS.map((slug) => {
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
                {L.bidFlag(slug)}
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
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting
            ? t("common.saving")
            : mode === "edit"
              ? t("common.save")
              : t("common.add")}
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
