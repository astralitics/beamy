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
import { DocumentIntake } from "../../components/document-intake";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type BillRow = inferRouterOutputs<AppRouter>["bills"]["list"][number];
type InvoiceRow = inferRouterOutputs<AppRouter>["invoices"]["list"][number];
type ProposalRow = inferRouterOutputs<AppRouter>["proposals"]["list"][number];

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
  const [searchParams] = useSearchParams();
  // The sidebar splits Money into two phases. The proposal phase shows
  // receivables from accepted proposals; everything else is the live
  // bills/invoices ledger.
  if (searchParams.get("phase") === "proposal") {
    return <ProposalMoney project={project} />;
  }
  return <ExecutionMoney project={project} />;
}

function ExecutionMoney({ project }: { project: ProjectDetail }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get("tab") ?? "bills") as Tab;
  const [tab, setTab] = useState<Tab>(
    tabFromUrl === "invoices" ? "invoices" : "bills",
  );
  const fmt = useFormatters();
  const t = useT();

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

      <div className="border-b border-border-subtle">
        <nav className="-mb-px flex items-center gap-6">
          <TabButton
            active={tab === "bills"}
            onClick={() => selectTab("bills")}
            label={t("money.tab.bills")}
            count={bills.data?.length ?? 0}
          />
          <TabButton
            active={tab === "invoices"}
            onClick={() => selectTab("invoices")}
            label={t("money.tab.invoices")}
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

// ────────────────────── proposal phase (receivables) ──────────────────────

/**
 * Money · proposal phase — receivables born from accepted proposals.
 * Each accepted proposal auto-creates a draft invoice (the AR) linked
 * by `proposalId`; we join them here so the firm sees, per proposal,
 * the accepted value and where its receivable stands.
 */
