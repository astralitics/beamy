import { useState, type FormEvent, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  SUGGESTED_TRADES,
  type ComplianceDocType,
  type VendorStatus,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { ContactsSection } from "../components/contacts-section";
import { ConfirmDialog } from "../components/ui";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type VendorRow = RouterOutputs["vendors"]["list"][number];
type ComplianceRow = RouterOutputs["vendors"]["listCompliance"][number];

type StatusFilter = VendorStatus | "all";
type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; vendor: VendorRow };

const DOC_TYPE_LABELS: Record<ComplianceDocType, string> = {
  w9: "W-9",
  coi_general: "COI · General Liability",
  coi_workers_comp: "COI · Workers Comp",
  license: "License",
  business_license: "Business License",
  other: "Other",
};

export default function VendorsPage() {
  const t = useT();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [tradeFilter, setTradeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [modalState, setModalState] = useState<ModalState>({ mode: "closed" });

  const list = trpc.vendors.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    trade: tradeFilter || undefined,
    search: search.trim() || undefined,
  });

  return (
    <div className="mx-auto max-w-6xl p-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("nav.vendors")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t("vendors.lede")}</p>
        </div>
        <button
          onClick={() => setModalState({ mode: "create" })}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {t("vendors.new")}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className={selectCls}
        >
          <option value="active">{t("vendors.filter.active")}</option>
          <option value="archived">{t("vendors.filter.archived")}</option>
          <option value="all">{t("vendors.filter.all")}</option>
        </select>
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("vendors.all_trades")}</option>
          {SUGGESTED_TRADES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("vendors.search")}
          className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.isLoading ? (
          <p className="p-6 text-sm text-slate-500">{t("common.loading")}</p>
        ) : list.error ? (
          <p className="p-6 text-sm text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {search.trim() || tradeFilter
              ? t("vendors.empty_filtered")
              : statusFilter === "archived"
                ? t("vendors.empty_archived")
                : t("vendors.empty")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>{t("col.name")}</Th>
                <Th>{t("vendors.col.trade")}</Th>
                <Th>{t("vendors.col.primary_contact")}</Th>
                <Th className="w-32">{t("vendors.col.default_rate")}</Th>
                <Th className="w-24">{t("col.status")}</Th>
                <Th className="w-28">{t("col.updated")}</Th>
                <Th className="w-24 text-right">{t("vendors.col.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((v) => (
                <tr
                  key={v.id}
                  className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  onClick={() => setModalState({ mode: "edit", vendor: v })}
                >
                  <Td className="font-medium text-slate-900">{v.name}</Td>
                  <Td className="text-slate-600">
                    {v.trade.replace(/_/g, " ")}
                  </Td>
                  <Td className="text-slate-600">{v.primaryContact ?? "—"}</Td>
                  <Td className="text-slate-600">
                    {v.defaultRateAmount && v.defaultRateCurrency
                      ? `${v.defaultRateAmount} ${v.defaultRateCurrency}/${v.billingUnit}`
                      : "—"}
                  </Td>
                  <Td>
                    <StatusPill status={v.status} />
                  </Td>
                  <Td className="text-slate-500">
                    {new Date(v.updatedAt).toLocaleDateString()}
                  </Td>
                  <Td className="text-right">
                    <RowActions vendor={v} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalState.mode !== "closed" && (
        <VendorFormModal
          state={modalState}
          onClose={() => setModalState({ mode: "closed" })}
        />
      )}
    </div>
  );
}

// ────────────────────── table helpers ──────────────────────

function Th({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function StatusPill({ status }: { status: VendorStatus }) {
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

function RowActions({ vendor }: { vendor: VendorRow }) {
  const t = useT();
  const utils = trpc.useUtils();
  const archive = trpc.vendors.archive.useMutation({
    onSuccess: () => utils.vendors.list.invalidate(),
  });
  const restore = trpc.vendors.restore.useMutation({
    onSuccess: () => utils.vendors.list.invalidate(),
  });
  const pending = archive.isPending || restore.isPending;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (vendor.status === "active") {
          archive.mutate({ id: vendor.id });
        } else {
          restore.mutate({ id: vendor.id });
        }
      }}
      disabled={pending}
      className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
    >
      {pending
        ? "…"
        : vendor.status === "active"
          ? t("vendors.archive")
          : t("vendors.restore")}
    </button>
  );
}

