import { useState, type FormEvent, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  VERTICALS,
  VERTICAL_LABELS,
  type InviteKind,
  type InviteRole,
  type OrgRole,
  type Vertical,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { ConfirmDialog } from "../components/ui";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type MemberRow = RouterOutputs["members"]["list"][number];
type InvitationRow = RouterOutputs["members"]["listInvitations"][number];

type TFn = ReturnType<typeof useT>;

const ROLE_LABEL_KEYS: Record<OrgRole, "settings.role.owner" | "settings.role.admin" | "settings.role.member"> = {
  owner: "settings.role.owner",
  admin: "settings.role.admin",
  member: "settings.role.member",
};

function roleLabel(t: TFn, role: OrgRole): string {
  return t(ROLE_LABEL_KEYS[role]);
}

export default function SettingsPage() {
  const t = useT();
  const me = trpc.me.whoami.useQuery();
  const members = trpc.members.list.useQuery();
  const invites = trpc.members.listInvitations.useQuery();
  const auth = useAuth();
  const [inviting, setInviting] = useState(false);

  const canInvite =
    me.data && (me.data.role === "owner" || me.data.role === "admin");

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text">
            {t("settings.title")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("settings.lede", {
              org: me.data?.org.name ?? t("settings.the_workspace"),
            })}
          </p>
          {auth.session?.user?.email && (
            <p className="mt-2 text-xs text-text-muted">
              {t("settings.signed_in_as")}{" "}
              <code>{auth.session.user.email}</code> ·{" "}
              <button
                type="button"
                onClick={() => auth.signOut()}
                className="text-danger hover:text-danger"
              >
                {t("settings.sign_out")}
              </button>
            </p>
          )}
        </div>
        {canInvite && (
          <button
            onClick={() => setInviting(true)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-hover"
          >
            {t("settings.invite_member")}
          </button>
        )}
      </div>

      <Section title={t("settings.pending_invitations")}>
        {invites.isLoading ? (
          <RowEmpty>{t("common.loading")}</RowEmpty>
        ) : invites.error ? (
          <RowEmpty error>{invites.error.message}</RowEmpty>
        ) : !invites.data || invites.data.length === 0 ? (
          <RowEmpty>{t("settings.no_pending_invitations")}</RowEmpty>
        ) : (
          <div className="divide-y divide-border-subtle">
            {invites.data.map((inv) => (
              <InvitationItem
                key={inv.id}
                invitation={inv}
                canRevoke={!!canInvite}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={t("settings.active_members")}>
        {members.isLoading ? (
          <RowEmpty>{t("common.loading")}</RowEmpty>
        ) : members.error ? (
          <RowEmpty error>{members.error.message}</RowEmpty>
        ) : !members.data || members.data.length === 0 ? (
          <RowEmpty>{t("settings.no_members")}</RowEmpty>
        ) : (
          <div className="divide-y divide-border-subtle">
            {members.data.map((m) => (
              <MemberItem
                key={m.id}
                member={m}
                isMe={m.userId === me.data?.userId}
              />
            ))}
          </div>
        )}
      </Section>

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
    </div>
  );
}

// ────────────────────── presentational ──────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
        {children}
      </div>
    </section>
  );
}

function RowEmpty({
  children,
  error,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      className={`p-4 text-sm ${error ? "text-danger" : "text-text-muted"}`}
    >
      {children}
    </p>
  );
}

function RolePill({ role }: { role: OrgRole | InviteRole }) {
  const t = useT();
  const cls: Record<OrgRole, string> = {
    owner: "bg-violet-100 text-violet-800",
    admin: "bg-sky-100 text-sky-800",
    member: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls[role as OrgRole]}`}
    >
      {roleLabel(t, role as OrgRole)}
    </span>
  );
}

function MemberItem({ member, isMe }: { member: MemberRow; isMe: boolean }) {
  const t = useT();
  // Prefer a real name, then email, then the raw id (seed/phantom rows).
  const primary =
    member.fullName ??
    member.email ??
    `${member.userId.slice(0, 8)}…${member.userId.slice(-4)}`;
  const showEmailLine = Boolean(member.fullName && member.email);
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-text">{primary}</span>
          {isMe && (
            <span className="text-xs font-medium text-text-muted">
              {t("settings.you")}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-text-muted">
          {showEmailLine && <span>{member.email} · </span>}
          {t("settings.joined", {
            date: new Date(member.joinedAt).toLocaleDateString(),
          })}
        </div>
      </div>
      <RolePill role={member.role} />
    </div>
  );
}

function InvitationItem({
  invitation,
  canRevoke,
}: {
  invitation: InvitationRow;
  canRevoke: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const utils = trpc.useUtils();
  const revoke = trpc.members.revokeInvitation.useMutation({
    onSuccess: () => utils.members.listInvitations.invalidate(),
  });

  const inviteUrl = `${window.location.origin}/invite/${invitation.token}`;

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">{invitation.email}</span>
          {invitation.kind === "workspace" ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              {VERTICAL_LABELS[invitation.vertical]}
            </span>
          ) : (
            <RolePill role={invitation.role} />
          )}
        </div>
        {invitation.kind === "workspace" && invitation.workspaceName && (
          <div className="mt-0.5 text-xs text-text-muted">
            {invitation.workspaceName}
          </div>
        )}
        <div className="mt-0.5 text-xs text-text-muted">
          {t("settings.expires", {
            date: new Date(invitation.expiresAt).toLocaleDateString(),
          })}
        </div>
      </div>
      <button
        onClick={handleCopy}
        className="rounded-xl border border-border px-3 py-1 text-xs hover:bg-bg-subtle"
      >
        {copied ? t("settings.copied_excl") : t("settings.copy_invite_link")}
      </button>
      {canRevoke && (
        <button
          onClick={() => setConfirmingRevoke(true)}
          disabled={revoke.isPending}
          className="text-xs text-danger hover:text-danger disabled:opacity-50"
        >
          {revoke.isPending ? "…" : t("settings.revoke")}
        </button>
      )}
      {confirmingRevoke && (
        <ConfirmDialog
          title={t("settings.revoke_title")}
          message={t("settings.revoke_confirm", { email: invitation.email })}
          confirmLabel={t("settings.revoke")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={revoke.isPending}
          error={revoke.error?.message}
          onConfirm={() => revoke.mutate({ id: invitation.id })}
          onClose={() => setConfirmingRevoke(false)}
        />
      )}
    </div>
  );
}

// ────────────────────── invite modal ──────────────────────

/**
 * Two-state invite modal, mirroring petfactory's NewInviteModal → "Invite
 * ready" flow: fill the form, create, then immediately surface the shareable
 * link with a Copy button (instead of silently closing). The invitee joins by
 * signing in with the invited email — the email-whitelist gate (`me.authorize`)
 * auto-provisions them, so the link just routes them to sign-in.
 */
type CreatedInvite = {
  email: string;
  kind: InviteKind;
  role: InviteRole;
  vertical: Vertical;
  workspaceName: string | null;
  token: string;
};

function InviteModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [kind, setKind] = useState<InviteKind>("workspace");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [vertical, setVertical] = useState<Vertical>("construction");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  const utils = trpc.useUtils();
  const invite = trpc.members.invite.useMutation({
    onSuccess: (row) => {
      utils.members.listInvitations.invalidate();
      setCreated({
        email: row.email,
        kind: row.kind,
        role: row.role,
        vertical: row.vertical,
        workspaceName: row.workspaceName,
        token: row.token,
      });
    },
    onError: (err) => setError(err.message),
  });

  function resetForm() {
    setCreated(null);
    setEmail("");
    setRole("member");
    setWorkspaceName("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind === "workspace") {
      invite.mutate({
        kind: "workspace",
        email: email.trim(),
        vertical,
        workspaceName: workspaceName.trim(),
      });
    } else {
      invite.mutate({ kind: "member", email: email.trim(), role });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"
      >
        {created ? (
          <>
            <h2 className="text-lg font-semibold tracking-tight text-text">
              {t("settings.invite_ready")}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              <span className="font-medium text-text">{created.email}</span>{" "}
              {created.kind === "workspace"
                ? t("settings.invite.workspace_ready_body", {
                    vertical: VERTICAL_LABELS[created.vertical],
                  })
                : t("settings.invite_ready_body", {
                    role: roleLabel(t, created.role),
                  })}
            </p>
            <div className="mt-4">
              <CopyField
                label={t("settings.invite_link")}
                value={`${window.location.origin}/invite/${created.token}`}
              />
            </div>
            <p className="mt-3 text-xs text-text-faint">
              {t("settings.invite_ready_hint_prefix")}{" "}
              <code>{created.email}</code>. {t("settings.invite_ready_hint_suffix")}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-bg-subtle"
              >
                {t("settings.invite_another")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-hover"
              >
                {t("settings.done")}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h2 className="text-lg font-semibold tracking-tight text-text">
              {kind === "workspace"
                ? t("settings.invite.kind_workspace")
                : t("settings.invite_member")}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {kind === "workspace"
                ? t("settings.invite.workspace_body", {
                    vertical: VERTICAL_LABELS[vertical],
                  })
                : t("settings.invite_form_body")}
            </p>
            <div className="mt-4 space-y-3">
              <Field label={t("settings.invite.kind_label")}>
                <div className="inline-flex rounded-xl border border-border p-0.5">
                  <KindTab
                    active={kind === "workspace"}
                    onClick={() => setKind("workspace")}
                    label={t("settings.invite.kind_workspace")}
                  />
                  <KindTab
                    active={kind === "member"}
                    onClick={() => setKind("member")}
                    label={t("settings.invite.kind_member")}
                  />
                </div>
              </Field>
              {kind === "workspace" && (
                <>
                  <Field label={t("settings.invite.product")}>
                    <select
                      value={vertical}
                      onChange={(e) => setVertical(e.target.value as Vertical)}
                      className={selectCls}
                    >
                      {VERTICALS.map((v) => (
                        <option key={v} value={v}>
                          {VERTICAL_LABELS[v]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("settings.invite.workspace_name")}>
                    <input
                      required
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      className={inputCls}
                      placeholder={t("settings.invite.workspace_name_ph")}
                    />
                  </Field>
                </>
              )}
              <Field label={t("settings.field.email_req")}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  autoFocus
                  placeholder="customer@example.com"
                />
              </Field>
              {kind === "member" && (
                <Field label={t("settings.field.role")}>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as InviteRole)}
                    className={selectCls}
                  >
                    <option value="member">{t("settings.role.member")}</option>
                    <option value="admin">{t("settings.role.admin")}</option>
                  </select>
                </Field>
              )}
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-bg-subtle"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={invite.isPending}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
              >
                {invite.isPending
                  ? t("settings.creating")
                  : kind === "workspace"
                    ? t("settings.invite.create_workspace")
                    : t("settings.create_invite")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function KindTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-accent text-accent-contrast"
          : "text-text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

/** Read-only field with a Copy button — petfactory's CopyField. */
function CopyField({ label, value }: { label: string; value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-xl border border-border bg-bg-subtle px-3 py-2 text-xs text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className={`shrink-0 rounded-xl border px-3 text-xs font-medium transition-colors ${
            copied
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-border bg-surface text-text hover:bg-bg-subtle"
          }`}
        >
          {copied ? t("settings.copied") : t("settings.copy")}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "block w-full rounded-xl border border-border bg-surface px-3.5 h-10 text-[14px] text-text placeholder:text-text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

const selectCls =
  "block w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-text">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
