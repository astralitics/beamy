import { useState, type FormEvent } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  TRADES_BY_VERTICAL,
  type ComplianceDocType,
  type VendorStatus,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { useVertical } from "../lib/vertical";
import { ContactsSection } from "../components/contacts-section";
import { EmptyState } from "../components/vertical-mark";
import {
  Button,
  ConfirmDialog,
  Field,
  Icon,
  Input,
  Modal,
  PageHeader,
  Pill,
  Select,
  Textarea,
} from "../components/ui";

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
  const vertical = useVertical();
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
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-10 lg:py-14">
      <PageHeader
        title={t("nav.vendors")}
        lede={t("vendors.lede")}
        action={
          <Button
            variant="primary"
            onClick={() => setModalState({ mode: "create" })}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("vendors.new")}
          </Button>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="active">{t("vendors.filter.active")}</option>
            <option value="archived">{t("vendors.filter.archived")}</option>
            <option value="all">{t("vendors.filter.all")}</option>
          </Select>
        </div>
        <div className="w-56">
          <Select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
          >
            <option value="">{t("vendors.all_trades")}</option>
            {TRADES_BY_VERTICAL[vertical].map((tr) => (
              <option key={tr} value={tr}>
                {tr.replace(/_/g, " ")}
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
            placeholder={t("vendors.search")}
            className="pl-10"
          />
        </div>
      </div>

      {list.isLoading ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-12 text-center text-text-muted">
          {t("common.loading")}
        </div>
      ) : list.error ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-12 text-center text-danger">
          {list.error.message}
        </div>
      ) : !list.data || list.data.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={
              search.trim() || tradeFilter
                ? t("vendors.empty_filtered")
                : statusFilter === "archived"
                  ? t("vendors.empty_archived")
                  : t("vendors.empty")
            }
          />
        </div>
      ) : (
        <div className="data-table mt-6">
          <table>
            <thead>
              <tr>
                <th>{t("col.name")}</th>
                <th>{t("vendors.col.trade")}</th>
                <th>{t("vendors.col.primary_contact")}</th>
                <th className="w-32 r">{t("vendors.col.default_rate")}</th>
                <th className="w-24">{t("col.status")}</th>
                <th className="w-28 r">{t("col.updated")}</th>
                <th className="w-24 r">{t("vendors.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((v) => (
                <tr
                  key={v.id}
                  className="clickable group"
                  onClick={() => setModalState({ mode: "edit", vendor: v })}
                >
                  <td className="font-medium">{v.name}</td>
                  <td className="text-text-muted">
                    {v.trade.replace(/_/g, " ")}
                  </td>
                  <td className="text-text-muted">{v.primaryContact ?? "—"}</td>
                  <td className="r whitespace-nowrap text-text-muted">
                    {v.defaultRateAmount && v.defaultRateCurrency
                      ? `${v.defaultRateAmount} ${v.defaultRateCurrency}/${v.billingUnit}`
                      : "—"}
                  </td>
                  <td>
                    <StatusPill status={v.status} />
                  </td>
                  <td className="r whitespace-nowrap text-text-muted">
                    {new Date(v.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="r">
                    <RowActions vendor={v} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

function StatusPill({ status }: { status: VendorStatus }) {
  return (
    <Pill tone={status === "active" ? "success" : "neutral"} dot>
      {status}
    </Pill>
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
      className="text-xs text-text-muted hover:text-text disabled:opacity-50"
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
  const vertical = useVertical();
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
    <Modal
      title={
        isEdit
          ? t("vendors.edit_title", { name: state.vendor.name })
          : t("vendors.new_title")
      }
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
              form="vendor-form"
              variant="primary"
              disabled={submitting}
            >
              {submitting
                ? t("common.saving")
                : isEdit
                  ? t("common.save")
                  : t("common.create")}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="vendor-form"
        onSubmit={onSubmit}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label={t("vendors.field.name")} required>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label={t("vendors.field.trade")} required>
          <Input
            required
            list="trade-suggestions"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            placeholder={t("vendors.field.trade_ph")}
          />
          <datalist id="trade-suggestions">
            {TRADES_BY_VERTICAL[vertical].map((tr) => (
              <option key={tr} value={tr} />
            ))}
          </datalist>
        </Field>
        <Field label={t("vendors.field.primary_contact")}>
          <Input
            value={primaryContact}
            onChange={(e) => setPrimaryContact(e.target.value)}
          />
        </Field>
        <Field label={t("vendors.field.email")}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t("vendors.field.phone")}>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label={t("vendors.field.ein")}>
          <Input
            value={ein}
            onChange={(e) => setEin(e.target.value)}
            placeholder="XX-XXXXXXX"
          />
        </Field>
        <Field label={t("col.address")} wide>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label={t("vendors.field.default_rate")}>
          <div className="flex gap-2">
            <Input
              value={defaultRateAmount}
              onChange={(e) => setDefaultRateAmount(e.target.value)}
              className="flex-1"
              placeholder="125.00"
              inputMode="decimal"
            />
            <Input
              value={defaultRateCurrency}
              onChange={(e) =>
                setDefaultRateCurrency(e.target.value.toUpperCase())
              }
              className="w-16 uppercase"
              placeholder="USD"
              maxLength={3}
            />
          </div>
        </Field>
        <Field label={t("vendors.field.billing_unit")}>
          <Select
            value={billingUnit}
            onChange={(e) =>
              setBillingUnit(e.target.value as typeof billingUnit)
            }
          >
            <option value="hour">{t("vendors.unit.hour")}</option>
            <option value="day">{t("vendors.unit.day")}</option>
            <option value="project">{t("vendors.unit.project")}</option>
            <option value="retainer">{t("vendors.unit.retainer")}</option>
            <option value="unit">{t("vendors.unit.unit")}</option>
          </Select>
        </Field>
        <Field label={t("vendors.field.payment_terms")} wide>
          <Input
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder={t("vendors.field.payment_terms_ph")}
          />
        </Field>
        <Field label={t("vendors.field.tags")} wide>
          <Input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="preferred, residential"
          />
        </Field>
        <Field label={t("vendors.field.notes")} wide>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </Field>
      </form>

      {isEdit && (
        <>
          <VendorContactsWrapper vendorId={state.vendor.id} />
          <ComplianceSection vendorId={state.vendor.id} />
        </>
      )}
    </Modal>
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
    <div className="border-t border-border bg-bg-subtle p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">
            {t("vendors.compliance.title")}
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {t("vendors.compliance.lede")}
          </p>
        </div>
        {!adding && !editing && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("vendors.compliance.add")}
          </Button>
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
          <p className="text-xs text-text-muted">{t("common.loading")}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="text-xs text-text-muted">
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
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">
            {DOC_TYPE_LABELS[compliance.docType]}
          </span>
          <ExpirationPill status={expStatus} />
        </div>
        <div className="mt-0.5 text-xs text-text-muted">
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
          <div className="mt-1 text-xs text-text-muted">{compliance.notes}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-text-muted hover:text-text"
      >
        {t("common.edit")}
      </button>
      <button
        type="button"
        onClick={() => setConfirmingRemove(true)}
        disabled={remove.isPending}
        className="text-xs text-danger hover:text-danger disabled:opacity-50"
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
      className="mt-3 rounded-xl border border-border bg-surface p-3"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("vendors.compliance.field.doc_type")}>
          <Select
            value={docType}
            onChange={(e) => setDocType(e.target.value as ComplianceDocType)}
          >
            {(Object.keys(DOC_TYPE_LABELS) as ComplianceDocType[]).map((k) => (
              <option key={k} value={k}>
                {DOC_TYPE_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <div />
        <Field label={t("vendors.compliance.field.effective_from")}>
          <Input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </Field>
        <Field label={t("vendors.compliance.field.expires_at")}>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>
        <Field label={t("vendors.compliance.field.coverage_amount")}>
          <div className="flex gap-2">
            <Input
              value={coverageAmount}
              onChange={(e) => setCoverageAmount(e.target.value)}
              className="flex-1"
              placeholder="1000000.00"
              inputMode="decimal"
            />
            <Input
              value={coverageCurrency}
              onChange={(e) =>
                setCoverageCurrency(e.target.value.toUpperCase())
              }
              className="w-16 uppercase"
              maxLength={3}
            />
          </div>
        </Field>
        <Field label={t("vendors.field.notes")} wide>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("vendors.compliance.field.notes_ph")}
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={submitting}>
          {submitting
            ? t("common.saving")
            : mode === "edit"
              ? t("common.save")
              : t("common.add")}
        </Button>
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
  const map: Record<
    ExpirationStatus,
    ["neutral" | "success" | "warn" | "alert", string]
  > = {
    none: ["neutral", "no expiry"],
    active: ["success", "active"],
    expiring_soon: ["warn", "expiring soon"],
    expired: ["alert", "expired"],
  };
  const [tone, label] = map[status];
  return (
    <Pill tone={tone} dot={status !== "none"}>
      {label}
    </Pill>
  );
}
