import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  PROJECT_TYPE_LABELS,
  type ProjectStatus,
  type ProjectType,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useFormatters, useLabels, useT } from "../lib/i18n";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
  MoneyInput,
  PageHeader,
  Pill,
  Select,
  Textarea,
} from "../components/ui";

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
  const fmt = useFormatters();
  const t = useT();
  const L = useLabels();
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
    <div className="mx-auto max-w-6xl px-10 py-14 animate-rise">
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
            {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((t) => (
              <option key={t} value={t}>
                {L.projectType(t)}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-[260px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("projects.search")}
            className="pl-10"
          />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
        {list.isLoading ? (
          <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
        ) : list.error ? (
          <p className="px-6 py-8 text-sm text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-display text-xl text-ink-900">
              {search.trim() || typeFilter
                ? t("projects.empty_filtered")
                : statusFilter === "archived"
                  ? t("projects.empty_archived")
                  : t("projects.empty")}
            </p>
            {!search.trim() && !typeFilter && statusFilter !== "archived" && (
              <Button
                variant="primary"
                onClick={() => setModalState({ mode: "create" })}
                className="mt-5"
              >
                <Icon name="plus" className="h-4 w-4" />
                {t("projects.create_first")}
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.data.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/projects/${p.id}`}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-6 px-6 py-4 transition-colors hover:bg-paper-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="truncate font-display text-[20px] leading-tight tracking-tight text-ink-900">
                        {p.name}
                      </span>
                      <Pill tone={STATUS_TONE[p.status]} dot>
                        {t(`status.project.${p.status}` as const)}
                      </Pill>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-ink-500">
                      {L.projectType(p.projectType)}
                      {p.address && (
                        <>
                          <span className="mx-2 text-ink-300">·</span>
                          {p.address}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-[17px] text-ink-900">
                      {p.contractAmount && p.contractCurrency
                        ? fmt.currency(p.contractAmount, p.contractCurrency)
                        : "—"}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-400">
                      {fmt.date(p.updatedAt)}
                    </p>
                  </div>
                  <Icon
                    name="chevron-right"
                    className="h-4 w-4 text-ink-300 group-hover:text-ink-500"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

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
  const L = useLabels();

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
      setError("Contract amount and currency must be set together.");
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
      title={isEdit ? `Edit ${state.project.name}` : "New project"}
      subtitle={
        isEdit
          ? undefined
          : "Set the basics — you can fill in the rest later."
      }
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
              form="project-form"
              variant="primary"
              disabled={submitting}
            >
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </Button>
          </div>
        </div>
      }
    >
      <form id="project-form" onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
        <Field label="Project name" required wide>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Anderson Kitchen Renovation"
          />
        </Field>
        <Field label="Type">
          <Select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as ProjectType)}
          >
            {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((t) => (
              <option key={t} value={t}>
                {L.projectType(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Client" hint="Optional">
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">— None</option>
            {clients.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Address" wide>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Anytown"
          />
        </Field>
        <Field label="Contract amount" hint="Optional">
          <MoneyInput
            amount={contractAmount}
            currency={contractCurrency}
            onAmountChange={setContractAmount}
            onCurrencyChange={setContractCurrency}
            placeholder="125,000.00"
          />
        </Field>
        <Field label="Start date">
          <Input
            type="date"
            value={startedAt as string}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </Field>
        <Field label="Tags" hint="Comma-separated" wide>
          <Input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="residential, kitchen, design-build"
          />
        </Field>
        <Field label="Notes" wide>
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
