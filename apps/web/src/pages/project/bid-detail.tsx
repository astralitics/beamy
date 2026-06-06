import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  BID_FLAG_LABELS,
  BID_STATUS_LABELS,
  type BidStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";
import { Button, Icon, Pill } from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type BidLine = inferRouterOutputs<AppRouter>["workItems"]["list"][number];

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

export default function ProjectBidDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { bidId } = useParams<{ bidId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();

  const bid = trpc.bids.get.useQuery(
    { id: bidId ?? "" },
    { enabled: !!bidId },
  );
  const lines = trpc.workItems.list.useQuery(
    { projectId: project.id, bidId: bidId ?? "" },
    { enabled: !!bidId },
  );

  const utils = trpc.useUtils();
  const invalidateBid = () => {
    utils.bids.get.invalidate({ id: bidId ?? "" });
    utils.bids.list.invalidate({ projectId: project.id });
  };
  const decide = trpc.bids.decide.useMutation({ onSuccess: invalidateBid });
  const saveAsVersion = trpc.bids.saveAsVersion.useMutation({
    onSuccess: (nb) => {
      utils.bids.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/bids/${nb.id}`);
    },
  });
  const remove = trpc.bids.remove.useMutation({
    onSuccess: () => {
      utils.bids.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/bids`);
    },
  });

  const [addingLine, setAddingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const linesTotal = useMemo(() => {
    if (!lines.data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const li of lines.data) {
      if (!li.totalAmount || !li.totalCurrency) continue;
      m.set(
        li.totalCurrency,
        (m.get(li.totalCurrency) ?? 0) + parseFloat(li.totalAmount),
      );
    }
    return m;
  }, [lines.data]);

  if (!bidId) return null;
  if (bid.isLoading) return <p className="text-sm text-ink-500">Loading…</p>;
  if (bid.error)
    return <p className="text-sm text-rose-700">{bid.error.message}</p>;
  if (!bid.data) return null;

  const b = bid.data;
  const today = new Date().toISOString().slice(0, 10);
  const validityExpired = b.validUntil && b.validUntil < today;
  const superseded = b.supersededBy;
  const readOnly = !!superseded;
  const lineRows = lines.data ?? [];
  const colCount = readOnly ? 5 : 6;

  return (
    <div className="animate-fade space-y-12">
      <header>
        <Link
          to={`/projects/${project.id}/bids`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          Bids
        </Link>

        {(b.version > 1 || b.supersedesBidId || superseded) && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
            <span className="rounded-full bg-ink-100 px-2 py-0.5 font-mono text-[11px] text-ink-600">
              v{b.version}
            </span>
            {b.supersedesBidId && (
              <Link
                to={`/projects/${project.id}/bids/${b.supersedesBidId}`}
                className="text-ink-500 hover:text-ink-900"
              >
                ← previous version
              </Link>
            )}
            {superseded && (
              <Link
                to={`/projects/${project.id}/bids/${superseded.id}`}
                className="text-ink-500 hover:text-ink-900"
              >
                superseded by v{superseded.version} →
              </Link>
            )}
          </div>
        )}

        {superseded && (
          <div className="mt-3 rounded-lg border border-ink-200 bg-paper-50 px-4 py-3 text-[13px] text-ink-600">
            This version is read-only — it was superseded by{" "}
            <Link
              to={`/projects/${project.id}/bids/${superseded.id}`}
              className="font-medium text-ink-900 underline-offset-2 hover:underline"
            >
              v{superseded.version}
            </Link>
            . Open the latest version to make changes.
          </div>
        )}

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={STATUS_TONE[b.status]} dot>
                {BID_STATUS_LABELS[b.status]}
              </Pill>
              {validityExpired && b.status !== "accepted" && (
                <Pill tone="alert">Validity expired</Pill>
              )}
            </div>
            <p className="mt-4 num text-5xl leading-none text-ink-900">
              {b.totalAmount && b.currency
                ? fmt.currency(b.totalAmount, b.currency)
                : "—"}
            </p>
            <h1 className="mt-3 font-display text-2xl font-normal tracking-tight text-ink-900">
              {b.vendor?.name ?? "(vendor unassigned)"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-500">
              {b.bidNumber && <span className="font-mono">#{b.bidNumber}</span>}
              {b.trade && <span>{b.trade}</span>}
              {b.ivaIncluded ? <span>IVA included</span> : <span>Pre-IVA</span>}
            </p>
          </div>
          {!readOnly && (
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {b.status !== "accepted" && (
                <Button
                  variant="primary"
                  onClick={() => decide.mutate({ id: b.id, decision: "accepted" })}
                  disabled={decide.isPending}
                >
                  Approve
                </Button>
              )}
              {b.status !== "rejected" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (confirm("Reject this quote?")) {
                      decide.mutate({ id: b.id, decision: "rejected" });
                    }
                  }}
                  disabled={decide.isPending}
                >
                  Reject
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  if (
                    confirm(
                      "Save the current quote as a new version? This version becomes read-only history and you'll edit the new one.",
                    )
                  ) {
                    saveAsVersion.mutate({ id: b.id });
                  }
                }}
                disabled={saveAsVersion.isPending}
              >
                {saveAsVersion.isPending ? "Saving…" : "Save as new version"}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(`/projects/${project.id}/bids?edit=${b.id}`)
                }
              >
                Edit details
              </Button>
            </div>
          )}
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Bid date">{b.bidDate ? fmt.date(b.bidDate) : "—"}</Fact>
        <Fact label="Valid until" tone={validityExpired ? "alert" : undefined}>
          {b.validUntil ? fmt.date(b.validUntil) : "—"}
        </Fact>
        <Fact label="Subtotal">
          {b.subtotalAmount && b.currency
            ? fmt.currency(b.subtotalAmount, b.currency)
            : "—"}
        </Fact>
        <Fact label="IVA">
          {b.ivaAmount && b.currency
            ? fmt.currency(b.ivaAmount, b.currency)
            : "—"}
        </Fact>
      </section>

      {b.flags.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Flags
          </h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {b.flags.map((f) => (
              <Pill key={f} tone="warn">
                {BID_FLAG_LABELS[f] ?? f}
              </Pill>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-normal tracking-tight text-ink-900">
            Itemized work
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-ink-400">
              {lineRows.length} {lineRows.length === 1 ? "line" : "lines"}
            </p>
            {!readOnly && !addingLine && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingLineId(null);
                  setAddingLine(true);
                }}
              >
                <Icon name="plus" className="h-4 w-4" />
                Add line
              </Button>
            )}
          </div>
        </div>

        {addingLine && (
          <div className="mt-3">
            <BidLineForm
              mode="create"
              projectId={project.id}
              bidId={b.id}
              defaultCurrency={b.currency ?? "MXN"}
              defaultTrade={b.trade ?? ""}
              onClose={() => setAddingLine(false)}
            />
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
          {lines.isLoading ? (
            <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
          ) : lines.error ? (
            <p className="px-6 py-8 text-sm text-rose-700">
              {lines.error.message}
            </p>
          ) : lineRows.length === 0 && !addingLine ? (
            <p className="px-6 py-8 text-sm text-ink-500">
              This bid has no itemized lines yet.
              {!readOnly && " Click Add line to start building the quote."}
            </p>
          ) : (
            <table className="w-full text-[14px]">
              <thead className="border-b border-ink-100 bg-paper-50">
                <tr className="text-left">
                  <Th>Ref</Th>
                  <Th>Description</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Unit price</Th>
                  <Th align="right">Total</Th>
                  {!readOnly && <Th align="right" />}
                </tr>
              </thead>
              <tbody>
                {lineRows.map((li) =>
                  editingLineId === li.id ? (
                    <tr key={li.id} className="border-b border-ink-100">
                      <td colSpan={colCount} className="bg-paper-50/60 p-3">
                        <BidLineForm
                          mode="edit"
                          existing={li}
                          projectId={project.id}
                          bidId={b.id}
                          defaultCurrency={b.currency ?? "MXN"}
                          defaultTrade={b.trade ?? ""}
                          onClose={() => setEditingLineId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <BidLineDisplayRow
                      key={li.id}
                      li={li}
                      projectId={project.id}
                      bidId={b.id}
                      readOnly={readOnly}
                      onEdit={() => {
                        setAddingLine(false);
                        setEditingLineId(li.id);
                      }}
                    />
                  ),
                )}
              </tbody>
              {linesTotal.size > 0 && (
                <tfoot className="bg-paper-50">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500"
                    >
                      Sum of lines
                    </td>
                    <td className="px-5 py-3 text-right tnum font-semibold text-ink-900">
                      {Array.from(linesTotal.entries())
                        .map(([c, a]) => fmt.currency(a.toFixed(2), c))
                        .join(" · ")}
                    </td>
                    {!readOnly && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </section>

      {b.notes && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Notes
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
            {b.notes}
          </p>
        </section>
      )}

      <section className="border-t border-ink-100 pt-8">
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                `Delete this bid? Its ${lineRows.length} work items detach but stay.`,
              )
            ) {
              remove.mutate({ id: b.id });
            }
          }}
          className="text-[13px] text-rose-600 hover:text-rose-800"
        >
          Delete this bid
        </button>
      </section>
    </div>
  );
}

// ───────────────────────────────────── line items ─────────────

function BidLineDisplayRow({
  li,
  projectId,
  bidId,
  readOnly,
  onEdit,
}: {
  li: BidLine;
  projectId: string;
  bidId: string;
  readOnly: boolean;
  onEdit: () => void;
}) {
  const fmt = useFormatters();
  const utils = trpc.useUtils();
  const remove = trpc.workItems.remove.useMutation({
    onSuccess: () => utils.workItems.list.invalidate({ projectId, bidId }),
  });
  return (
    <tr className="border-b border-ink-100 last:border-b-0">
      <Td className="font-mono text-[12px] text-ink-500">{li.ref ?? "—"}</Td>
      <Td className="text-ink-800">{li.description}</Td>
      <Td align="right" className="tnum text-ink-600">
        {li.qty ? `${trimZero(li.qty)}${li.unit ? ` ${li.unit}` : ""}` : "—"}
      </Td>
      <Td align="right" className="tnum text-ink-600">
        {li.unitPriceAmount && li.unitPriceCurrency
          ? fmt.currency(li.unitPriceAmount, li.unitPriceCurrency)
          : "—"}
      </Td>
      <Td align="right" className="tnum font-medium text-ink-900">
        {li.totalAmount && li.totalCurrency
          ? fmt.currency(li.totalAmount, li.totalCurrency)
          : "—"}
      </Td>
      {!readOnly && (
        <Td align="right" className="whitespace-nowrap">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="text-[12px] text-ink-500 hover:text-ink-900"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`Remove "${li.description.slice(0, 40)}"?`)) {
                  remove.mutate({ id: li.id });
                }
              }}
              className="text-[12px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
            >
              {remove.isPending ? "…" : "Remove"}
            </button>
          </div>
        </Td>
      )}
    </tr>
  );
}

