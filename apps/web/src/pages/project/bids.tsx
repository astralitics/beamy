import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  BID_FLAG_LABELS,
  BID_STATUS_LABELS,
  type BidStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

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
  const [statusFilter, setStatusFilter] = useState<BidStatus | "open" | "all">(
    "open",
  );
  const list = trpc.bids.list.useQuery({
    projectId: project.id,
    status:
      statusFilter === "open" || statusFilter === "all"
        ? undefined
        : statusFilter,
  });
  const vendors = trpc.vendors.list.useQuery({});

  const filtered = useMemo(() => {
    if (statusFilter !== "open") return list.data ?? [];
    return (list.data ?? []).filter(
      (b) => b.status === "received" || b.status === "comparing",
    );
  }, [list.data, statusFilter]);

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
          <h2 className="text-lg font-semibold tracking-tight text-blueprint-900">
            Bids
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Inbound subcontractor quotes — one row per vendor's PDF. Flag
            credentials, validity, IVA treatment. Accepted bids feed work
            items on the Plan tab.
          </p>
        </div>
        {!creating && !editing && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            New bid
          </button>
        )}
      </div>

      {!creating && !editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as BidStatus | "open" | "all",
              )
            }
            className={selectCls}
          >
            <option value="open">Open (received + comparing)</option>
            <option value="all">All statuses</option>
            {(Object.keys(BID_STATUS_LABELS) as BidStatus[]).map((s) => (
              <option key={s} value={s}>
                {BID_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
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

      <div className="mt-4 grid gap-2">
        {list.isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : list.error ? (
          <p className="text-xs text-rose-700">{list.error.message}</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            {statusFilter === "open" ? (
              <>
                No open bids. Click <strong>New bid</strong> when a vendor
                sends a quote.
              </>
            ) : (
              "No bids match this filter."
            )}
          </p>
        ) : (
          filtered.map((b) => (
            <BidRowItem key={b.id} bid={b} onEdit={() => setEditing(b)} />
          ))
        )}
      </div>

      {filtered.length > 0 && totalsByCurrency.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          <span>filtered total ·</span>
          {Array.from(totalsByCurrency.entries()).map(([cur, amt]) => (
            <BidSubtotal key={cur} amount={amt.toFixed(2)} currency={cur} />
          ))}
        </div>
      )}
    </div>
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

function BidRowItem({ bid, onEdit }: { bid: BidRow; onEdit: () => void }) {
  const fmt = useFormatters();
  const utils = trpc.useUtils();
  const remove = trpc.bids.remove.useMutation({
    onSuccess: () => {
      utils.bids.list.invalidate({ projectId: bid.projectId });
      utils.projects.overviewStats.invalidate({ projectId: bid.projectId });
      utils.projects.phaseAndCompleteness.invalidate({
        projectId: bid.projectId,
      });
    },
  });
  const validityExpired =
    bid.validUntil && bid.validUntil < new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-md border border-paper-200 bg-white p-3">
      <div className="flex items-baseline gap-3">
        {bid.bidNumber && (
          <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            {bid.bidNumber}
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[bid.status]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {BID_STATUS_LABELS[bid.status]}
        </span>
        <span className="text-sm font-medium text-blueprint-900">
          {bid.vendor?.name ?? "(vendor unassigned)"}
        </span>
        {bid.trade && (
          <span className="rounded-full bg-paper-100 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
            {bid.trade}
          </span>
        )}
        <span className="ml-auto font-mono text-sm font-semibold text-blueprint-900">
          {bid.totalAmount && bid.currency
            ? fmt.currency(bid.totalAmount, bid.currency)
            : "—"}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
        {bid.bidDate && <span>bid date · {fmt.date(bid.bidDate)}</span>}
        {bid.validUntil && (
          <span className={validityExpired ? "text-rose-700" : ""}>
            valid until · {fmt.date(bid.validUntil)}
            {validityExpired && " (expired)"}
          </span>
        )}
        <span>{bid.ivaIncluded ? "iva included" : "pre-IVA"}</span>
        {bid.flags.length > 0 && (
          <span>
            flags ·{" "}
            {bid.flags.map((f) => BID_FLAG_LABELS[f] ?? f).join(" · ")}
          </span>
        )}
      </div>
      {bid.notes && (
        <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">
          {bid.notes}
        </p>
      )}
      <div className="mt-2 flex items-center gap-3">
        <Link
          to={`/projects/${bid.projectId}/plan?phase=proposal&bid=${bid.id}`}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          View line items →
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto text-xs text-slate-500 hover:text-slate-900"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                `Permanently delete ${bid.bidNumber ?? "this bid"}? Child work items detach but stay.`,
              )
            ) {
              remove.mutate({ id: bid.id });
            }
          }}
          disabled={remove.isPending}
          className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
        >
          {remove.isPending ? "…" : "Delete"}
        </button>
      </div>
    </div>
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
      setError("Currency must be a 3-letter code when money is set.");
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
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-safety-700">
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
              className={`${inputCls} flex-1`}
              inputMode="decimal"
            />
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${inputCls} w-16 uppercase`}
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
        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
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
                className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ring-1 ring-inset transition-colors ${
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
  "block w-full rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

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
