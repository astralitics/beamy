import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { Button, Field, Input, Modal } from "./ui";

/**
 * Change-password modal for the signed-in user.
 *
 * Calls `supabase.auth.updateUser` directly — the operation only touches the
 * Supabase Auth user, no Beamy domain tables, so no tRPC procedure is needed.
 * The session refreshes automatically (USER_UPDATED → AuthProvider), no
 * sign-out required. ("Forgot password" while signed out is a separate
 * recovery-email flow on /login, not this dialog.)
 *
 * Adapted from Cadenza's ChangePasswordDialog to Beamy's ui primitives.
 */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError(t("password.too_short"));
      return;
    }
    if (password !== confirm) {
      setError(t("password.mismatch"));
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  }

  return (
    <Modal
      title={t("password.title")}
      subtitle={t("password.description")}
      onClose={onClose}
    >
      {done ? (
        <div>
          <p className="text-sm text-emerald-700">{t("password.changed")}</p>
          <div className="mt-6 flex justify-end">
            <Button type="button" variant="primary" onClick={onClose}>
              {t("settings.done")}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t("password.new")} hint={t("password.hint")}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              autoFocus
              disabled={submitting}
            />
          </Field>
          <Field label={t("password.confirm")}>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              disabled={submitting}
            />
          </Field>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || !password || !confirm}>
              {submitting ? t("password.updating") : t("password.update")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