function BidLineForm({
  mode,
  existing,
  projectId,
  bidId,
  defaultCurrency,
  defaultTrade,
  onClose,
}: {
  mode: "create" | "edit";
  existing?: BidLine;
  projectId: string;
  bidId: string;
  defaultCurrency: string;
  defaultTrade: string;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(existing?.description ?? "");
  const [ref, setRef] = useState(existing?.ref ?? "");
  const [qty, setQty] = useState(existing?.qty ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [unitPrice, setUnitPrice] = useState(existing?.unitPriceAmount ?? "");
  const [total, setTotal] = useState(existing?.totalAmount ?? "");
  const [currency, setCurrency] = useState(
    existing?.totalCurrency ?? existing?.unitPriceCurrency ?? defaultCurrency,
  );
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const onDone = () => {
    utils.workItems.list.invalidate({ projectId, bidId });
    onClose();
  };
  const create = trpc.workItems.create.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });
  const update = trpc.workItems.update.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });
  const submitting = create.isPending || update.isPending;

  function autoTotal() {
    const q = parseFloat(qty);
    const u = parseFloat(unitPrice);
    if (!isFinite(q) || !isFinite(u)) return;
    if (total.trim()) return;
    setTotal((q * u).toFixed(2));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    const cur = currency.trim().toUpperCase();
    const up = unitPrice.trim();
    const tot = total.trim();
    if ((up || tot) && cur.length !== 3) {
      setError("Currency must be a 3-letter code when a price is set.");
      return;
    }
    if (mode === "edit" && existing) {
      update.mutate({
        id: existing.id,
        patch: {
          description: description.trim(),
          ref: ref.trim() || null,
          qty: qty.trim() || null,
          unit: unit.trim() || null,
          unitPriceAmount: up || null,
          unitPriceCurrency: up ? cur : null,
          totalAmount: tot || null,
          totalCurrency: tot ? cur : null,
        },
      });
    } else {
      create.mutate({
        projectId,
        bidId,
        description: description.trim(),
        ref: ref.trim() || undefined,
        trade: defaultTrade.trim() || undefined,
        qty: qty.trim() || undefined,
        unit: unit.trim() || undefined,
        unitPriceAmount: up || undefined,
        unitPriceCurrency: up ? cur : undefined,
        totalAmount: tot || undefined,
        totalCurrency: tot ? cur : undefined,
        status: "specified",
      });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-ink-200 bg-white p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {mode === "edit" ? "Edit · line" : "New · line"}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-6">
        <label className="block text-sm sm:col-span-4">
          <span className="text-ink-700">Description *</span>
          <input
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputCls} mt-1`}
            autoFocus
            placeholder="e.g. Suministro e instalación de piso laminado"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-700">Ref</span>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className={`${inputCls} mt-1`}
            placeholder="V14, S1-01…"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-700">Qty + unit</span>
          <div className="mt-1 flex gap-2">
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
              placeholder="ea, m²"
            />
          </div>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-700">Unit price</span>
          <input
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            onBlur={autoTotal}
            className={`${inputCls} mt-1`}
            placeholder="1250.00"
            inputMode="decimal"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-700">Total + currency</span>
          <div className="mt-1 flex gap-2">
            <input
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={`${inputCls} flex-1`}
              placeholder="auto from qty × price"
              inputMode="decimal"
            />
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${inputCls} w-20 text-center uppercase tracking-wider`}
              maxLength={3}
            />
          </div>
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Saving…" : mode === "edit" ? "Save line" : "Add line"}
        </Button>
      </div>
    </form>
  );
}

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3 h-9 text-[13px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

function Fact({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "alert";
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-[15px] font-medium ${tone === "alert" ? "text-rose-700" : "text-ink-900"}`}
      >
        {children}
      </p>
    </div>
  );
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

// Trim trailing zeros from a numeric string ("2.0000" → "2", "1.5000" → "1.5").
function trimZero(n: string): string {
  if (!n.includes(".")) return n;
  return n.replace(/\.?0+$/, "");
}
