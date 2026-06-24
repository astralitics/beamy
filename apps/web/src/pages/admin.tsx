import { useMemo, useState, type FormEvent } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { trpc } from "../lib/trpc";
import { setActiveOrg } from "../lib/active-org";
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  PageHeader,
  Pill,
  Select,
} from "../components/ui";

type Role = "owner" | "admin" | "member";
const ROLES: Role[] = ["owner", "admin", "member"];
type RouterOutputs = inferRouterOutputs<AppRouter>;
type OrgRow = RouterOutputs["admin"]["access"]["orgs"][number];
type Member = OrgRow["members"][number];
type UserRow = RouterOutputs["admin"]["access"]["users"][number];

/**
 * Platform-admin console — cross-tenant workspace + access management. Ported
 * from Cadenza's `admin/access`, Beamy-styled. Lists EVERY workspace (no status
 * filter) and lets an operator create workspaces, grant/revoke access, and
 * delete tenants. Reached at `/admin/access` behind `AdminGate`.
 */
export default function AdminAccessPage() {
  const utils = trpc.useUtils();
  const orgsQuery = trpc.admin.access.orgs.useQuery(undefined, {
    retry: false,
    staleTime: 0,
  });
  const usersQuery = trpc.admin.access.users.useQuery(undefined, {
    retry: false,
  });

  const usersById = useMemo(() => {
    const m = new Map<string, { email: string | null; fullName: string | null }>();
    for (const u of usersQuery.data ?? []) m.set(u.id, u);
    return m;
  }, [usersQuery.data]);

  const [newOpen, setNewOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<OrgRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ org: OrgRow; member: Member } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserRow | null>(null);

  function refresh() {
    void utils.admin.access.orgs.invalidate();
    void utils.admin.access.users.invalidate();
  }

  const updateMember = trpc.admin.access.updateMember.useMutation({
    onSuccess: refresh,
  });
  const removeMember = trpc.admin.access.removeMember.useMutation({
    onSuccess: () => {
      refresh();
      setRemoveTarget(null);
    },
  });
  const enterWorkspace = trpc.admin.access.enterWorkspace.useMutation({
    onSuccess: (data) => {
      // Set the active org, then HARD load the app — the server synthesizes
      // owner access for the admin in that workspace via the x-active-org header.
      setActiveOrg(data.orgId);
      window.location.assign("/");
    },
  });
  const deleteUser = trpc.admin.access.deleteUser.useMutation({
    onSuccess: () => {
      refresh();
      setDeleteUserTarget(null);
    },
  });

  const orgs = orgsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        eyebrow="Platform admin"
        title="All workspaces"
        lede="Every tenant on this deployment. Create workspaces, manage who has access, and clean up strays."
        action={
          <Button variant="primary" onClick={() => setNewOpen(true)}>
            New workspace
          </Button>
        }
      />

      <div className="mt-8 space-y-5">
        {orgsQuery.isLoading ? (
          <div className="rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-text-muted">Loading workspaces…</div>
        ) : orgsQuery.isError ? (
          <div className="rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-danger">
            {orgsQuery.error.message}
          </div>
        ) : orgs.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-text-muted">
            No workspaces yet. Create the first one above.
          </div>
        ) : (
          orgs.map((org) => (
            <div
              key={org.id}
              className="overflow-hidden rounded-xl border border-border"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-text">
                      {org.name}
                    </span>
                    <Pill tone={org.vertical === "landscaping" ? "success" : "info"}>
                      {org.vertical}
                    </Pill>
                  </div>
                  <p className="mt-0.5 text-xs text-text-faint">
                    {org.slug} · {org.defaultCurrency} ·{" "}
                    {org.members.length} member{org.members.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={enterWorkspace.isPending}
                    onClick={() => enterWorkspace.mutate({ orgId: org.id })}
                  >
                    Open
                  </Button>
                  <Button size="sm" onClick={() => setAddTarget(org)}>
                    Add member
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(org)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {org.members.length === 0 ? (
                <p className="px-4 py-5 text-sm text-text-faint">No members.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-faint">
                      <th className="px-4 py-2 font-medium">User</th>
                      <th className="px-4 py-2 font-medium">Role</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {org.members.map((m) => {
                      const u = usersById.get(m.userId);
                      return (
                        <tr key={m.userId} className="border-b border-border-subtle last:border-0">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-text">
                              {u?.fullName ?? u?.email ?? m.userId}
                            </div>
                            {u?.email && u?.fullName && (
                              <div className="text-xs text-text-faint">{u.email}</div>
                            )}
                            {!u && (
                              <div className="text-xs text-warn">
                                ⚠ no login account (orphaned / seed)
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <Select
                              value={m.role}
                              disabled={updateMember.isPending}
                              onChange={(e) =>
                                updateMember.mutate({
                                  orgId: org.id,
                                  userId: m.userId,
                                  role: e.target.value as Role,
                                })
                              }
                              className="h-9 w-32"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setRemoveTarget({ org, member: m })}
                              className="text-xs font-medium text-danger hover:text-danger"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))
        )}
      </div>

      {/* All login accounts (auth.users) — incl. ones with no workspace. */}
      <div className="mt-12">
        <h2 className="font-display text-2xl font-bold tracking-tight text-text">
          Users
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Every login account on this deployment, and the workspaces they belong
          to. "Delete account" removes the login and all its memberships.
        </p>
        {usersQuery.isLoading ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-text-muted">Loading users…</div>
        ) : usersQuery.isError ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-danger">
            {usersQuery.error.message}
          </div>
        ) : users.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface px-6 py-8 text-sm text-text-muted">No login accounts.</div>
        ) : (
          <div className="data-table mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Workspaces</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium text-text">
                        {u.fullName ?? u.email ?? u.id}
                      </div>
                      {u.email && u.fullName && (
                        <div className="text-xs text-text-faint">{u.email}</div>
                      )}
                    </td>
                    <td>
                      {u.memberships.length === 0 ? (
                        <span className="text-xs text-warn">
                          ⚠ no workspace
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.memberships.map((m) => (
                            <Pill key={m.orgId} tone="neutral">
                              {m.orgName} · {m.role}
                            </Pill>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="r">
                      <button
                        type="button"
                        onClick={() => setDeleteUserTarget(u)}
                        className="text-xs font-medium text-danger hover:text-danger"
                      >
                        Delete account
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newOpen && (
        <NewWorkspaceDialog onClose={() => setNewOpen(false)} onDone={refresh} />
      )}
      {addTarget && (
        <AddMemberDialog
          org={addTarget}
          onClose={() => setAddTarget(null)}
          onDone={refresh}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          title="Remove member"
          message={`Remove ${
            usersById.get(removeTarget.member.userId)?.email ??
            removeTarget.member.userId
          } from ${removeTarget.org.name}?`}
          confirmLabel="Remove"
          cancelLabel="Cancel"
          tone="danger"
          loading={removeMember.isPending}
          error={removeMember.error?.message}
          onConfirm={() =>
            removeMember.mutate({
              orgId: removeTarget.org.id,
              userId: removeTarget.member.userId,
            })
          }
          onClose={() => setRemoveTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteWorkspaceDialog
          org={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={refresh}
        />
      )}
      {deleteUserTarget && (
        <ConfirmDialog
          title="Delete account"
          message={`Permanently delete the login ${
            deleteUserTarget.email ?? deleteUserTarget.id
          } and remove it from ${deleteUserTarget.memberships.length} workspace${
            deleteUserTarget.memberships.length === 1 ? "" : "s"
          }? This cannot be undone.`}
          confirmLabel="Delete account"
          cancelLabel="Cancel"
          tone="danger"
          loading={deleteUser.isPending}
          error={deleteUser.error?.message}
          onConfirm={() => deleteUser.mutate({ userId: deleteUserTarget.id })}
          onClose={() => setDeleteUserTarget(null)}
        />
      )}
    </div>
  );
}

function NewWorkspaceDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState<"construction" | "landscaping">(
    "construction",
  );
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const create = trpc.admin.access.createWorkspace.useMutation({
    onSuccess: onDone,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate({
      name: name.trim(),
      vertical,
      ownerEmail: ownerEmail.trim(),
      ownerFullName: ownerFullName.trim() || undefined,
    });
  }

  if (create.data) {
    return (
      <Modal title="Workspace created" onClose={onClose}>
        <p className="text-sm text-text">
          <span className="font-medium">{name}</span> is ready, owned by{" "}
          <span className="font-medium">{ownerEmail}</span>.
        </p>
        {create.data.generatedPassword ? (
          <div className="mt-4">
            <p className="text-sm text-text-muted">
              Share this one-time password with the owner so they can sign in:
            </p>
            <code className="mt-2 block rounded-xl border border-border bg-bg-subtle px-3 py-2 font-mono text-sm">
              {create.data.generatedPassword}
            </code>
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-muted">
            That email already had an account — they can sign in with their
            existing password.
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New workspace" subtitle="Provision a tenant and its owner." onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Workspace name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            maxLength={120}
          />
        </Field>
        <Field label="Vertical">
          <Select
            value={vertical}
            onChange={(e) =>
              setVertical(e.target.value as "construction" | "landscaping")
            }
          >
            <option value="construction">Construction</option>
            <option value="landscaping">Landscaping</option>
          </Select>
        </Field>
        <Field label="Owner email" required>
          <Input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Owner name">
          <Input
            value={ownerFullName}
            onChange={(e) => setOwnerFullName(e.target.value)}
            maxLength={120}
          />
        </Field>
        {create.error && (
          <p className="text-sm text-danger">{create.error.message}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending || !name.trim() || !ownerEmail.trim()}>
            {create.isPending ? "Creating…" : "Create workspace"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddMemberDialog({
  org,
  onClose,
  onDone,
}: {
  org: OrgRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const add = trpc.admin.access.addMember.useMutation({ onSuccess: onDone });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    add.mutate({
      orgId: org.id,
      email: email.trim(),
      role,
      fullName: fullName.trim() || undefined,
    });
  }

  if (add.data) {
    return (
      <Modal title="Member added" onClose={onClose}>
        <p className="text-sm text-text">
          {email} now has access to {org.name} as {role}.
        </p>
        {add.data.generatedPassword && (
          <div className="mt-4">
            <p className="text-sm text-text-muted">One-time password to share:</p>
            <code className="mt-2 block rounded-xl border border-border bg-bg-subtle px-3 py-2 font-mono text-sm">
              {add.data.generatedPassword}
            </code>
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Add member — ${org.name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <Field label="Name">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        {add.error && <p className="text-sm text-danger">{add.error.message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={add.isPending || !email.trim()}>
            {add.isPending ? "Adding…" : "Add member"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteWorkspaceDialog({
  org,
  onClose,
  onDone,
}: {
  org: OrgRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");
  const del = trpc.admin.access.deleteWorkspace.useMutation({
    onSuccess: () => {
      // If the admin was operating inside this workspace, drop the stale active org.
      setActiveOrg("");
      onDone();
      onClose();
    },
  });

  return (
    <Modal
      title="Delete workspace"
      subtitle="This permanently deletes the workspace and all its data."
      onClose={onClose}
    >
      <p className="text-sm text-text">
        Type <span className="font-medium">{org.name}</span> to confirm.
      </p>
      <div className="mt-3">
        <Input
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={org.name}
          autoFocus
        />
      </div>
      {del.error && <p className="mt-3 text-sm text-danger">{del.error.message}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={del.isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={del.isPending || confirmName.trim() !== org.name}
          onClick={() => del.mutate({ orgId: org.id, confirmName })}
        >
          {del.isPending ? "Deleting…" : "Delete workspace"}
        </Button>
      </div>
    </Modal>
  );
}