function ProposalMoney({ project }: { project: ProjectDetail }) {
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
  const proposalsQ = trpc.proposals.list.useQuery({
    projectId: project.id,
    status: "accepted",
  });
  const invoicesQ = trpc.invoices.list.useQuery({ projectId: project.id });

  const proposals = useMemo(() => proposalsQ.data ?? [], [proposalsQ.data]);
  const arByProposal = useMemo(() => {
    const m = new Map<string, InvoiceRow>();
    for (const inv of invoicesQ.data ?? []) {
      if (inv.proposalId) m.set(inv.proposalId, inv);
    }
    return m;
  }, [invoicesQ.data]);

  const summary = useMemo(() => {
    const accepted = new Map<string, number>();
    const outstanding = new Map<string, number>();
    const collected = new Map<string, number>();
    for (const p of proposals) {
      if (p.totalAmount && p.totalCurrency) {
        accepted.set(
          p.totalCurrency,
          (accepted.get(p.totalCurrency) ?? 0) + parseFloat(p.totalAmount),
        );
      }
      const ar = arByProposal.get(p.id);
      if (ar) {
        const amt = parseFloat(ar.amount);
        if (!isFinite(amt)) continue;
        if (ar.status === "paid") {
          collected.set(ar.currency, (collected.get(ar.currency) ?? 0) + amt);
        } else if (ar.status !== "void") {
          outstanding.set(
            ar.currency,
            (outstanding.get(ar.currency) ?? 0) + amt,
          );
        }
      }
    }
    return {
      accepted: [...accepted.entries()],
      outstanding: [...outstanding.entries()],
      collected: [...collected.entries()],
    };
  }, [proposals, arByProposal]);

  function fmtCcyList(entries: Array<[string, number]>) {
    if (entries.length === 0) return "—";
    return entries.map(([c, a]) => fmt.currency(a.toFixed(2), c)).join(" · ");
  }

  return (
    <div className="space-y-10 animate-fade">
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
        <SummaryTile
          label={t("money.proposal.tile_accepted")}
          value={fmtCcyList(summary.accepted)}
          meta={t("money.summary.total")}
        />
        <SummaryTile
          label={t("money.proposal.tile_outstanding")}
          value={fmtCcyList(summary.outstanding)}
          meta={t("money.summary.total")}
        />
        <SummaryTile
          label={t("money.proposal.tile_collected")}
          value={fmtCcyList(summary.collected)}
          meta={t("money.summary.total")}
        />
      </div>

      <section>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">
            {t("money.proposal.title")}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {t("money.proposal.lede")}
          </p>
        </div>

        {proposalsQ.isLoading ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-text-muted">
            {t("common.loading")}
          </div>
        ) : proposalsQ.error ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-danger">
            {proposalsQ.error.message}
          </div>
        ) : proposals.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
            <p className="font-display text-xl text-text">
              {t("money.proposal.empty")}
            </p>
          </div>
        ) : (
          <div className="data-table mt-6">
            <table>
              <thead>
                <tr>
                  <Th>{t("money.proposal.col.proposal")}</Th>
                  <Th align="right">{t("col.amount")}</Th>
                  <Th>{t("money.proposal.col.receivable")}</Th>
                  <Th>{t("money.proposal.col.accepted")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => {
                  const ar = arByProposal.get(p.id);
                  return (
                    <tr key={p.id} className="group">
                      <Td>
                        <Link
                          to={`/projects/${project.id}/proposals/${p.id}`}
                          className="block"
                        >
                          <span className="font-medium text-text">
                            {p.title}
                          </span>
                          <span className="block font-mono text-xs text-text-muted">
                            {p.number}
                          </span>
                        </Link>
                      </Td>
                      <Td align="right" className="tnum font-medium text-text">
                        {p.totalAmount && p.totalCurrency
                          ? fmt.currency(p.totalAmount, p.totalCurrency)
                          : "—"}
                      </Td>
                      <Td>
                        {ar ? (
                          <Pill tone={INVOICE_TONE[ar.status]} dot>
                            {L.invoiceStatus(ar.status)}
                          </Pill>
                        ) : (
                          <span className="text-text-faint">
                            {t("money.proposal.ar_none")}
                          </span>
                        )}
                      </Td>
                      <Td className="tnum text-text-muted">
                        {p.decidedAt ? fmt.date(p.decidedAt) : "—"}
                      </Td>
                      <Td align="right">
                        {ar && (
                          <Link
                            to={`/projects/${project.id}/invoices/${ar.id}`}
                            aria-label={t("invoice.open")}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-text-faint transition-colors hover:bg-bg-subtle hover:text-text"
                          >
                            <Icon name="chevron-right" className="h-4 w-4" />
                          </Link>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
  const t = useT();
  function fmtCcyList(entries: Array<[string, number]>) {
    if (entries.length === 0) return "—";
    return entries.map(([c, a]) => fmt.currency(a.toFixed(2), c)).join(" · ");
  }
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      <SummaryTile
        label={t("money.summary.outstanding_we_owe")}
        value={fmtCcyList(summary.billsOutstandingByCcy)}
        meta={`${summary.billsOverdueCount} ${t("money.summary.overdue_suffix")}`}
        tone={summary.billsOverdueCount > 0 ? "alert" : undefined}
      />
      <SummaryTile
        label={t("money.summary.outstanding_clients_owe")}
        value={fmtCcyList(summary.invoicesOutstandingByCcy)}
        meta={`${summary.invoicesOverdueCount} ${t("money.summary.overdue_suffix")}`}
        tone={summary.invoicesOverdueCount > 0 ? "alert" : undefined}
      />
      <SummaryTile
        label={t("money.summary.paid_to_vendors")}
        value={fmtCcyList(summary.billsPaidByCcy)}
        meta={t("money.summary.total")}
      />
      <SummaryTile
        label={t("money.summary.collected_from_clients")}
        value={fmtCcyList(summary.invoicesPaidByCcy)}
        meta={t("money.summary.total")}
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
    <div className="bg-surface px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-faint">
        {label}
      </p>
      <p
        className={`mt-2 truncate text-[20px] font-medium tnum ${tone === "alert" ? "text-danger" : "text-text"}`}
        title={value}
      >
        {value}
      </p>
      <p
        className={`mt-1 text-[12px] ${tone === "alert" ? "text-danger" : "text-text-faint"}`}
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
          ? "border-accent text-text"
          : "border-transparent text-text-muted hover:text-text"
      }`}
    >
      {label}
      <span
        className={`tnum text-[12px] ${active ? "text-text-faint" : "text-text-faint"}`}
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
  const [importing, setImporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BillStatus | "">("");
  const [search, setSearch] = useState("");
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
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
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">
            {t("money.bills.title")}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{t("money.bills.lede")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setImporting(true)}>
            {t("intake.bill.button")}
          </Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Icon name="plus" className="h-4 w-4" />
            {t("money.bills.new")}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BillStatus | "")}
          >
            <option value="">{t("money.filter.all_statuses")}</option>
            {(Object.keys(BILL_STATUS_LABELS) as BillStatus[]).map((s) => (
              <option key={s} value={s}>
                {L.billStatus(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-[240px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("money.bills.search")}
            className="pl-10"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-text-muted">
          {t("common.loading")}
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-danger">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <p className="font-display text-xl text-text">
            {search.trim() || statusFilter
              ? t("money.bills.empty_filtered")
              : t("money.bills.empty")}
          </p>
          {!search.trim() && !statusFilter && (
            <Button
              variant="primary"
              onClick={() => setAdding(true)}
              className="mt-5"
            >
              <Icon name="plus" className="h-4 w-4" />
              {t("money.bills.add_first")}
            </Button>
          )}
        </div>
      ) : (
        <div className="data-table mt-4">
          <table>
            <thead>
              <tr>
                <Th>{t("col.description")}</Th>
                <Th>{t("col.vendor")}</Th>
                <Th align="right">{t("col.amount")}</Th>
                <Th>{t("col.status")}</Th>
                <Th>{t("col.due")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const overdue = isBillOverdue(b.status, b.dueAt) && b.dueAt && b.dueAt < today;
                return (
                  <tr key={b.id} className="group">
                    <Td>
                      <Link
                        to={`/projects/${projectId}/bills/${b.id}`}
                        className="block"
                      >
                        <span className="font-medium text-text">
                          {b.description || b.billNumber || t("bill.untitled")}
                        </span>
                        {b.billNumber && b.description && (
                          <span className="block font-mono text-xs text-text-muted">
                            #{b.billNumber}
                          </span>
                        )}
                      </Link>
                    </Td>
                    <Td className="text-text-muted">
                      {b.vendor?.name ?? (
                        <span className="text-text-faint">
                          {t("money.bills.self_purchase")}
                        </span>
                      )}
                    </Td>
                    <Td align="right" className="tnum text-text font-medium">
                      {fmt.currency(b.amount, b.currency)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Pill tone={BILL_TONE[b.status]} dot>
                          {L.billStatus(b.status)}
                        </Pill>
                        {overdue && <Pill tone="alert">{t("common.overdue")}</Pill>}
                      </div>
                    </Td>
                    <Td className="tnum text-text-muted">
                      {b.dueAt ? fmt.date(b.dueAt) : "—"}
                    </Td>
                    <Td align="right">
                      <Link
                        to={`/projects/${projectId}/bills/${b.id}`}
                        aria-label={t("bill.open")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-text-faint transition-colors hover:bg-bg-subtle hover:text-text"
                      >
                        <Icon name="chevron-right" className="h-4 w-4" />
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <BillCreateModal
          projectId={projectId}
          onClose={() => setAdding(false)}
        />
      )}
      {importing && (
        <DocumentIntake
          kind="bill"
          projectId={projectId}
          onClose={() => setImporting(false)}
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
  const L = useLabels();
  const t = useT();
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
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">
            {t("money.invoices.title")}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{t("money.invoices.lede")}</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Icon name="plus" className="h-4 w-4" />
          {t("money.invoices.new")}
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
            <option value="">{t("money.filter.all_statuses")}</option>
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {L.invoiceStatus(s)}
                </option>
              ),
            )}
          </Select>
        </div>
        <div className="relative min-w-[240px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("money.invoices.search")}
            className="pl-10"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-text-muted">
          {t("common.loading")}
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-danger">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <p className="font-display text-xl text-text">
            {search.trim() || statusFilter
              ? t("money.invoices.empty_filtered")
              : t("money.invoices.empty")}
          </p>
          {!search.trim() && !statusFilter && (
            <Button
              variant="primary"
              onClick={() => setAdding(true)}
              className="mt-5"
            >
              <Icon name="plus" className="h-4 w-4" />
              {t("money.invoices.draft_first")}
            </Button>
          )}
        </div>
      ) : (
        <div className="data-table mt-4">
          <table>
            <thead>
              <tr>
                <Th>{t("col.description")}</Th>
                <Th>{t("col.client")}</Th>
                <Th align="right">{t("col.amount")}</Th>
                <Th>{t("col.status")}</Th>
                <Th>{t("col.due")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const overdue =
                  isInvoiceOverdue(i.status, i.dueAt) && i.dueAt && i.dueAt < today;
                return (
                  <tr key={i.id} className="group">
                    <Td>
                      <Link
                        to={`/projects/${projectId}/invoices/${i.id}`}
                        className="block"
                      >
                        <span className="font-medium text-text">
                          {i.description || i.invoiceNumber || t("invoice.untitled")}
                        </span>
                        {i.invoiceNumber && i.description && (
                          <span className="block font-mono text-xs text-text-muted">
                            #{i.invoiceNumber}
                          </span>
                        )}
                      </Link>
                    </Td>
                    <Td className="text-text-muted">
                      {i.client?.name ?? <span className="text-text-faint">—</span>}
                    </Td>
                    <Td align="right" className="tnum text-text font-medium">
                      {fmt.currency(i.amount, i.currency)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Pill tone={INVOICE_TONE[i.status]} dot>
                          {L.invoiceStatus(i.status)}
                        </Pill>
                        {overdue && <Pill tone="alert">{t("common.overdue")}</Pill>}
                      </div>
                    </Td>
                    <Td className="tnum text-text-muted">
                      {i.dueAt ? fmt.date(i.dueAt) : "—"}
                    </Td>
                    <Td align="right">
                      <Link
                        to={`/projects/${projectId}/invoices/${i.id}`}
                        aria-label={t("invoice.open")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-text-faint transition-colors hover:bg-bg-subtle hover:text-text"
                      >
                        <Icon name="chevron-right" className="h-4 w-4" />
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
  return <th className={align === "right" ? "r" : ""}>{children}</th>;
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
    <td className={`${align === "right" ? "r" : ""} ${className}`}>
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
  const L = useLabels();
  const t = useT();
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
      setError(t("money.error.amount_currency_required"));
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
      title={t("money.bills.new")}
      subtitle={t("bill.create_subtitle")}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-danger">{error}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="bill-create-form"
              variant="primary"
              disabled={create.isPending}
            >
              {create.isPending ? t("common.saving") : t("bill.add")}
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
        <Field label={t("col.description")} wide>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
            placeholder={t("bill.ph.description")}
          />
        </Field>
        <Field label={t("col.vendor")} hint={t("common.optional")}>
          <Select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">{t("bill.opt.no_vendor")}</option>
            {vendorsQ.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("bill.field.number")} hint={t("bill.hint.number")}>
          <Input
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            placeholder="INV-12345"
          />
        </Field>
        <Field label={t("col.amount")} required wide>
          <MoneyInput
            amount={amount}
            currency={currency}
            onAmountChange={setAmount}
            onCurrencyChange={setCurrency}
            placeholder="3,500.00"
            required
          />
        </Field>
        <Field label={t("col.status")}>
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
        <Field label={t("bill.field.issued")}>
          <Input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </Field>
        <Field label={t("col.due")}>
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label={t("bill.field.paid")}>
          <Input
            type="date"
            value={paidAt}
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
  const L = useLabels();
  const t = useT();
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
      setError(t("money.error.amount_currency_required"));
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
      title={t("money.invoices.new")}
      subtitle={t("invoice.create_subtitle")}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-danger">{error}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="invoice-create-form"
              variant="primary"
              disabled={create.isPending}
            >
              {create.isPending ? t("common.saving") : t("invoice.add")}
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
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
        </Field>
        <Field label={t("invoice.field.sent")}>
          <Input
            type="date"
            value={sentAt}
            onChange={(e) => setSentAt(e.target.value)}
          />
        </Field>
        <Field label={t("col.due")}>
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </Field>
        <Field label={t("invoice.field.paid")}>
          <Input
            type="date"
            value={paidAt}
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
