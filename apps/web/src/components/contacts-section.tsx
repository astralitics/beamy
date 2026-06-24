import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "./ui";
import { useT } from "../lib/i18n";

/**
 * Structural type that both `client_contacts` and `vendor_contacts` rows
 * satisfy (after JSON serialization across tRPC). The host modal passes
 * already-fetched data + mutation callbacks; this component is data-source
 * agnostic.
 */
export type ContactLike = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

export type ContactFormData = {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
};

export function ContactsSection({
  contacts,
  isLoading,
  onAdd,
  onUpdate,
  onRemove,
  removingId,
  addPending,
  updatePending,
}: {
  contacts: ContactLike[] | undefined;
  isLoading: boolean;
  onAdd: (data: ContactFormData) => void;
  onUpdate: (id: string, patch: Partial<ContactFormData>) => void;
  onRemove: (id: string) => void;
  removingId?: string | null;
  addPending: boolean;
  updatePending: boolean;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ContactLike | null>(null);

  return (
    <div className="border-t border-border bg-bg-subtle p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-text">
            {t("contacts.title")}
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">{t("contacts.lede")}</p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg-subtle"
          >
            {t("contacts.add")}
          </button>
        )}
      </div>

      {adding && (
        <ContactForm
          onSubmit={(data) => onAdd(data)}
          onCancel={() => setAdding(false)}
          onSuccess={() => setAdding(false)}
          submitLabel={t("common.add")}
          submitting={addPending}
        />
      )}
      {editing && (
        <ContactForm
          initial={editing}
          onSubmit={(data) => onUpdate(editing.id, data)}
          onCancel={() => setEditing(null)}
          onSuccess={() => setEditing(null)}
          submitLabel={t("common.save")}
          submitting={updatePending}
        />
      )}

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <p className="text-xs text-text-muted">{t("common.loading")}</p>
        ) : !contacts || contacts.length === 0 ? (
          <p className="text-xs text-text-muted">{t("contacts.empty")}</p>
        ) : (
          contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              onEdit={() => setEditing(c)}
              onRemove={() => onRemove(c.id)}
              removing={removingId === c.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ContactRow({
  contact,
  onEdit,
  onRemove,
  removing,
}: {
  contact: ContactLike;
  onEdit: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">{contact.name}</span>
          {contact.isPrimary && (
            <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-800">
              {t("contacts.primary")}
            </span>
          )}
          {contact.role && (
            <span className="text-xs text-text-muted">· {contact.role}</span>
          )}
        </div>
        {(contact.email || contact.phone) && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-muted">
            {contact.email && <span>{contact.email}</span>}
            {contact.phone && <span>{contact.phone}</span>}
          </div>
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
        onClick={() => setConfirming(true)}
        disabled={removing}
        className="text-xs text-danger hover:text-danger disabled:opacity-50"
      >
        {removing ? "…" : t("common.remove")}
      </button>
      {confirming && (
        <ConfirmDialog
          title={t("contacts.remove_title")}
          message={t("contacts.remove_confirm", { name: contact.name })}
          confirmLabel={t("common.remove")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={removing}
          onConfirm={() => onRemove()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function ContactForm({
  initial,
  onSubmit,
  onCancel,
  onSuccess,
  submitLabel,
  submitting,
}: {
  initial?: ContactLike;
  onSubmit: (data: ContactFormData) => void;
  onCancel: () => void;
  onSuccess: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [isPrimary, setIsPrimary] = useState(initial?.isPrimary ?? false);
  const [submitted, setSubmitted] = useState(false);

  // Close the form when the mutation finishes (submitting flips false after submitted=true).
  if (submitted && !submitting) {
    setSubmitted(false);
    onSuccess();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      role: role.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      isPrimary,
    });
    setSubmitted(true);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-border bg-surface p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t("contacts.field.name")}>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
          />
        </Field>
        <Field label={t("contacts.field.role")}>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputCls}
            placeholder={t("contacts.field.role_ph")}
          />
        </Field>
        <Field label={t("contacts.field.email")}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={t("contacts.field.phone")}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="rounded border-border-strong"
          />
          <span className="text-text">{t("contacts.mark_primary")}</span>
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border px-3 py-1 text-xs hover:bg-bg-subtle"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-accent px-3 py-1 text-xs font-semibold text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? t("common.saving") : submitLabel}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "block w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-text">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
