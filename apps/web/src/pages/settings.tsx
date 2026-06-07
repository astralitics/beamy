import { useState, type FormEvent, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import type { InviteRole, OrgRole } from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";

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
    <div className="mx-auto max-w-4xl p-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("settings.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("settings.lede", {
              org: me.data?.org.name ?? t("settings.the_workspace"),
            })}
          </p>
          {auth.session?.user?.email && (
            <p className="mt-2 text-xs text-slate-500">
              {t("settings.signed_in_as")}{" "}
              <code>{auth.session.user.email}</code> ·{" "}
              <button
                type="button"
                onClick={() => auth.signOut()}
                className="text-rose-600 hover:text-rose-800"
              >
                {t("settings.sign_out")}
              </button>
            </p>
          )}
        </div>
        {canInvite && (
          <button
            onClick={() => setInviting(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
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
          <div className="divide-y divide-slate-100">
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
          <div className="divide-y divide-slate-100">
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
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
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
      className={`p-4 text-sm ${error ? "text-rose-700" : "text-slate-500"}`}
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
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-700">
            {member.userId.slice(0, 8)}…{member.userId.slice(-4)}
          </span>
          {isMe && (
            <span className="text-xs font-medium text-slate-500">
              {t("settings.you")}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
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
          <span className="font-medium text-slate-900">{invitation.email}</span>
          <RolePill role={invitation.role} />
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {t("settings.expires", {
            date: new Date(invitation.expiresAt).toLocaleDateString(),
          })}
        </div>
      </div>
      <button
        onClick={handleCopy}
        className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
      >
        {copied ? t("settings.copied_excl") : t("settings.copy_invite_link")}
      </button>
      {canRevoke && (
        <button
          onClick={() => {
            if (confirm(t("settings.revoke_confirm", { email: invitation.email }))) {
              revoke.mutate({ id: invitation.id });
            }
          }}
          disabled={revoke.isPending}
          className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
        >
          {revoke.isPending ? "…" : t("settings.revoke")}
        </button>
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
type CreatedInvite = { email: string; role: InviteRole; token: string };

function InviteModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  const utils = trpc.useUtils();
  const invite = trpc.members.invite.useMutation({
    onSuccess: (row) => {
      utils.members.listInvitations.invalidate();
      setCreated({ email: row.email, role: row.role, token: row.token });
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    invite.mutate({ email: email.trim(), role });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        {created ? (
          <>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("settings.invite_ready")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-medium text-slate-900">{created.email}</span>{" "}
              {t("settings.invite_ready_body", {
                role: roleLabel(t, created.role),
              })}
            </p>
            <div className="mt-4">
              <CopyField
                label={t("settings.invite_link")}
                value={`${window.location.origin}/invite/${created.token}`}
              />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {t("settings.invite_ready_hint_prefix")}{" "}
              <code>{created.email}</code>. {t("settings.invite_ready_hint_suffix")}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreated(null);
                  setEmail("");
                  setRole("member");
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
              >
                {t("settings.invite_another")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                {t("settings.done")}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h2 className="text-lg font-semibold tracking-tight">
              {t("settings.invite_member")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t("settings.invite_form_body")}
            </p>
            <div className="mt-4 space-y-3">
              <Field label={t("settings.field.email_req")}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  autoFocus
                  placeholder="teammate@example.com"
                />
              </Field>
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
                disabled={invite.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {invite.isPending ? t("settings.creating") : t("settings.create_invite")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Read-only field with a Copy button — petfactory's CopyField. */
function CopyField({ label, value }: { label: string; value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className={`shrink-0 rounded-md border px-3 text-xs font-medium transition-colors ${
            copied
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {copied ? t("settings.copied") : t("settings.copy")}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

const selectCls =
  "block w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
