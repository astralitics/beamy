import { useState, type FormEvent } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import type { BillingUnit, ServiceStatus } from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { EmptyState } from "../components/vertical-mark";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
  PageHeader,
  Pill,
  Select,
  Textarea,
} from "../components/ui";

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
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-10 lg:py-14">
      <PageHeader
        title={t("nav.services")}
        lede={t("services.lede")}
        action={
          <Button
            variant="primary"
            onClick={() => setModalState({ mode: "create" })}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("services.new")}
          </Button>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="active">{t("services.filter.active")}</option>
            <option value="archived">{t("services.filter.archived")}</option>
            <option value="all">{t("services.filter.all")}</option>
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
            placeholder={t("services.search")}
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
              search.trim()
                ? t("services.empty_filtered")
                : statusFilter === "archived"
                  ? t("services.empty_archived")
                  : t("services.empty")
            }
          />
        </div>
      ) : (
        <div className="data-table mt-6">
          <table>
            <thead>
              <tr>
                <th>{t("col.name")}</th>
                <th>{t("services.col.default_rate")}</th>
                <th>{t("services.col.tags")}</th>
                <th className="w-24">{t("col.status")}</th>
                <th className="w-28 r">{t("col.updated")}</th>
                <th className="w-24 r">{t("services.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr
                  key={s.id}
                  className="clickable group"
                  onClick={() => setModalState({ mode: "edit", service: s })}
                >
                  <td>
                    <div className="font-medium">{s.name}</div>
                    {s.description && (
                      <div className="mt-0.5 truncate text-xs text-text-muted">
                        {s.description}
                      </div>
                    )}
                  </td>
                  <td className="text-text-muted">
                    {s.defaultRateAmount && s.defaultRateCurrency
                      ? `${s.defaultRateAmount} ${s.defaultRateCurrency} ${unitLabel(s.billingUnit)}`
                      : unitLabel(s.billingUnit)}
                  </td>
                  <td className="text-text-muted">
                    {s.tags.length > 0 ? s.tags.join(", ") : "—"}
                  </td>
                  <td>
                    <StatusPill status={s.status} />
                  </td>
                  <td className="r whitespace-nowrap text-text-muted">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="r">
                    <RowActions service={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalState.mode !== "closed" && (
        <ServiceFormModal
          state={modalState}
          onClose={() => setModalState({ mode: "closed" })}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ServiceStatus }) {
  return (
    <Pill tone={status === "active" ? "success" : "neutral"} dot>
      {status}
    </Pill>
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
      className="text-xs text-text-muted hover:text-text disabled:opacity-50"
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
    <Modal
      title={isEdit ? t("services.edit_title") : t("services.new_title")}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-danger">{error}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="service-form"
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
      <form id="service-form" onSubmit={onSubmit} className="space-y-4">
        <Field label={t("services.field.name")} required>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kitchen renovation"
            autoFocus
          />
        </Field>
        <Field label={t("services.field.description")}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("services.field.description_ph")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("services.field.default_rate")}>
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
          <Field label={t("services.field.billing_unit")}>
            <Select
              value={billingUnit}
              onChange={(e) => setBillingUnit(e.target.value as BillingUnit)}
            >
              {BILLING_UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("services.field.tags")}>
          <Input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="residential, kitchen, design-build"
          />
        </Field>
        <Field label={t("services.field.notes")}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </Field>
      </form>
    </Modal>
  );
}

