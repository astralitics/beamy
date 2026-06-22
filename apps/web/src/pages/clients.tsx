import { useState, type FormEvent } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import type { ClientStatus } from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { ContactsSection } from "../components/contacts-section";
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
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-10 lg:py-14">
      <PageHeader
        title={t("nav.clients")}
        lede={t("clients.lede")}
        action={
          <Button
            variant="primary"
            onClick={() => setModalState({ mode: "create" })}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("clients.new")}
          </Button>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="active">{t("clients.filter.active")}</option>
            <option value="archived">{t("clients.filter.archived")}</option>
            <option value="all">{t("clients.filter.all")}</option>
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
            placeholder={t("clients.search")}
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
                ? t("clients.empty_filtered")
                : statusFilter === "archived"
                  ? t("clients.empty_archived")
                  : t("clients.empty")
            }
          />
        </div>
      ) : (
        <div className="data-table mt-6">
          <table>
            <thead>
              <tr>
                <th>{t("col.name")}</th>
                <th>{t("clients.col.primary_contact")}</th>
                <th>{t("clients.col.tags")}</th>
                <th className="w-24">{t("col.status")}</th>
                <th className="w-28 r">{t("col.updated")}</th>
                <th className="w-24 r">{t("clients.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr
                  key={c.id}
                  className="clickable group"
                  onClick={() => setModalState({ mode: "edit", client: c })}
                >
                  <td className="font-medium">{c.name}</td>
                  <td className="text-text-muted">{c.primaryContact ?? "—"}</td>
                  <td className="text-text-muted">
                    {c.tags.length > 0 ? c.tags.join(", ") : "—"}
                  </td>
                  <td>
                    <StatusPill status={c.status} />
                  </td>
                  <td className="r whitespace-nowrap text-text-muted">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="r">
                    <RowActions client={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalState.mode !== "closed" && (
        <ClientFormModal
          state={modalState}
          onClose={() => setModalState({ mode: "closed" })}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ClientStatus }) {
  return (
    <Pill tone={status === "active" ? "success" : "neutral"} dot>
      {status}
    </Pill>
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
      className="text-xs text-text-muted hover:text-text disabled:opacity-50"
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
    <Modal
      title={
        isEdit
          ? t("clients.edit_title", { name: state.client.name })
          : t("clients.new_title")
      }
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
              form="client-form"
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
      <form id="client-form" onSubmit={onSubmit} className="space-y-4">
        <Field label={t("clients.field.name")} required>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label={t("clients.field.primary_contact")}>
          <Input
            value={primaryContact}
            onChange={(e) => setPrimaryContact(e.target.value)}
            placeholder="e.g. Sarah Anderson"
          />
        </Field>
        <Field label={t("col.address")}>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label={t("clients.field.notes")}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </Field>
        <Field label={t("clients.field.tags")}>
          <Input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="residential, kitchen-reno"
          />
        </Field>
      </form>

      {isEdit && <ClientContactsWrapper clientId={state.client.id} />}
    </Modal>
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

