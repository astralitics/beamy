import { useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
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
type BillRow = inferRouterOutputs<AppRouter>["bills"]["list"][number];
type InvoiceRow = inferRouterOutputs<AppRouter>["invoices"]["list"][number];

type Tab = "bills" | "invoices";

const BILL_TONE: Record<BillStatus, "warn" | "success" | "muted"> = {
  open: "warn",
  paid: "success",
  void: "muted",
};

const INVOICE_TONE: Record<
  InvoiceStatus,
  "neutral" | "info" | "success" | "muted"
> = {
  draft: "neutral",
  sent: "info",
  paid: "success",
  void: "muted",
};

/**
 * Money — project-scoped financial layer.
 *   - Top summary tiles (Outstanding, Overdue, Paid, Collected).
 *   - Tab switcher: Bills (we owe) | Invoices (clients owe).
 *   - Each tab is a real table with filters, search, click-through detail.
 */
export default function ProjectMoney() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get("tab") ?? "bills") as Tab;
  const [tab, setTab] = useState<Tab>(
    tabFromUrl === "invoices" ? "invoices" : "bills",
  );
  const fmt = useFormatters();

  const bills = trpc.bills.list.useQuery({ projectId: project.id });
  const invoices = trpc.invoices.list.useQuery({ projectId: project.id });

  const summary = useMemo(
    () => buildSummary(bills.data ?? [], invoices.data ?? []),
    [bills.data, invoices.data],
  );

  function selectTab(next: Tab) {
    setTab(next);
    searchParams.set("tab", next);
    setSearchParams(searchParams, { replace: true });
  }

  return (
    <div className="space-y-10 animate-fade">
      <SummaryStrip summary={summary} fmt={fmt} />

      <div className="border-b border-ink-100">
        <nav className="-mb-px flex items-center gap-6">
          <TabButton
            active={tab === "bills"}
            onClick={() => selectTab("bills")}
            label="Bills"
            count={bills.data?.length ?? 0}
          />
          <TabButton
            active={tab === "invoices"}
            onClick={() => selectTab("invoices")}
            label="Invoices"
            count={invoices.data?.length ?? 0}
          />
        </nav>
      </div>

      {tab === "bills" ? (
        <BillsTab
          projectId={project.id}
          bills={bills.data ?? []}
          loading={bills.isLoading}
          error={bills.error?.message}
        />
      ) : (
        <InvoicesTab
          projectId={project.id}
          clientId={project.clientId}
          invoices={invoices.data ?? []}
          loading={invoices.isLoading}
          error={invoices.error?.message}
        />
      )}
    </div>
  );
}

// ────────────────────── summary strip ──────────────────────

function SummaryStrip({
  summary,
  fmt,
}: {
  summary: Summary;
  fmt: ReturnType<typeof useFormatters>;
}) {
  function fmtCcyList(entries: Array<[string, number]>) {
    if (entries.length === 0) return "—";
    return entries.map(([c, a]) => fmt.currency(a.toFixed(2), c)).join(" · ");
  }
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryTile
        label="Outstanding · we owe"
        value={fmtCcyList(summary.billsOutstandingByCcy)}
        meta={`${summary.billsOverdueCount} overdue`}
        tone={summary.billsOverdueCount > 0 ? "alert" : undefined}
      />
      <SummaryTile
        label="Outstanding · clients owe"
        value={fmtCcyList(summary.invoicesOutstandingByCcy)}
        meta={`${summary.invoicesOverdueCount} overdue`}
        tone={summary.invoicesOverdueCount > 0 ? "alert" : undefined}
      />
      <SummaryTile
        label="Paid to vendors"
        value={fmtCcyList(summary.billsPaidByCcy)}
        meta="total"
      />
      <SummaryTile
        label="Collected from clients"
        value={fmtCcyList(summary.invoicesPaidByCcy)}
        meta="total"
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "alert";
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {label}
      </p>
      <p
        className={`mt-2 truncate text-[20px] font-medium tnum ${tone === "alert" ? "text-rose-700" : "text-ink-900"}`}
        title={value}
      >
        {value}
      </p>
      <p
        className={`mt-1 text-[12px] ${tone === "alert" ? "text-rose-600" : "text-ink-400"}`}
      >
        {meta}
      </p>
    </div>
  );
}

