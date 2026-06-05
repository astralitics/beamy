import { useState, type FormEvent, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import type { InviteRole, OrgRole } from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useAuth } from "../lib/auth";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type MemberRow = RouterOutputs["members"]["list"][number];
type InvitationRow = RouterOutputs["members"]["listInvitations"][number];

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export default function SettingsPage() {
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
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage who's in {me.data?.org.name ?? "the workspace"}. Invitations
            expire after 7 days.
          </p>
          {auth.session?.user?.email && (
            <p className="mt-2 text-xs text-slate-500">
              Signed in as <code>{auth.session.user.email}</code> ·{" "}
              <button
                type="button"
                onClick={() => auth.signOut()}
                className="text-rose-600 hover:text-rose-800"
              >
                Sign out
              </button>
            </p>
          )}
        </div>
        {canInvite && (
          <button
            onClick={() => setInviting(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Invite member
          </button>
        )}
      </div>

      <Section title="Pending invitations">
        {invites.isLoading ? (
          <RowEmpty>Loading…</RowEmpty>
        ) : invites.error ? (
          <RowEmpty error>{invites.error.message}</RowEmpty>
        ) : !invites.data || invites.data.length === 0 ? (
          <RowEmpty>No pending invitations.</RowEmpty>
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

      <Section title="Active members">
        {members.isLoading ? (
          <RowEmpty>Loading…</RowEmpty>
        ) : members.error ? (
          <RowEmpty error>{members.error.message}</RowEmpty>
        ) : !members.data || members.data.length === 0 ? (
          <RowEmpty>No members.</RowEmpty>
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
  const cls: Record<OrgRole, string> = {
    owner: "bg-violet-100 text-violet-800",
    admin: "bg-sky-100 text-sky-800",
    member: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls[role as OrgRole]}`}
    >
      {ROLE_LABELS[role as OrgRole]}
    </span>
  );
}

function MemberItem({ member, isMe }: { member: MemberRow; isMe: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-700">
            {member.userId.slice(0, 8)}…{member.userId.slice(-4)}
          </span>
          {isMe && (
            <span className="text-xs font-medium text-slate-500">(you)</span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          joined {new Date(member.joinedAt).toLocaleDateString()}
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
          expires {new Date(invitation.expiresAt).toLocaleDateString()}
        </div>
      </div>
      <button
        onClick={handleCopy}
        className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
      >
        {copied ? "Copied!" : "Copy invite link"}
      </button>
      {canRevoke && (
        <button
          onClick={() => {
            if (confirm(`Revoke invitation to ${invitation.email}?`)) {
              revoke.mutate({ id: invitation.id });
            }
          }}
          disabled={revoke.isPending}
          className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
        >
          {revoke.isPending ? "…" : "Revoke"}
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
            <h2 className="text-lg font-semibold tracking-tight">Invite ready</h2>
            <p className="mt-1 text-sm text-slate-600">
              <span className="font-medium text-slate-900">{created.email}</span>{" "}
              joins as {ROLE_LABELS[created.role]} the moment they sign in with
              that email — Google or email/password. Send them this link:
            </p>
            <div className="mt-4">
              <CopyField
                label="Invite link"
                value={`${window.location.origin}/invite/${created.token}`}
              />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              No code to type — they're added automatically once they
              authenticate with <code>{created.email}</code>. Valid for 7 days.
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
                Invite another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h2 className="text-lg font-semibold tracking-tight">Invite member</h2>
            <p className="mt-1 text-sm text-slate-600">
              They join automatically when they sign in with this email — no
              code to type. You'll get a shareable link next.
            </p>
            <div className="mt-4 space-y-3">
              <Field label="Email *">
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
              <Field label="Role">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as InviteRole)}
                  className={selectCls}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={invite.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {invite.isPending ? "Creating…" : "Create invite"}
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
          {copied ? "Copied" : "Copy"}
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