// ────────────────────── vendor modal ──────────────────────

function VendorFormModal({
  state,
  onClose,
}: {
  state: { mode: "create" } | { mode: "edit"; vendor: VendorRow };
  onClose: () => void;
}) {
  const t = useT();
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.vendor : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [trade, setTrade] = useState(initial?.trade ?? "");
  const [primaryContact, setPrimaryContact] = useState(
    initial?.primaryContact ?? "",
  );
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [defaultRateAmount, setDefaultRateAmount] = useState(
    initial?.defaultRateAmount ?? "",
  );
  const [defaultRateCurrency, setDefaultRateCurrency] = useState(
    initial?.defaultRateCurrency ?? "USD",
  );
  const [billingUnit, setBillingUnit] = useState(initial?.billingUnit ?? "hour");
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? "");
  const [ein, setEin] = useState(initial?.ein ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tagsRaw, setTagsRaw] = useState(initial?.tags?.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.vendors.create.useMutation({
    onSuccess: () => {
      utils.vendors.list.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.vendors.update.useMutation({
    onSuccess: () => {
      utils.vendors.list.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const submitting = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const rateAmt = defaultRateAmount.trim();
    const rateCur = defaultRateCurrency.trim();
    if ((rateAmt && !rateCur) || (!rateAmt && rateCur)) {
      setError(t("vendors.err_rate_pair"));
      return;
    }
    const payload = {
      name: name.trim(),
      trade: trade.trim(),
      primaryContact: primaryContact.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      defaultRateAmount: rateAmt || undefined,
      defaultRateCurrency: rateAmt ? rateCur : undefined,
      billingUnit,
      paymentTerms: paymentTerms.trim() || undefined,
      ein: ein.trim() || undefined,
      notes: notes.trim() || undefined,
      tags,
    };
    if (isEdit) {
      update.mutate({ id: state.vendor.id, patch: payload });
    } else {
      create.mutate(payload);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-lg bg-white shadow-xl"
      >
        <form onSubmit={onSubmit} className="p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            {isEdit
              ? t("vendors.edit_title", { name: state.vendor.name })
              : t("vendors.new_title")}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={t("vendors.field.name")}>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                autoFocus
              />
            </Field>
            <Field label={t("vendors.field.trade")}>
              <input
                required
                list="trade-suggestions"
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                className={inputCls}
                placeholder={t("vendors.field.trade_ph")}
              />
              <datalist id="trade-suggestions">
                {SUGGESTED_TRADES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label={t("vendors.field.primary_contact")}>
              <input
                value={primaryContact}
                onChange={(e) => setPrimaryContact(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={t("vendors.field.email")}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={t("vendors.field.phone")}>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={t("vendors.field.ein")}>
              <input
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                className={inputCls}
                placeholder="XX-XXXXXXX"
              />
            </Field>
            <Field label={t("col.address")} wide>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={t("vendors.field.default_rate")}>
              <div className="flex gap-2">
                <input
                  value={defaultRateAmount}
                  onChange={(e) => setDefaultRateAmount(e.target.value)}
                  className={`${inputCls} flex-1`}
                  placeholder="125.00"
                  inputMode="decimal"
                />
                <input
                  value={defaultRateCurrency}
                  onChange={(e) =>
                    setDefaultRateCurrency(e.target.value.toUpperCase())
                  }
                  className={`${inputCls} w-16 uppercase`}
                  placeholder="USD"
                  maxLength={3}
                />
              </div>
            </Field>
            <Field label={t("vendors.field.billing_unit")}>
              <select
                value={billingUnit}
                onChange={(e) =>
                  setBillingUnit(
                    e.target.value as typeof billingUnit,
                  )
                }
                className={selectCls}
              >
                <option value="hour">{t("vendors.unit.hour")}</option>
                <option value="day">{t("vendors.unit.day")}</option>
                <option value="project">{t("vendors.unit.project")}</option>
                <option value="retainer">{t("vendors.unit.retainer")}</option>
                <option value="unit">{t("vendors.unit.unit")}</option>
              </select>
            </Field>
            <Field label={t("vendors.field.payment_terms")} wide>
              <input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className={inputCls}
                placeholder={t("vendors.field.payment_terms_ph")}
              />
            </Field>
            <Field label={t("vendors.field.tags")} wide>
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                className={inputCls}
                placeholder="preferred, residential"
              />
            </Field>
            <Field label={t("vendors.field.notes")} wide>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting
                ? t("common.saving")
                : isEdit
                  ? t("common.save")
                  : t("common.create")}
            </button>
          </div>
        </form>

        {isEdit && (
          <>
            <VendorContactsWrapper vendorId={state.vendor.id} />
            <ComplianceSection vendorId={state.vendor.id} />
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────── contacts section wrapper ──────────────────────

function VendorContactsWrapper({ vendorId }: { vendorId: string }) {
  const utils = trpc.useUtils();
  const list = trpc.vendors.listContacts.useQuery({ vendorId });
  const add = trpc.vendors.addContact.useMutation({
    onSuccess: () => utils.vendors.listContacts.invalidate({ vendorId }),
  });
  const update = trpc.vendors.updateContact.useMutation({
    onSuccess: () => utils.vendors.listContacts.invalidate({ vendorId }),
  });
  const remove = trpc.vendors.removeContact.useMutation({
    onSuccess: () => utils.vendors.listContacts.invalidate({ vendorId }),
  });

  return (
    <ContactsSection
      contacts={list.data}
      isLoading={list.isLoading}
      onAdd={(data) => add.mutate({ vendorId, ...data })}
      onUpdate={(id, patch) => update.mutate({ id, patch })}
      onRemove={(id) => remove.mutate({ id })}
      removingId={remove.isPending ? remove.variables?.id ?? null : null}
      addPending={add.isPending}
      updatePending={update.isPending}
    />
  );
}

// ────────────────────── compliance section ──────────────────────

function ComplianceSection({ vendorId }: { vendorId: string }) {
  const t = useT();
  const list = trpc.vendors.listCompliance.useQuery({ vendorId });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ComplianceRow | null>(null);

  return (
    <div className="border-t border-slate-200 bg-slate-50/50 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">
            {t("vendors.compliance.title")}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {t("vendors.compliance.lede")}
          </p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
          >
            {t("vendors.compliance.add")}
          </button>
        )}
      </div>

      {adding && (
        <ComplianceForm
          vendorId={vendorId}
          mode="create"
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <ComplianceForm
          vendorId={vendorId}
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mt-4 space-y-2">
        {list.isLoading ? (
          <p className="text-xs text-slate-500">{t("common.loading")}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="text-xs text-slate-500">
            {t("vendors.compliance.empty")}
          </p>
        ) : (
          list.data.map((c) => (
            <ComplianceRowItem
              key={c.id}
              compliance={c}
              onEdit={() => setEditing(c)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ComplianceRowItem({
  compliance,
  onEdit,
}: {
  compliance: ComplianceRow;
  onEdit: () => void;
}) {
  const t = useT();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const utils = trpc.useUtils();
  const remove = trpc.vendors.removeCompliance.useMutation({
    onSuccess: () => utils.vendors.listCompliance.invalidate(),
  });

  const expStatus = computeExpirationStatus(compliance.expiresAt);

  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">
            {DOC_TYPE_LABELS[compliance.docType]}
          </span>
          <ExpirationPill status={expStatus} />
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {compliance.effectiveFrom && (
            <>{t("vendors.compliance.from", { date: compliance.effectiveFrom })} · </>
          )}
          {compliance.expiresAt
            ? t("vendors.compliance.expires", { date: compliance.expiresAt })
            : t("vendors.compliance.no_expiration")}
          {compliance.coverageAmount && compliance.coverageCurrency && (
            <>
              {" · "}
              {t("vendors.compliance.coverage", {
                amount: compliance.coverageAmount,
                currency: compliance.coverageCurrency,
              })}
            </>
          )}
        </div>
        {compliance.notes && (
          <div className="mt-1 text-xs text-slate-600">{compliance.notes}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-slate-500 hover:text-slate-900"
      >
        {t("common.edit")}
      </button>
      <button
        type="button"
        onClick={() => setConfirmingRemove(true)}
        disabled={remove.isPending}
        className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
      >
        {remove.isPending ? "…" : t("common.remove")}
      </button>
      {confirmingRemove && (
        <ConfirmDialog
          title={t("vendors.compliance.remove_title")}
          message={t("vendors.compliance.remove_confirm")}
          confirmLabel={t("common.remove")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={remove.isPending}
          error={remove.error?.message}
          onConfirm={() => remove.mutate({ id: compliance.id })}
          onClose={() => setConfirmingRemove(false)}
        />
      )}
    </div>
  );
}

function ComplianceForm({
  vendorId,
  mode,
  existing,
  onClose,
}: {
  vendorId: string;
  mode: "create" | "edit";
  existing?: ComplianceRow;
  onClose: () => void;
}) {
  const t = useT();
  const [docType, setDocType] = useState<ComplianceDocType>(
    existing?.docType ?? "w9",
  );
  const [effectiveFrom, setEffectiveFrom] = useState(
    existing?.effectiveFrom ?? "",
  );
  const [expiresAt, setExpiresAt] = useState(existing?.expiresAt ?? "");
  const [coverageAmount, setCoverageAmount] = useState(
    existing?.coverageAmount ?? "",
  );
  const [coverageCurrency, setCoverageCurrency] = useState(
    existing?.coverageCurrency ?? "USD",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const add = trpc.vendors.addCompliance.useMutation({
    onSuccess: () => {
      utils.vendors.listCompliance.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const upd = trpc.vendors.updateCompliance.useMutation({
    onSuccess: () => {
      utils.vendors.listCompliance.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const submitting = add.isPending || upd.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = coverageAmount.trim();
    const cur = coverageCurrency.trim();
    if ((amt && !cur) || (!amt && cur)) {
      setError(t("vendors.compliance.err_coverage_pair"));
      return;
    }
    const base = {
      docType,
      effectiveFrom: effectiveFrom || undefined,
      expiresAt: expiresAt || undefined,
      coverageAmount: amt || undefined,
      coverageCurrency: amt ? cur : undefined,
      notes: notes.trim() || undefined,
    };
    if (mode === "edit" && existing) {
      upd.mutate({ id: existing.id, patch: base });
    } else {
      add.mutate({ vendorId, ...base });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 rounded-md border border-slate-200 bg-white p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t("vendors.compliance.field.doc_type")}>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as ComplianceDocType)}
            className={selectCls}
          >
            {(Object.keys(DOC_TYPE_LABELS) as ComplianceDocType[]).map((k) => (
              <option key={k} value={k}>
                {DOC_TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <div />
        <Field label={t("vendors.compliance.field.effective_from")}>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={t("vendors.compliance.field.expires_at")}>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={t("vendors.compliance.field.coverage_amount")}>
          <div className="flex gap-2">
            <input
              value={coverageAmount}
              onChange={(e) => setCoverageAmount(e.target.value)}
              className={`${inputCls} flex-1`}
              placeholder="1000000.00"
              inputMode="decimal"
            />
            <input
              value={coverageCurrency}
              onChange={(e) =>
                setCoverageCurrency(e.target.value.toUpperCase())
              }
              className={`${inputCls} w-16 uppercase`}
              maxLength={3}
            />
          </div>
        </Field>
        <Field label={t("vendors.field.notes")} wide>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
            placeholder={t("vendors.compliance.field.notes_ph")}
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
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

// ────────────────────── expiration helpers ──────────────────────

type ExpirationStatus = "active" | "expiring_soon" | "expired" | "none";

function computeExpirationStatus(expiresAt: string | null): ExpirationStatus {
  if (!expiresAt) return "none";
  const now = new Date();
  const exp = new Date(expiresAt);
  const days = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "active";
}

function ExpirationPill({ status }: { status: ExpirationStatus }) {
  if (status === "none") {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
        no expiry
      </span>
    );
  }
  const map: Record<Exclude<ExpirationStatus, "none">, [string, string]> = {
    active: ["bg-emerald-100 text-emerald-800", "active"],
    expiring_soon: ["bg-amber-100 text-amber-800", "expiring soon"],
    expired: ["bg-rose-100 text-rose-800", "expired"],
  };
  const [cls, label] = map[status];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

// ────────────────────── shared form primitives ──────────────────────

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

const selectCls =
  "block w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

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