// ────────────────────── tabs ──────────────────────

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative -mb-px flex items-baseline gap-2 border-b-2 px-1 pb-3 pt-1 text-[14px] font-medium transition-colors ${
        active
          ? "border-ink-900 text-ink-900"
          : "border-transparent text-ink-500 hover:text-ink-800"
      }`}
    >
      {label}
      <span
        className={`tnum text-[12px] ${active ? "text-ink-400" : "text-ink-400"}`}
      >
        {count}
      </span>
    </button>
  );
}

// ────────────────────── Bills tab ──────────────────────

function BillsTab({
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
  const [statusFilter, setStatusFilter] = useState<BillStatus | "">("");
  const [search, setSearch] = useState("");
  const fmt = useFormatters();
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return bills.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const blob = [b.billNumber, b.description, b.vendor?.name, b.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [bills, statusFilter, search]);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            Bills
          </h2>
          <p className="mt-1 text-sm text-ink-500">What we owe vendors.</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Icon name="plus" className="h-4 w-4" />
          New bill
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BillStatus | "")}
          >
            <option value="">All statuses</option>
            {(Object.keys(BILL_STATUS_LABELS) as BillStatus[]).map((s) => (
              <option key={s} value={s}>
                {BILL_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-[240px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, vendor, bill #"
            className="pl-10"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
        {loading ? (
          <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
        ) : error ? (
          <p className="px-6 py-8 text-sm text-rose-700">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-display text-xl text-ink-900">
              {search.trim() || statusFilter
                ? "No bills match these filters."
                : "No bills yet."}
            </p>
            {!search.trim() && !statusFilter && (
              <Button
                variant="primary"
                onClick={() => setAdding(true)}
                className="mt-5"
              >
                <Icon name="plus" className="h-4 w-4" />
                Add the first bill
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="border-b border-ink-100 bg-paper-50">
              <tr className="text-left">
                <Th>Description</Th>
                <Th>Vendor</Th>
                <Th align="right">Amount</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const overdue = isBillOverdue(b.status, b.dueAt) && b.dueAt && b.dueAt < today;
                return (
                  <tr
                    key={b.id}
                    className="group border-b border-ink-100 transition-colors last:border-b-0 hover:bg-paper-50"
                  >
                    <Td>
                      <Link
                        to={`/projects/${projectId}/bills/${b.id}`}
                        className="block"
                      >
                        <span className="font-medium text-ink-900">
                          {b.description || b.billNumber || "Untitled bill"}
                        </span>
                        {b.billNumber && b.description && (
                          <span className="block font-mono text-xs text-ink-500">
                            #{b.billNumber}
                          </span>
                        )}
                      </Link>
                    </Td>
                    <Td className="text-ink-600">
                      {b.vendor?.name ?? (
                        <span className="text-ink-400">Self-purchase</span>
                      )}
                    </Td>
                    <Td align="right" className="tnum text-ink-900 font-medium">
                      {fmt.currency(b.amount, b.currency)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Pill tone={BILL_TONE[b.status]} dot>
                          {BILL_STATUS_LABELS[b.status]}
                        </Pill>
                        {overdue && <Pill tone="alert">Overdue</Pill>}
                      </div>
                    </Td>
                    <Td className="tnum text-ink-600">
                      {b.dueAt ? fmt.date(b.dueAt) : "—"}
                    </Td>
                    <Td align="right">
                      <Link
                        to={`/projects/${projectId}/bills/${b.id}`}
                        aria-label="Open bill"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                      >
                        <Icon name="chevron-right" className="h-4 w-4" />
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <BillCreateModal
          projectId={projectId}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

// ────────────────────── Invoices tab ──────────────────────

function InvoicesTab({
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
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [search, setSearch] = useState("");
  const fmt = useFormatters();
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const blob = [i.invoiceNumber, i.description, i.client?.name, i.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, search]);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            Invoices
          </h2>
          <p className="mt-1 text-sm text-ink-500">What we bill clients.</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Icon name="plus" className="h-4 w-4" />
          New invoice
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as InvoiceStatus | "")
            }
          >
            <option value="">All statuses</option>
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {INVOICE_STATUS_LABELS[s]}
                </option>
              ),
            )}
          </Select>
        </div>
        <div className="relative min-w-[240px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, client, invoice #"
            className="pl-10"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
        {loading ? (
          <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
        ) : error ? (
          <p className="px-6 py-8 text-sm text-rose-700">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-display text-xl text-ink-900">
              {search.trim() || statusFilter
                ? "No invoices match these filters."
                : "No invoices yet."}
            </p>
            {!search.trim() && !statusFilter && (
              <Button
                variant="primary"
                onClick={() => setAdding(true)}
                className="mt-5"
              >
                <Icon name="plus" className="h-4 w-4" />
                Draft the first invoice
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="border-b border-ink-100 bg-paper-50">
              <tr className="text-left">
                <Th>Description</Th>
                <Th>Client</Th>
                <Th align="right">Amount</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const overdue =
                  isInvoiceOverdue(i.status, i.dueAt) && i.dueAt && i.dueAt < today;
                return (
                  <tr
                    key={i.id}
                    className="group border-b border-ink-100 transition-colors last:border-b-0 hover:bg-paper-50"
                  >
                    <Td>
                      <Link
                        to={`/projects/${projectId}/invoices/${i.id}`}
                        className="block"
                      >
                        <span className="font-medium text-ink-900">
                          {i.description || i.invoiceNumber || "Untitled invoice"}
                        </span>
                        {i.invoiceNumber && i.description && (
                          <span className="block font-mono text-xs text-ink-500">
                            #{i.invoiceNumber}
                          </span>
                        )}
                      </Link>
                    </Td>
                    <Td className="text-ink-600">
                      {i.client?.name ?? <span className="text-ink-400">—</span>}
                    </Td>
                    <Td align="right" className="tnum text-ink-900 font-medium">
                      {fmt.currency(i.amount, i.currency)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Pill tone={INVOICE_TONE[i.status]} dot>
                          {INVOICE_STATUS_LABELS[i.status]}
                        </Pill>
                        {overdue && <Pill tone="alert">Overdue</Pill>}
                      </div>
                    </Td>
                    <Td className="tnum text-ink-600">
                      {i.dueAt ? fmt.date(i.dueAt) : "—"}
                    </Td>
                    <Td align="right">
                      <Link
                        to={`/projects/${projectId}/invoices/${i.id}`}
                        aria-label="Open invoice"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                      >
                        <Icon name="chevron-right" className="h-4 w-4" />
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <InvoiceCreateModal
          projectId={projectId}
          defaultClientId={clientId ?? ""}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

// ────────────────────── table primitives ──────────────────────

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
      className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}

// ────────────────────── create modals ──────────────────────

function BillCreateModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const vendorsQ = trpc.vendors.list.useQuery({ status: "active" });
  const [vendorId, setVendorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [issuedAt, setIssuedAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [status, setStatus] = useState<BillStatus>("open");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.bills.create.useMutation({
    onSuccess: () => {
      utils.bills.list.invalidate({ projectId });
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
    create.mutate({
      projectId,
      vendorId: vendorId || undefined,
      billNumber: billNumber.trim() || undefined,
      description: description.trim() || undefined,
      amount: amount.trim(),
      currency: currency.trim(),
      issuedAt: issuedAt || undefined,
      dueAt: dueAt || undefined,
      paidAt: paidAt || undefined,
      status,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Modal
      title="New bill"
      subtitle="A vendor invoice you've received."
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
              form="bill-create-form"
              variant="primary"
              disabled={create.isPending}
            >
              {create.isPending ? "Saving…" : "Add bill"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="bill-create-form"
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
                {BILL_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Issued">
          <Input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </Field>
        <Field label="Due">
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label="Paid">
          <Input
            type="date"
            value={paidAt}
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

function InvoiceCreateModal({
  projectId,
  defaultClientId,
  onClose,
}: {
  projectId: string;
  defaultClientId: string;
  onClose: () => void;
}) {
  const clientsQ = trpc.clients.list.useQuery({ status: "active" });
  const [clientId, setClientId] = useState(defaultClientId);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [issuedAt, setIssuedAt] = useState("");
  const [sentAt, setSentAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.invoices.create.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate({ projectId });
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
    create.mutate({
      projectId,
      clientId: clientId || undefined,
      invoiceNumber: invoiceNumber.trim() || undefined,
      description: description.trim() || undefined,
      amount: amount.trim(),
      currency: currency.trim(),
      issuedAt: issuedAt || undefined,
      sentAt: sentAt || undefined,
      dueAt: dueAt || undefined,
      paidAt: paidAt || undefined,
      status,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Modal
      title="New invoice"
      subtitle="What you're billing the client."
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
              form="invoice-create-form"
              variant="primary"
              disabled={create.isPending}
            >
              {create.isPending ? "Saving…" : "Add invoice"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="invoice-create-form"
        onSubmit={onSubmit}
        className="grid gap-5 sm:grid-cols-2"
      >
        <Field label="Description" wide>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
            placeholder="Progress invoice #3 — kitchen rough-in complete"
          />
        </Field>
        <Field label="Client" hint="Optional">
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">— None</option>
            {clientsQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Invoice number">
          <Input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="INV-2026-0001"
          />
        </Field>
        <Field label="Amount" required wide>
          <MoneyInput
            amount={amount}
            currency={currency}
            onAmountChange={setAmount}
            onCurrencyChange={setCurrency}
            placeholder="25,000.00"
            required
          />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
          >
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {INVOICE_STATUS_LABELS[s]}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label="Issued">
          <Input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </Field>
        <Field label="Sent">
          <Input
            type="date"
            value={sentAt}
            onChange={(e) => setSentAt(e.target.value)}
          />
        </Field>
        <Field label="Due">
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label="Paid">
          <Input
            type="date"
            value={paidAt}
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
