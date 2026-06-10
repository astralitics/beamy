import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { Button, Field, Input, Modal } from "./ui";

/**
 * Account-details modal: shows the signed-in user's email (read-only) and lets
 * them edit their display name. Like the password dialog, this only touches the
 * Supabase Auth user (`user_metadata.full_name`) — no tRPC/domain tables — and
 * the session refreshes via the AuthProvider's USER_UPDATED listener.
 *
 * Email changes are intentionally out of scope for now (they need a
 * confirmation-email round-trip); the field is shown read-only.
 */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { session } = useAuth();
  const user = session?.user;
  const initialName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";

  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
  }

  return (
    <Modal title={t("account.your_account")} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t("account.field.email")} hint={t("account.email_readonly")}>
          <Input value={user?.email ?? ""} readOnly disabled />
        </Field>
        <Field label={t("account.field.name")}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            placeholder={t("account.name_ph")}
            autoFocus
            disabled={submitting}
          />
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex items-center justify-end gap-3 pt-2">
          {saved && (
            <span className="text-sm text-emerald-700">{t("account.saved")}</span>
          )}
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || name.trim() === initialName}
          >
            {submitting ? t("account.saving") : t("account.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
