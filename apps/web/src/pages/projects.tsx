import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  PROJECT_TYPE_LABELS,
  type ProjectStatus,
  type ProjectType,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useFormatters } from "../lib/i18n";

type ProjectRow = inferRouterOutputs<AppRouter>["projects"]["list"][number];
type StatusFilter = ProjectStatus | "all";
type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; project: ProjectRow };

export default function ProjectsPage() {
  const fmt = useFormatters();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [typeFilter, setTypeFilter] = useState<ProjectType | "">("");
  const [search, setSearch] = useState("");
  const [modalState, setModalState] = useState<ModalState>({ mode: "closed" });

  const list = trpc.projects.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    projectType: typeFilter || undefined,
    search: search.trim() || undefined,
  });

  return (
    <div className="mx-auto max-w-6xl p-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-slate-600">
            One row per client engagement. Each project contains its own
            rooms, assets, materials, drawings, and money — the structured
            recall layer the agency builds up over time.
          </p>
        </div>
        <button
          onClick={() => setModalState({ mode: "create" })}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Project
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className={selectCls}
        >
          <option value="active">Active</option>
          <option value="lead">Lead</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ProjectType | "")}
          className={selectCls}
        >
          <option value="">All types</option>
          {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((t) => (
            <option key={t} value={t}>
              {PROJECT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or address…"
          className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : list.error ? (
          <p className="p-6 text-sm text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {search.trim() || typeFilter
              ? "No projects match these filters."
              : statusFilter === "archived"
                ? "No archived projects."
                : "No projects yet. Click New Project to add one."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Address</Th>
                <Th className="w-28">Contract</Th>
                <Th className="w-24">Status</Th>
                <Th className="w-28">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                >
                  <Td className="font-medium text-slate-900">
                    <Link
                      to={`/projects/${p.id}`}
                      className="hover:text-slate-700"
                    >
                      {p.name}
                    </Link>
                  </Td>
                  <Td className="text-slate-600">
                    {PROJECT_TYPE_LABELS[p.projectType]}
                  </Td>
                  <Td className="text-slate-600">{p.address ?? "—"}</Td>
                  <Td className="text-slate-600">
                    {fmt.currency(p.contractAmount, p.contractCurrency)}
                  </Td>
                  <Td>
                    <StatusPill status={p.status} />
                  </Td>
                  <Td className="text-slate-500">
                    {fmt.date(p.updatedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
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

// ────────────────────── table primitives ──────────────────────

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

const STATUS_PILL_CLS: Record<ProjectStatus, string> = {
  lead: "bg-sky-100 text-sky-800",
  active: "bg-emerald-100 text-emerald-800",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-violet-100 text-violet-800",
  archived: "bg-slate-100 text-slate-700",
};

function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLS[status]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold tracking-tight">
          {isEdit ? `Edit ${state.project.name}` : "New project"}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name *">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              autoFocus
              placeholder="e.g. Anderson Kitchen Renovation"
            />
          </Field>
          <Field label="Type">
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value as ProjectType)}
              className={selectCls}
            >
              {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((t) => (
                <option key={t} value={t}>
                  {PROJECT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Client" wide>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={selectCls}
            >
              <option value="">— (none)</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Address" wide>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputCls}
              placeholder="123 Main St, Anytown"
            />
          </Field>
          <Field label="Contract amount">
            <div className="flex gap-2">
              <input
                value={contractAmount}
                onChange={(e) => setContractAmount(e.target.value)}
                className={`${inputCls} flex-1`}
                placeholder="125000.00"
                inputMode="decimal"
              />
              <input
                value={contractCurrency}
                onChange={(e) =>
                  setContractCurrency(e.target.value.toUpperCase())
                }
                className={`${inputCls} w-16 uppercase`}
                maxLength={3}
              />
            </div>
          </Field>
          <Field label="Start date">
            <input
              type="date"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Tags (comma-separated)" wide>
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className={inputCls}
              placeholder="residential, kitchen, design-build"
            />
          </Field>
          <Field label="Notes" wide>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

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
