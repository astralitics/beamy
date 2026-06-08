import { useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  INVOICE_STATUS_LABELS,
  isInvoiceOverdue,
  type InvoiceStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT } from "../../lib/i18n";
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
type InvoiceDetail = inferRouterOutputs<AppRouter>["invoices"]["get"];

const STATUS_TONE: Record<
  InvoiceStatus,
  "neutral" | "info" | "success" | "muted"
> = {
  draft: "neutral",
  sent: "info",
  paid: "success",
  void: "muted",
};

export default function ProjectInvoiceDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
  const [editing, setEditing] = useState(false);

  const invoice = trpc.invoices.get.useQuery(
    { id: invoiceId ?? "" },
    { enabled: !!invoiceId },
  );

  const utils = trpc.useUtils();
  const markSent = trpc.invoices.markSent.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate({ projectId: project.id });
      utils.invoices.get.invalidate({ id: invoiceId ?? "" });
    },
  });
  const markPaid = trpc.invoices.markPaid.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate({ projectId: project.id });
      utils.invoices.get.invalidate({ id: invoiceId ?? "" });
    },
  });
  const remove = trpc.invoices.remove.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/money`);
    },
  });

  if (!invoiceId) return null;
  if (invoice.isLoading)
    return <p className="text-sm text-ink-500">{t("common.loading")}</p>;
  if (invoice.error)
    return <p className="text-sm text-rose-700">{invoice.error.message}</p>;
  if (!invoice.data) return null;

  const i = invoice.data;
  const overdue = isInvoiceOverdue(i.status, i.dueAt);

  return (
    <div className="animate-fade space-y-12">
      <header>
        <Link
          to={`/projects/${project.id}/money`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          {t("nav.money")}
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Pill tone={STATUS_TONE[i.status]} dot>
                {L.invoiceStatus(i.status)}
              </Pill>
              {overdue && (
                <Pill tone="alert" dot>
                  {t("common.overdue")}
                </Pill>
              )}
              <span className="text-[13px] text-ink-500">
                {t("invoice.label")}
                {i.client ? ` · ${i.client.name}` : ""}
              </span>
            </div>
            <p className="mt-4 num text-5xl leading-none text-ink-900">
              {fmt.currency(i.amount, i.currency)}
            </p>
            <h1 className="mt-3 font-display text-2xl font-normal tracking-tight text-ink-900">
              {i.description || i.invoiceNumber || t("invoice.untitled")}
            </h1>
            {i.invoiceNumber && i.description && (
              <p className="mt-1 font-mono text-[13px] text-ink-500">
                #{i.invoiceNumber}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {i.status === "draft" && (
              <Button
                variant="primary"
                onClick={() => markSent.mutate({ id: i.id })}
                disabled={markSent.isPending}
              >
                {markSent.isPending ? t("common.marking") : t("detail.mark_sent")}
              </Button>
            )}
            {i.status === "sent" && (
              <Button
                variant="primary"
                onClick={() => markPaid.mutate({ id: i.id })}
                disabled={markPaid.isPending}
              >
                {markPaid.isPending ? t("common.marking") : t("detail.mark_paid")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-5">
        <Fact label={t("invoice.fact.issued")}>
          {i.issuedAt ? fmt.date(i.issuedAt) : "—"}
        </Fact>
        <Fact label={t("invoice.fact.sent")}>
          {i.sentAt ? fmt.date(i.sentAt) : "—"}
        </Fact>
        <Fact label={t("col.due")} tone={overdue ? "alert" : undefined}>
          {i.dueAt ? fmt.date(i.dueAt) : "—"}
        </Fact>
        <Fact label={t("invoice.fact.paid")}>
          {i.paidAt ? fmt.date(i.paidAt) : "—"}
        </Fact>
        <Fact label={t("col.client")}>{i.client?.name ?? "—"}</Fact>
      </section>

      {i.notes && (
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            {t("detail.notes")}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
            {i.notes}
          </p>
        </section>
      )}

      <section className="border-t border-ink-100 pt-8">
        <button
          type="button"
          onClick={() => {
            if (confirm(t("invoice.delete_confirm"))) {
              remove.mutate({ id: i.id });
            }
          }}
          className="text-[13px] text-rose-600 hover:text-rose-800"
        >
          {t("detail.delete_invoice")}
        </button>
      </section>

      {editing && (
        <InvoiceEditModal invoice={i} onClose={() => setEditing(false)} />
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

function InvoiceEditModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceDetail;
  onClose: () => void;
}) {
  const clientsQ = trpc.clients.list.useQuery({ status: "active" });
  const L = useLabels();
  const t = useT();
  const [clientId, setClientId] = useState(invoice.clientId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(
    invoice.invoiceNumber ?? "",
  );
  const [description, setDescription] = useState(invoice.description ?? "");
  const [amount, setAmount] = useState(invoice.amount);
  const [currency, setCurrency] = useState(invoice.currency);
  const [issuedAt, setIssuedAt] = useState(invoice.issuedAt ?? "");
  const [sentAt, setSentAt] = useState(invoice.sentAt ?? "");
  const [dueAt, setDueAt] = useState(invoice.dueAt ?? "");
  const [paidAt, setPaidAt] = useState(invoice.paidAt ?? "");
  const [status, setStatus] = useState<InvoiceStatus>(invoice.status);
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const update = trpc.invoices.update.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate({ projectId: invoice.projectId });
      utils.invoices.get.invalidate({ id: invoice.id });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount.trim() || !currency.trim()) {
      setError(t("money.error.amount_currency_required"));
      return;
    }
    update.mutate({
      id: invoice.id,
      patch: {
        clientId: clientId || null,
        invoiceNumber: invoiceNumber.trim() || null,
        description: description.trim() || null,
        amount: amount.trim(),
        currency: currency.trim(),
        issuedAt: issuedAt || null,
        sentAt: sentAt || null,
        dueAt: dueAt || null,
        paidAt: paidAt || null,
        status,
        notes: notes.trim() || null,
      },
    });
  }

  return (
    <Modal
      title={t("invoice.edit_title")}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-rose-600">{error}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="invoice-edit-form"
              variant="primary"
              disabled={update.isPending}
            >
              {update.isPending ? t("common.saving") : t("common.save_changes")}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="invoice-edit-form"
        onSubmit={onSubmit}
        className="grid gap-5 sm:grid-cols-2"
      >
        <Field label={t("col.description")} wide>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
            placeholder={t("invoice.ph.description")}
          />
        </Field>
        <Field label={t("col.client")} hint={t("common.optional")}>
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">{t("invoice.opt.no_client")}</option>
            {clientsQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("invoice.field.number")}>
          <Input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="INV-2026-0001"
          />
        </Field>
        <Field label={t("col.amount")} required wide>
          <MoneyInput
            amount={amount}
            currency={currency}
            onAmountChange={setAmount}
            onCurrencyChange={setCurrency}
            placeholder="25,000.00"
            required
          />
        </Field>
        <Field label={t("col.status")}>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
          >
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {L.invoiceStatus(s)}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label={t("invoice.field.issued")}>
          <Input
            type="date"
            value={issuedAt as string}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </Field>
        <Field label={t("invoice.field.sent")}>
          <Input
            type="date"
            value={sentAt as string}
            onChange={(e) => setSentAt(e.target.value)}
          />
        </Field>
        <Field label={t("col.due")}>
          <Input
            type="date"
            value={dueAt as string}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label={t("invoice.field.paid")}>
          <Input
            type="date"
            value={paidAt as string}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </Field>
        <Field label={t("detail.notes")} wide>
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
