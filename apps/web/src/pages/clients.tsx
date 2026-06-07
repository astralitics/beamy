import { useState, type FormEvent, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import type { ClientStatus } from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { ContactsSection } from "../components/contacts-section";

type ClientRow = inferRouterOutputs<AppRouter>["clients"]["list"][number];
type StatusFilter = ClientStatus | "all";
type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; client: ClientRow };

export default function ClientsPage() {
  const t = useT();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [modalState, setModalState] = useState<ModalState>({ mode: "closed" });

  const list = trpc.clients.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search.trim() || undefined,
  });

  return (
    <div className="mx-auto max-w-5xl p-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("nav.clients")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t("clients.lede")}</p>
        </div>
        <button
          onClick={() => setModalState({ mode: "create" })}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {t("clients.new")}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        >
          <option value="active">{t("clients.filter.active")}</option>
          <option value="archived">{t("clients.filter.archived")}</option>
          <option value="all">{t("clients.filter.all")}</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("clients.search")}
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
              ? t("clients.empty_filtered")
              : statusFilter === "archived"
                ? t("clients.empty_archived")
                : t("clients.empty")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>{t("col.name")}</Th>
                <Th>{t("clients.col.primary_contact")}</Th>
                <Th>{t("clients.col.tags")}</Th>
                <Th className="w-24">{t("col.status")}</Th>
                <Th className="w-28">{t("col.updated")}</Th>
                <Th className="w-24 text-right">{t("clients.col.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  onClick={() => setModalState({ mode: "edit", client: c })}
                >
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td className="text-slate-600">{c.primaryContact ?? "—"}</Td>
                  <Td className="text-slate-600">
                    {c.tags.length > 0 ? c.tags.join(", ") : "—"}
                  </Td>
                  <Td>
                    <StatusPill status={c.status} />
                  </Td>
                  <Td className="text-slate-500">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </Td>
                  <Td className="text-right">
                    <RowActions client={c} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalState.mode !== "closed" && (
        <ClientFormModal
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

function StatusPill({ status }: { status: ClientStatus }) {
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

function RowActions({ client }: { client: ClientRow }) {
  const t = useT();
  const utils = trpc.useUtils();
  const archive = trpc.clients.archive.useMutation({
    onSuccess: () => utils.clients.list.invalidate(),
  });
  const restore = trpc.clients.restore.useMutation({
    onSuccess: () => utils.clients.list.invalidate(),
  });
  const pending = archive.isPending || restore.isPending;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (client.status === "active") {
          archive.mutate({ id: client.id });
        } else {
          restore.mutate({ id: client.id });
        }
      }}
      disabled={pending}
      className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
    >
      {pending
        ? "…"
        : client.status === "active"
          ? t("clients.archive")
          : t("clients.restore")}
    </button>
  );
}

function ClientFormModal({
  state,
  onClose,
}: {
  state: { mode: "create" } | { mode: "edit"; client: ClientRow };
  onClose: () => void;
}) {
  const t = useT();
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.client : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [primaryContact, setPrimaryContact] = useState(
    initial?.primaryContact ?? "",
  );
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tagsRaw, setTagsRaw] = useState(initial?.tags?.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.clients.create.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.clients.update.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
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
    const payload = {
      name: name.trim(),
      primaryContact: primaryContact.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
      tags,
    };
    if (isEdit) {
      update.mutate({ id: state.client.id, patch: payload });
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
        className="w-full max-w-lg rounded-lg bg-white shadow-xl"
      >
        <form onSubmit={onSubmit} className="p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            {isEdit
              ? t("clients.edit_title", { name: state.client.name })
              : t("clients.new_title")}
          </h2>
          <div className="mt-4 space-y-3">
            <Field label={t("clients.field.name")}>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                autoFocus
              />
            </Field>
            <Field label={t("clients.field.primary_contact")}>
              <input
                value={primaryContact}
                onChange={(e) => setPrimaryContact(e.target.value)}
                className={inputCls}
                placeholder="e.g. Sarah Anderson"
              />
            </Field>
            <Field label={t("col.address")}>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={t("clients.field.notes")}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </Field>
            <Field label={t("clients.field.tags")}>
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                className={inputCls}
                placeholder="residential, kitchen-reno"
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

        {isEdit && <ClientContactsWrapper clientId={state.client.id} />}
      </div>
    </div>
  );
}

function ClientContactsWrapper({ clientId }: { clientId: string }) {
  const utils = trpc.useUtils();
  const list = trpc.clients.listContacts.useQuery({ clientId });
  const add = trpc.clients.addContact.useMutation({
    onSuccess: () => utils.clients.listContacts.invalidate({ clientId }),
  });
  const update = trpc.clients.updateContact.useMutation({
    onSuccess: () => utils.clients.listContacts.invalidate({ clientId }),
  });
  const remove = trpc.clients.removeContact.useMutation({
    onSuccess: () => utils.clients.listContacts.invalidate({ clientId }),
  });

  return (
    <ContactsSection
      contacts={list.data}
      isLoading={list.isLoading}
      onAdd={(data) => add.mutate({ clientId, ...data })}
      onUpdate={(id, patch) => update.mutate({ id, patch })}
      onRemove={(id) => remove.mutate({ id })}
      removingId={remove.isPending ? remove.variables?.id ?? null : null}
      addPending={add.isPending}
      updatePending={update.isPending}
    />
  );
}

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
