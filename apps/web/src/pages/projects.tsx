import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  PROJECT_TYPES_BY_VERTICAL,
  type ProjectStatus,
  type ProjectType,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useFormatters, useLabels, useT } from "../lib/i18n";
import { useVertical } from "../lib/vertical";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
  Money,
  MoneyInput,
  PageHeader,
  Pill,
  Select,
  Textarea,
} from "../components/ui";
import { EmptyState } from "../components/vertical-mark";

type ProjectRow = inferRouterOutputs<AppRouter>["projects"]["list"][number];
type StatusFilter = ProjectStatus | "all";
type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; project: ProjectRow };

const STATUS_TONE: Record<
  ProjectStatus,
  "info" | "success" | "warn" | "accent" | "neutral"
> = {
  lead: "info",
  active: "success",
  on_hold: "warn",
  completed: "accent",
  archived: "neutral",
};

export default function ProjectsPage() {
  const vertical = useVertical();
  const fmt = useFormatters();
  const t = useT();
  const L = useLabels();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [typeFilter, setTypeFilter] = useState<ProjectType | "">("");
  const [search, setSearch] = useState("");
  const [modalState, setModalState] = useState<ModalState>({ mode: "closed" });

  // Open create modal automatically when ?new=1 in URL.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setModalState({ mode: "create" });
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const list = trpc.projects.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    projectType: typeFilter || undefined,
    search: search.trim() || undefined,
  });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-14 animate-rise">
      <PageHeader
        title={t("projects.title")}
        lede={t("projects.lede")}
        action={
          <Button
            variant="primary"
            onClick={() => setModalState({ mode: "create" })}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("projects.new")}
          </Button>
        }
      />

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <div className="w-40">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="active">{t("projects.filter.active")}</option>
            <option value="lead">{t("projects.filter.lead")}</option>
            <option value="on_hold">{t("projects.filter.on_hold")}</option>
            <option value="completed">{t("projects.filter.completed")}</option>
            <option value="archived">{t("projects.filter.archived")}</option>
            <option value="all">{t("projects.filter.all")}</option>
          </Select>
        </div>
        <div className="w-56">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ProjectType | "")}
          >
            <option value="">{t("projects.filter.all_types")}</option>
            {PROJECT_TYPES_BY_VERTICAL[vertical].map((pt) => (
              <option key={pt} value={pt}>
                {L.projectType(pt)}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-[260px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("projects.search")}
            className="pl-10"
          />
        </div>
      </div>

      {list.isLoading ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-text-muted">
          {t("common.loading")}
        </div>
      ) : list.error ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-danger">
          {list.error.message}
        </div>
      ) : !list.data || list.data.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={
              search.trim() || typeFilter
                ? t("projects.empty_filtered")
                : statusFilter === "archived"
                  ? t("projects.empty_archived")
                  : t("projects.empty")
            }
            action={
              !search.trim() && !typeFilter && statusFilter !== "archived" ? (
                <Button variant="primary" onClick={() => setModalState({ mode: "create" })}>
                  <Icon name="plus" className="h-4 w-4" />
                  {t("projects.create_first")}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="data-table mt-6">
          <table>
            <thead>
              <tr>
                <th>{t("col.name")}</th>
                <th className="hidden md:table-cell">{t("col.type")}</th>
                <th className="r">{t("col.contract")}</th>
                <th className="r hidden sm:table-cell">{t("col.updated")}</th>
                <th aria-hidden className="w-8" />
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id} className="clickable group" onClick={() => navigate(`/projects/${p.id}`)}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Link
                        to={`/projects/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate font-display text-[17px] font-bold leading-tight tracking-tight text-text group-hover:text-accent"
                      >
                        {p.name}
                      </Link>
                      <Pill tone={STATUS_TONE[p.status]} dot>
                        {t(`status.project.${p.status}` as const)}
                      </Pill>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-text-muted md:hidden">
                      {L.projectType(p.projectType)}
                      {p.address && <span className="text-text-faint"> · {p.address}</span>}
                    </p>
                  </td>
                  <td className="hidden max-w-[260px] text-text-muted md:table-cell">
                    <span className="block truncate">{L.projectType(p.projectType)}</span>
                    {p.address && <span className="block truncate text-[12px] text-text-faint">{p.address}</span>}
                  </td>
                  <td className="r">
                    <Money amount={p.contractAmount} currency={p.contractCurrency} mono />
                  </td>
                  <td className="r hidden whitespace-nowrap text-[12px] text-text-faint tnum sm:table-cell">
                    {fmt.date(p.updatedAt)}
                  </td>
                  <td className="r">
                    <Icon name="chevron-right" className="ml-auto h-4 w-4 text-text-faint transition-colors group-hover:text-accent" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalState.mode !== "closed" && (
        <ProjectFormModal
          state={modalState}
          onClose={() => setModalState({ mode: "closed" })}
        />
      )}
    </div>
  );
}

// ────────────────────── modal ──────────────────────

function ProjectFormModal({
  state,
  onClose,
}: {
  state: { mode: "create" } | { mode: "edit"; project: ProjectRow };
  onClose: () => void;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.project : null;
  const t = useT();
  const L = useLabels();
  const vertical = useVertical();

  const clients = trpc.clients.list.useQuery({ status: "active" });

  const [name, setName] = useState(initial?.name ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [projectType, setProjectType] = useState<ProjectType>(
    initial?.projectType ?? "residential_renovation",
  );
  const [contractAmount, setContractAmount] = useState(
    initial?.contractAmount ?? "",
  );
  const [contractCurrency, setContractCurrency] = useState(
    initial?.contractCurrency ?? "USD",
  );
  const [startedAt, setStartedAt] = useState(initial?.startedAt ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tagsRaw, setTagsRaw] = useState(initial?.tags?.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.projects.get.invalidate({ id: isEdit ? state.project.id : "" });
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
    const amt = contractAmount.trim();
    const cur = contractCurrency.trim();
    if ((amt && !cur) || (!amt && cur)) {
      setError(t("projects.err_contract_currency"));
      return;
    }
    const payload = {
      name: name.trim(),
      clientId: clientId || undefined,
      address: address.trim() || undefined,
      projectType,
      contractAmount: amt || undefined,
      contractCurrency: amt ? cur : undefined,
      startedAt: startedAt || undefined,
      notes: notes.trim() || undefined,
      tags,
    };
    if (isEdit) {
      update.mutate({ id: state.project.id, patch: payload });
    } else {
      create.mutate(payload);
    }
  }

  return (
    <Modal
      title={
        isEdit
          ? t("projects.modal.edit_title", { name: state.project.name })
          : t("projects.modal.new_title")
      }
      subtitle={isEdit ? undefined : t("projects.modal.subtitle")}
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
              form="project-form"
              variant="primary"
              disabled={submitting}
            >
              {submitting
                ? t("common.saving")
                : isEdit
                  ? t("common.save_changes")
                  : t("projects.modal.create")}
            </Button>
          </div>
        </div>
      }
    >
      <form id="project-form" onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
        <Field label={t("projects.field.name")} required wide>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Anderson Kitchen Renovation"
          />
        </Field>
        <Field label={t("col.type")}>
          <Select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as ProjectType)}
          >
            {PROJECT_TYPES_BY_VERTICAL[vertical].map((pt) => (
              <option key={pt} value={pt}>
                {L.projectType(pt)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("col.client")} hint={t("common.optional")}>
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">{t("projects.field.client_none")}</option>
            {clients.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("col.address")} wide>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Anytown"
          />
        </Field>
        <Field label={t("projects.field.contract_amount")} hint={t("common.optional")}>
          <MoneyInput
            amount={contractAmount}
            currency={contractCurrency}
            onAmountChange={setContractAmount}
            onCurrencyChange={setContractCurrency}
            placeholder="125,000.00"
          />
        </Field>
        <Field label={t("projects.field.start_date")}>
          <Input
            type="date"
            value={startedAt as string}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </Field>
        <Field label={t("projects.field.tags")} hint={t("projects.field.tags_hint")} wide>
          <Input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="residential, kitchen, design-build"
          />
        </Field>
        <Field label={t("projects.field.notes")} wide>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the team should know."
          />
        </Field>
      </form>
    </Modal>
  );
}
