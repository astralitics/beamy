import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  BILL_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  isBillOverdue,
  isInvoiceOverdue,
  type BillStatus,
  type InvoiceStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type BillRow = inferRouterOutputs<AppRouter>["bills"]["list"][number];
type InvoiceRow = inferRouterOutputs<AppRouter>["invoices"]["list"][number];

/**
 * Money — project-scoped financial layer. Two stacked sections:
 *   • Bills (we owe vendors)
 *   • Invoices (clients owe us)
 *
 * Top band summarizes open / overdue / paid totals so the project's
 * financial pulse is one glance away.
 */
export default function ProjectMoney() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const fmt = useFormatters();

  const bills = trpc.bills.list.useQuery({ projectId: project.id });
  const invoices = trpc.invoices.list.useQuery({ projectId: project.id });

  const summary = useMemo(
    () => buildSummary(bills.data ?? [], invoices.data ?? []),
    [bills.data, invoices.data],
  );

  return (
    <div className="space-y-10">
      {/* Pulse band */}
      <section>
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          At a glance
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PulseCard
            label="Outstanding (we owe)"
            value={
              summary.billsOutstandingByCcy.length === 0
                ? "—"
                : summary.billsOutstandingByCcy
                    .map(([ccy, amt]) => fmt.currency(amt.toFixed(2), ccy))
                    .join(" · ")
            }
            hint={`${summary.billsOverdueCount} overdue`}
            tone={summary.billsOverdueCount > 0 ? "warn" : "neutral"}
          />
          <PulseCard
            label="Outstanding (clients owe)"
            value={
              summary.invoicesOutstandingByCcy.length === 0
                ? "—"
                : summary.invoicesOutstandingByCcy
                    .map(([ccy, amt]) => fmt.currency(amt.toFixed(2), ccy))
                    .join(" · ")
            }
            hint={`${summary.invoicesOverdueCount} overdue`}
            tone={summary.invoicesOverdueCount > 0 ? "warn" : "neutral"}
          />
          <PulseCard
            label="Paid to vendors"
            value={
              summary.billsPaidByCcy.length === 0
                ? "—"
                : summary.billsPaidByCcy
                    .map(([ccy, amt]) => fmt.currency(amt.toFixed(2), ccy))
                    .join(" · ")
            }
            hint="total"
          />
          <PulseCard
            label="Collected from clients"
            value={
              summary.invoicesPaidByCcy.length === 0
                ? "—"
                : summary.invoicesPaidByCcy
                    .map(([ccy, amt]) => fmt.currency(amt.toFixed(2), ccy))
                    .join(" · ")
            }
            hint="total"
            tone="good"
          />
        </div>
      </section>

      {/* Bills */}
      <BillsSection projectId={project.id} bills={bills.data ?? []} loading={bills.isLoading} error={bills.error?.message} />

      {/* Invoices */}
      <InvoicesSection
        projectId={project.id}
        clientId={project.clientId}
        invoices={invoices.data ?? []}
        loading={invoices.isLoading}
        error={invoices.error?.message}
      />
    </div>
  );
}

// ────────────────────── pulse cards ──────────────────────

type Tone = "neutral" | "good" | "warn";
const TONE_CLS: Record<Tone, string> = {
  neutral: "border-paper-200",
  good: "border-emerald-200 bg-emerald-50/30",
  warn: "border-amber-200 bg-amber-50/40",
};

function PulseCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-lg border ${TONE_CLS[tone]} bg-white p-4`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold text-blueprint-900">
        {value}
      </p>
      <p className="mt-1 text-[10px] text-slate-500">{hint}</p>
    </div>
  );
}

// ────────────────────── bills ──────────────────────

const BILL_STATUS_PILL: Record<BillStatus, string> = {
  open: "bg-amber-50 text-amber-800 ring-amber-200",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  void: "bg-slate-50 text-slate-600 ring-slate-200",
};

function BillsSection({
  projectId,
  bills,
  loading,
  error,
}: {
  projectId: string;
  bills: BillRow[];
  loading: boolean;
  error: string | undefined;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BillRow | null>(null);

  return (
    <section>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-blueprint-900">
            Bills
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Vendor invoices we receive. Each row = one bill to pay.
          </p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Add bill
          </button>
        )}
      </div>

      {adding && (
        <BillForm
          projectId={projectId}
          mode="create"
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <BillForm
          projectId={projectId}
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mt-3">
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : error ? (
          <p className="text-xs text-rose-700">{error}</p>
        ) : bills.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            No bills yet. Click <strong>Add bill</strong> when a vendor invoice
            comes in.
          </p>
        ) : (
          <div className="grid gap-2">
            {bills.map((b) => (
              <BillRowItem
                key={b.id}
                bill={b}
                onEdit={() => setEditing(b)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BillRowItem({ bill, onEdit }: { bill: BillRow; onEdit: () => void }) {
  const fmt = useFormatters();
  const utils = trpc.useUtils();
  const remove = trpc.bills.remove.useMutation({
    onSuccess: () =>
      utils.bills.list.invalidate({ projectId: bill.projectId }),
  });
  const markPaid = trpc.bills.markPaid.useMutation({
    onSuccess: () =>
      utils.bills.list.invalidate({ projectId: bill.projectId }),
  });

  const overdue = isBillOverdue(bill.status, bill.dueAt);

  return (
    <div
      className={`rounded-md border bg-white p-3 ${overdue ? "border-amber-300" : "border-paper-200"}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-blueprint-900">
              {bill.description || bill.billNumber || "Untitled bill"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${BILL_STATUS_PILL[bill.status]}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
              {BILL_STATUS_LABELS[bill.status]}
            </span>
            {overdue && (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 ring-1 ring-inset ring-rose-200">
                Overdue
              </span>
            )}
            {bill.vendor && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                · {bill.vendor.name}
              </span>
            )}
            {bill.billNumber && bill.description && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                · #{bill.billNumber}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
            <span className="text-blueprint-900">
              {fmt.currency(bill.amount, bill.currency)}
            </span>
            {bill.issuedAt && <span>issued {fmt.date(bill.issuedAt)}</span>}
            {bill.dueAt && <span>due {fmt.date(bill.dueAt)}</span>}
            {bill.paidAt && <span>paid {fmt.date(bill.paidAt)}</span>}
          </div>
          {bill.notes && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">
              {bill.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {bill.status === "open" && (
            <button
              type="button"
              onClick={() => markPaid.mutate({ id: bill.id })}
              disabled={markPaid.isPending}
              className="rounded-md border border-paper-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              Mark paid
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
              if (confirm("Delete this bill?")) remove.mutate({ id: bill.id });
            }}
            disabled={remove.isPending}
            className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
          >
            {remove.isPending ? "…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillForm({
  projectId,
  mode,
  existing,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: BillRow;
  onClose: () => void;
}) {
  const vendorsQ = trpc.vendors.list.useQuery({ status: "active" });
  const [vendorId, setVendorId] = useState(existing?.vendorId ?? "");
  const [billNumber, setBillNumber] = useState(existing?.billNumber ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? "USD");
  const [issuedAt, setIssuedAt] = useState(existing?.issuedAt ?? "");
  const [dueAt, setDueAt] = useState(existing?.dueAt ?? "");
  const [paidAt, setPaidAt] = useState(existing?.paidAt ?? "");
  const [status, setStatus] = useState<BillStatus>(existing?.status ?? "open");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.bills.create.useMutation({
    onSuccess: () => {
      utils.bills.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.bills.update.useMutation({
    onSuccess: () => {
      utils.bills.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = amount.trim();
    const cur = currency.trim();
    if (!amt || !cur) {
      setError("Amount and currency are required.");
      return;
    }
    const base = {
      vendorId: vendorId || undefined,
      billNumber: billNumber.trim() || undefined,
      description: description.trim() || undefined,
      amount: amt,
      currency: cur,
      issuedAt: issuedAt || undefined,
      dueAt: dueAt || undefined,
      paidAt: paidAt || undefined,
      status,
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
        {mode === "edit" ? "Edit · bill" : "New · bill"}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Description" wide>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="e.g. Tile installation — kitchen + primary bath"
          />
        </Field>
        <Field label="Vendor">
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className={selectCls}
          >
            <option value="">— (none)</option>
            {vendorsQ.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bill #">
          <input
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            className={inputCls}
            placeholder="vendor's invoice number"
          />
        </Field>
        <Field label="Amount *">
          <div className="flex gap-2">
            <input
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} flex-1`}
              placeholder="3500.00"
              inputMode="decimal"
            />
            <input
              required
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${inputCls} w-16 uppercase`}
              maxLength={3}
            />
          </div>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BillStatus)}
            className={selectCls}
          >
            {(Object.keys(BILL_STATUS_LABELS) as BillStatus[]).map((s) => (
              <option key={s} value={s}>
                {BILL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issued">
          <input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Due">
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Paid">
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Notes" wide>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
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

// ────────────────────── invoices ──────────────────────

const INVOICE_STATUS_PILL: Record<InvoiceStatus, string> = {
  draft: "bg-slate-50 text-slate-700 ring-slate-200",
  sent: "bg-sky-50 text-sky-800 ring-sky-200",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  void: "bg-slate-50 text-slate-600 ring-slate-200",
};

function InvoicesSection({
  projectId,
  clientId,
  invoices,
  loading,
  error,
}: {
  projectId: string;
  clientId: string | null;
  invoices: InvoiceRow[];
  loading: boolean;
  error: string | undefined;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InvoiceRow | null>(null);

  return (
    <section>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-blueprint-900">
            Invoices
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            What we bill clients. Lifecycle: <em className="not-italic">draft → sent → paid</em>.
          </p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Add invoice
          </button>
        )}
      </div>

      {adding && (
        <InvoiceForm
          projectId={projectId}
          defaultClientId={clientId ?? ""}
          mode="create"
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <InvoiceForm
          projectId={projectId}
          defaultClientId={clientId ?? ""}
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mt-3">
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : error ? (
          <p className="text-xs text-rose-700">{error}</p>
        ) : invoices.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            No invoices yet. Click <strong>Add invoice</strong> to draft the
            first one.
          </p>
        ) : (
          <div className="grid gap-2">
            {invoices.map((i) => (
              <InvoiceRowItem
                key={i.id}
                invoice={i}
                onEdit={() => setEditing(i)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function InvoiceRowItem({
  invoice,
  onEdit,
}: {
  invoice: InvoiceRow;
  onEdit: () => void;
}) {
  const fmt = useFormatters();
  const utils = trpc.useUtils();
  const remove = trpc.invoices.remove.useMutation({
    onSuccess: () =>
      utils.invoices.list.invalidate({ projectId: invoice.projectId }),
  });
  const markSent = trpc.invoices.markSent.useMutation({
    onSuccess: () =>
      utils.invoices.list.invalidate({ projectId: invoice.projectId }),
  });
  const markPaid = trpc.invoices.markPaid.useMutation({
    onSuccess: () =>
      utils.invoices.list.invalidate({ projectId: invoice.projectId }),
  });

  const overdue = isInvoiceOverdue(invoice.status, invoice.dueAt);

  return (
    <div
      className={`rounded-md border bg-white p-3 ${overdue ? "border-amber-300" : "border-paper-200"}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-blueprint-900">
              {invoice.description ||
                invoice.invoiceNumber ||
                "Untitled invoice"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${INVOICE_STATUS_PILL[invoice.status]}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
              {INVOICE_STATUS_LABELS[invoice.status]}
            </span>
            {overdue && (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 ring-1 ring-inset ring-rose-200">
                Overdue
              </span>
            )}
            {invoice.client && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                · {invoice.client.name}
              </span>
            )}
            {invoice.invoiceNumber && invoice.description && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                · #{invoice.invoiceNumber}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
            <span className="text-blueprint-900">
              {fmt.currency(invoice.amount, invoice.currency)}
            </span>
            {invoice.issuedAt && (
              <span>issued {fmt.date(invoice.issuedAt)}</span>
            )}
            {invoice.sentAt && <span>sent {fmt.date(invoice.sentAt)}</span>}
            {invoice.dueAt && <span>due {fmt.date(invoice.dueAt)}</span>}
            {invoice.paidAt && <span>paid {fmt.date(invoice.paidAt)}</span>}
          </div>
          {invoice.notes && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">
              {invoice.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {invoice.status === "draft" && (
            <button
              type="button"
              onClick={() => markSent.mutate({ id: invoice.id })}
              disabled={markSent.isPending}
              className="rounded-md border border-paper-200 px-2 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50"
            >
              Mark sent
            </button>
          )}
          {invoice.status === "sent" && (
            <button
              type="button"
              onClick={() => markPaid.mutate({ id: invoice.id })}
              disabled={markPaid.isPending}
              className="rounded-md border border-paper-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              Mark paid
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
              if (confirm("Delete this invoice?")) {
                remove.mutate({ id: invoice.id });
              }
            }}
            disabled={remove.isPending}
            className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
          >
            {remove.isPending ? "…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceForm({
  projectId,
  defaultClientId,
  mode,
  existing,
  onClose,
}: {
  projectId: string;
  defaultClientId: string;
  mode: "create" | "edit";
  existing?: InvoiceRow;
  onClose: () => void;
}) {
  const clientsQ = trpc.clients.list.useQuery({ status: "active" });
  const [clientId, setClientId] = useState(
    existing?.clientId ?? defaultClientId,
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    existing?.invoiceNumber ?? "",
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? "USD");
  const [issuedAt, setIssuedAt] = useState(existing?.issuedAt ?? "");
  const [sentAt, setSentAt] = useState(existing?.sentAt ?? "");
  const [dueAt, setDueAt] = useState(existing?.dueAt ?? "");
  const [paidAt, setPaidAt] = useState(existing?.paidAt ?? "");
  const [status, setStatus] = useState<InvoiceStatus>(
    existing?.status ?? "draft",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.invoices.create.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.invoices.update.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = amount.trim();
    const cur = currency.trim();
    if (!amt || !cur) {
      setError("Amount and currency are required.");
      return;
    }
    const base = {
      clientId: clientId || undefined,
      invoiceNumber: invoiceNumber.trim() || undefined,
      description: description.trim() || undefined,
      amount: amt,
      currency: cur,
      issuedAt: issuedAt || undefined,
      sentAt: sentAt || undefined,
      dueAt: dueAt || undefined,
      paidAt: paidAt || undefined,
      status,
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
        {mode === "edit" ? "Edit · invoice" : "New · invoice"}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Description" wide>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="e.g. Progress invoice #3 — kitchen rough-in complete"
          />
        </Field>
        <Field label="Client">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={selectCls}
          >
            <option value="">— (none)</option>
            {clientsQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invoice #">
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className={inputCls}
            placeholder="INV-2026-0001"
          />
        </Field>
        <Field label="Amount *">
          <div className="flex gap-2">
            <input
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} flex-1`}
              placeholder="25000.00"
              inputMode="decimal"
            />
            <input
              required
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${inputCls} w-16 uppercase`}
              maxLength={3}
            />
          </div>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
            className={selectCls}
          >
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {INVOICE_STATUS_LABELS[s]}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Issued">
          <input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Sent">
          <input
            type="date"
            value={sentAt}
            onChange={(e) => setSentAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Due">
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Paid">
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Notes" wide>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
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

// ────────────────────── summary math ──────────────────────

type Summary = {
  billsOutstandingByCcy: Array<[string, number]>;
  billsPaidByCcy: Array<[string, number]>;
  billsOverdueCount: number;
  invoicesOutstandingByCcy: Array<[string, number]>;
  invoicesPaidByCcy: Array<[string, number]>;
  invoicesOverdueCount: number;
};

function buildSummary(bills: BillRow[], invoices: InvoiceRow[]): Summary {
  const billsOpen = new Map<string, number>();
  const billsPaid = new Map<string, number>();
  let billsOverdueCount = 0;
  for (const b of bills) {
    const amt = parseFloat(b.amount);
    if (!isFinite(amt)) continue;
    if (b.status === "open") {
      billsOpen.set(b.currency, (billsOpen.get(b.currency) ?? 0) + amt);
      if (isBillOverdue(b.status, b.dueAt)) billsOverdueCount += 1;
    } else if (b.status === "paid") {
      billsPaid.set(b.currency, (billsPaid.get(b.currency) ?? 0) + amt);
    }
  }
  const invOpen = new Map<string, number>();
  const invPaid = new Map<string, number>();
  let invOverdueCount = 0;
  for (const i of invoices) {
    const amt = parseFloat(i.amount);
    if (!isFinite(amt)) continue;
    if (i.status === "draft" || i.status === "sent") {
      invOpen.set(i.currency, (invOpen.get(i.currency) ?? 0) + amt);
      if (isInvoiceOverdue(i.status, i.dueAt)) invOverdueCount += 1;
    } else if (i.status === "paid") {
      invPaid.set(i.currency, (invPaid.get(i.currency) ?? 0) + amt);
    }
  }
  return {
    billsOutstandingByCcy: [...billsOpen.entries()],
    billsPaidByCcy: [...billsPaid.entries()],
    billsOverdueCount,
    invoicesOutstandingByCcy: [...invOpen.entries()],
    invoicesPaidByCcy: [...invPaid.entries()],
    invoicesOverdueCount: invOverdueCount,
  };
}

// ────────────────────── shared styles ──────────────────────

const inputCls =
  "block w-full rounded-md border border-paper-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

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
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
