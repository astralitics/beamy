import { useState, type FormEvent, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import type { BillingUnit, ServiceStatus } from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";

type ServiceRow = inferRouterOutputs<AppRouter>["services"]["list"][number];
type StatusFilter = ServiceStatus | "all";
type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; service: ServiceRow };

const BILLING_UNITS: BillingUnit[] = [
  "hour",
  "day",
  "project",
  "retainer",
  "unit",
];

/** Localized "per hour" / "per day" / … label for a billing unit. */
function useBillingUnitLabel() {
  const t = useT();
  return (u: BillingUnit) => t(`services.unit.${u}` as const);
}

export default function ServicesPage() {
  const t = useT();
  const unitLabel = useBillingUnitLabel();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [modalState, setModalState] = useState<ModalState>({ mode: "closed" });

  const list = trpc.services.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search.trim() || undefined,
  });

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("nav.services")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t("services.lede")}</p>
        </div>
        <button
          onClick={() => setModalState({ mode: "create" })}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {t("services.new")}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className={selectCls}
        >
          <option value="active">{t("services.filter.active")}</option>
          <option value="archived">{t("services.filter.archived")}</option>
          <option value="all">{t("services.filter.all")}</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("services.search")}
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
            {search.trim()
              ? t("services.empty_filtered")
              : statusFilter === "archived"
                ? t("services.empty_archived")
                : t("services.empty")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>{t("col.name")}</Th>
                <Th>{t("services.col.default_rate")}</Th>
                <Th>{t("services.col.tags")}</Th>
                <Th className="w-24">{t("col.status")}</Th>
                <Th className="w-28">{t("col.updated")}</Th>
                <Th className="w-24 text-right">{t("services.col.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  onClick={() => setModalState({ mode: "edit", service: s })}
                >
                  <Td>
                    <div className="font-medium text-slate-900">{s.name}</div>
                    {s.description && (
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {s.description}
                      </div>
                    )}
                  </Td>
                  <Td className="text-slate-600">
                    {s.defaultRateAmount && s.defaultRateCurrency
                      ? `${s.defaultRateAmount} ${s.defaultRateCurrency} ${unitLabel(s.billingUnit)}`
                      : unitLabel(s.billingUnit)}
                  </Td>
                  <Td className="text-slate-600">
                    {s.tags.length > 0 ? s.tags.join(", ") : "—"}
                  </Td>
                  <Td>
                    <StatusPill status={s.status} />
                  </Td>
                  <Td className="text-slate-500">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </Td>
                  <Td className="text-right">
                    <RowActions service={s} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalState.mode !== "closed" && (
        <ServiceFormModal
          state={modalState}
          onClose={() => setModalState({ mode: "closed" })}
        />
      )}
    </div>
  );
}

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

function StatusPill({ status }: { status: ServiceStatus }) {
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

function RowActions({ service }: { service: ServiceRow }) {
  const t = useT();
  const utils = trpc.useUtils();
  const archive = trpc.services.archive.useMutation({
    onSuccess: () => utils.services.list.invalidate(),
  });
  const restore = trpc.services.restore.useMutation({
    onSuccess: () => utils.services.list.invalidate(),
  });
  const pending = archive.isPending || restore.isPending;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (service.status === "active") {
          archive.mutate({ id: service.id });
        } else {
          restore.mutate({ id: service.id });
        }
      }}
      disabled={pending}
      className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
    >
      {pending
        ? "…"
        : service.status === "active"
          ? t("services.archive")
          : t("services.restore")}
    </button>
  );
}

function ServiceFormModal({
  state,
  onClose,
}: {
  state: { mode: "create" } | { mode: "edit"; service: ServiceRow };
  onClose: () => void;
}) {
  const t = useT();
  const unitLabel = useBillingUnitLabel();
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.service : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [defaultRateAmount, setDefaultRateAmount] = useState(
    initial?.defaultRateAmount ?? "",
  );
  const [defaultRateCurrency, setDefaultRateCurrency] = useState(
    initial?.defaultRateCurrency ?? "USD",
  );
  const [billingUnit, setBillingUnit] = useState<BillingUnit>(
    initial?.billingUnit ?? "hour",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tagsRaw, setTagsRaw] = useState(initial?.tags?.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.services.create.useMutation({
    onSuccess: () => {
      utils.services.list.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.services.update.useMutation({
    onSuccess: () => {
      utils.services.list.invalidate();
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
      setError(t("services.err_rate_pair"));
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      defaultRateAmount: rateAmt || undefined,
      defaultRateCurrency: rateAmt ? rateCur : undefined,
      billingUnit,
      notes: notes.trim() || undefined,
      tags,
    };
    if (isEdit) {
      update.mutate({ id: state.service.id, patch: payload });
    } else {
      create.mutate(payload);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold tracking-tight">
          {isEdit ? t("services.edit_title") : t("services.new_title")}
        </h2>
        <div className="mt-4 space-y-3">
          <Field label={t("services.field.name")}>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="e.g. Kitchen renovation"
              autoFocus
            />
          </Field>
          <Field label={t("services.field.description")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder={t("services.field.description_ph")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("services.field.default_rate")}>
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
            <Field label={t("services.field.billing_unit")}>
              <select
                value={billingUnit}
                onChange={(e) =>
                  setBillingUnit(e.target.value as BillingUnit)
                }
                className={selectCls}
              >
                {BILLING_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t("services.field.tags")}>
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className={inputCls}
              placeholder="residential, kitchen, design-build"
            />
          </Field>
          <Field label={t("services.field.notes")}>
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
    </div>
  );
}

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

const selectCls =
  "block w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
