import { useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  BILL_STATUS_LABELS,
  isBillOverdue,
  type BillStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels } from "../../lib/i18n";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
  MoneyInput,
  Pill,
  Select,
  Textarea,
} from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type BillDetail = inferRouterOutputs<AppRouter>["bills"]["get"];

const STATUS_TONE: Record<BillStatus, "warn" | "success" | "muted"> = {
  open: "warn",
  paid: "success",
  void: "muted",
};

export default function ProjectBillDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { billId } = useParams<{ billId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const L = useLabels();
  const [editing, setEditing] = useState(false);

  const bill = trpc.bills.get.useQuery(
    { id: billId ?? "" },
    { enabled: !!billId },
  );

  const utils = trpc.useUtils();
  const markPaid = trpc.bills.markPaid.useMutation({
    onSuccess: () => {
      utils.bills.list.invalidate({ projectId: project.id });
      utils.bills.get.invalidate({ id: billId ?? "" });
    },
  });
  const remove = trpc.bills.remove.useMutation({
    onSuccess: () => {
      utils.bills.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/money`);
    },
  });

  if (!billId) return null;
  if (bill.isLoading) return <p className="text-sm text-ink-500">Loading…</p>;
  if (bill.error)
    return <p className="text-sm text-rose-700">{bill.error.message}</p>;
  if (!bill.data) return null;

  const b = bill.data;
  const overdue = isBillOverdue(b.status, b.dueAt);

  return (
    <div className="animate-fade space-y-12">
      <header>
        <Link
          to={`/projects/${project.id}/money`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          Money
        </Link>

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Pill tone={STATUS_TONE[b.status]} dot>
                {L.billStatus(b.status)}
              </Pill>
              {overdue && (
                <Pill tone="alert" dot>
                  Overdue
                </Pill>
              )}
              <span className="text-[13px] text-ink-500">
                Bill
                {b.vendor ? ` · ${b.vendor.name}` : " · Self-purchase"}
              </span>
            </div>
            <p className="mt-4 num text-5xl leading-none text-ink-900">
              {fmt.currency(b.amount, b.currency)}
            </p>
            <h1 className="mt-3 font-display text-2xl font-normal tracking-tight text-ink-900">
              {b.description || b.billNumber || "Untitled bill"}
            </h1>
            {b.billNumber && b.description && (
              <p className="mt-1 font-mono text-[13px] text-ink-500">
                #{b.billNumber}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {b.status === "open" && (
              <Button
                variant="primary"
                onClick={() => markPaid.mutate({ id: b.id })}
                disabled={markPaid.isPending}
              >
                {markPaid.isPending ? "Marking…" : "Mark paid"}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Issued">{b.issuedAt ? fmt.date(b.issuedAt) : "—"}</Fact>
        <Fact label="Due" tone={overdue ? "alert" : undefined}>
          {b.dueAt ? fmt.date(b.dueAt) : "—"}
        </Fact>
        <Fact label="Paid">{b.paidAt ? fmt.date(b.paidAt) : "—"}</Fact>
        <Fact label="Vendor">{b.vendor?.name ?? "Self-purchase"}</Fact>
      </section>

      {b.source && (
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Source
          </h2>
          <Link
            to={`/projects/${project.id}/assets/${b.source.asset.id}`}
            className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-ink-200/70 bg-white px-5 py-4 transition-colors hover:bg-paper-50"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                Asset event
              </p>
              <p className="mt-1 text-[15px] font-medium text-ink-900">
                {b.source.asset.name}
              </p>
              <p className="mt-0.5 text-[13px] text-ink-600">
                {b.source.event.summary}
              </p>
            </div>
            <Icon name="chevron-right" className="h-4 w-4 text-ink-400" />
          </Link>
        </section>
      )}

      {b.sourceBid && (
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Source
          </h2>
          <Link
            to={`/projects/${project.id}/bids/${b.sourceBid.id}`}
            className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-ink-200/70 bg-white px-5 py-4 transition-colors hover:bg-paper-50"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                Accepted quote
              </p>
              <p className="mt-1 text-[15px] font-medium text-ink-900">
                {b.sourceBid.trade ?? "Subcontractor quote"}
                {b.sourceBid.bidNumber ? ` · #${b.sourceBid.bidNumber}` : ""}
              </p>
              <p className="mt-0.5 text-[13px] text-ink-600">
                Created automatically when this quote was approved.
              </p>
            </div>
            <Icon name="chevron-right" className="h-4 w-4 text-ink-400" />
          </Link>
        </section>
      )}

      {b.notes && (
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Notes
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
            {b.notes}
          </p>
        </section>
      )}

      <section className="border-t border-ink-100 pt-8">
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete this bill? This cannot be undone.`)) {
              remove.mutate({ id: b.id });
            }
          }}
          className="text-[13px] text-rose-600 hover:text-rose-800"
        >
          Delete this bill
        </button>
      </section>

      {editing && (
        <BillEditModal bill={b} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

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
        className={`mt-1 text-[16px] font-medium tnum ${tone === "alert" ? "text-rose-700" : "text-ink-900"}`}
      >
        {children}
      </p>
    </div>
  );
}

function BillEditModal({
  bill,
  onClose,
}: {
  bill: BillDetail;
  onClose: () => void;
}) {
  const vendorsQ = trpc.vendors.list.useQuery({ status: "active" });
  const L = useLabels();
  const [vendorId, setVendorId] = useState(bill.vendorId ?? "");
  const [billNumber, setBillNumber] = useState(bill.billNumber ?? "");
  const [description, setDescription] = useState(bill.description ?? "");
  const [amount, setAmount] = useState(bill.amount);
  const [currency, setCurrency] = useState(bill.currency);
  const [issuedAt, setIssuedAt] = useState(bill.issuedAt ?? "");
  const [dueAt, setDueAt] = useState(bill.dueAt ?? "");
  const [paidAt, setPaidAt] = useState(bill.paidAt ?? "");
  const [status, setStatus] = useState<BillStatus>(bill.status);
  const [notes, setNotes] = useState(bill.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const update = trpc.bills.update.useMutation({
    onSuccess: () => {
      utils.bills.list.invalidate({ projectId: bill.projectId });
      utils.bills.get.invalidate({ id: bill.id });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount.trim() || !currency.trim()) {
      setError("Amount and currency are required.");
      return;
    }
    update.mutate({
      id: bill.id,
      patch: {
        vendorId: vendorId || null,
        billNumber: billNumber.trim() || null,
        description: description.trim() || null,
        amount: amount.trim(),
        currency: currency.trim(),
        issuedAt: issuedAt || null,
        dueAt: dueAt || null,
        paidAt: paidAt || null,
        status,
        notes: notes.trim() || null,
      },
    });
  }

  return (
    <Modal
      title={`Edit bill`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-rose-600">{error}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="bill-edit-form"
              variant="primary"
              disabled={update.isPending}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="bill-edit-form"
        onSubmit={onSubmit}
        className="grid gap-5 sm:grid-cols-2"
      >
        <Field label="Description" wide>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
            placeholder="Tile installation — kitchen + primary bath"
          />
        </Field>
        <Field label="Vendor" hint="Optional">
          <Select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">— None (self-purchase)</option>
            {vendorsQ.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bill number" hint="Vendor's invoice #">
          <Input
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            placeholder="INV-12345"
          />
        </Field>
        <Field label="Amount" required wide>
          <MoneyInput
            amount={amount}
            currency={currency}
            onAmountChange={setAmount}
            onCurrencyChange={setCurrency}
            placeholder="3,500.00"
            required
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as BillStatus)}
          >
            {(Object.keys(BILL_STATUS_LABELS) as BillStatus[]).map((s) => (
              <option key={s} value={s}>
                {L.billStatus(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Issued">
          <Input
            type="date"
            value={issuedAt as string}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </Field>
        <Field label="Due">
          <Input
            type="date"
            value={dueAt as string}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label="Paid">
          <Input
            type="date"
            value={paidAt as string}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </Field>
        <Field label="Notes" wide>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </Field>
      </form>
    </Modal>
  );
}
