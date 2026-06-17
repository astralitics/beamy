import { useState, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { trpc } from "../lib/trpc";
import { setActiveOrg } from "../lib/active-org";

type WorkspaceRow = inferRouterOutputs<AppRouter>["platformAdmin"]["listWorkspaces"][number];

/**
 * Platform-admin "Workspaces" page — the cross-tenant control surface (see/enter/delete every
 * tenant). Gated by `me.isPlatformAdmin`; the route is reachable in the app shell but renders a
 * polite "not available" to non-admins (the server procedures also hard-deny them).
 */
export default function AdminWorkspacesPage() {
  const adminQ = trpc.me.isPlatformAdmin.useQuery();
  const isAdmin = adminQ.data?.isPlatformAdmin ?? false;

  const whoami = trpc.me.whoami.useQuery(undefined, { enabled: isAdmin });
  const currentOrgId = whoami.data?.org.id ?? null;

  const list = trpc.platformAdmin.listWorkspaces.useQuery(undefined, { enabled: isAdmin });
  const [deleting, setDeleting] = useState<WorkspaceRow | null>(null);

  if (adminQ.isLoading) {
    return <Wrap><p className="p-6 text-sm text-slate-500">Loading…</p></Wrap>;
  }
  if (!isAdmin) {
    return (
      <Wrap>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Not available</h1>
          <p className="mt-2 text-sm text-slate-600">This area is for platform administrators only.</p>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All workspaces</h1>
          <p className="mt-1 text-sm text-slate-600">
            Every tenant in this environment. Enter one to operate inside it, or delete a stray workspace.
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">platform admin</span>
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading workspaces…</p>
        ) : list.error ? (
          <p className="p-6 text-sm text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No workspaces.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Workspace</Th>
                <Th className="w-28">Vertical</Th>
                <Th className="w-20 text-right">Members</Th>
                <Th className="w-20 text-right">Projects</Th>
                <Th>Owner</Th>
                <Th className="w-28">Created</Th>
                <Th className="w-40 text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((w) => {
                const isCurrent = w.id === currentOrgId;
                return (
                  <tr key={w.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">
                      {w.name}
                      {isCurrent && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">current</span>
                      )}
                    </Td>
                    <Td className="text-slate-600">{w.vertical}</Td>
                    <Td className="text-right text-slate-600">{w.members}</Td>
                    <Td className="text-right text-slate-600">{w.projects}</Td>
                    <Td className="text-slate-500">{w.ownerEmail ?? "—"}</Td>
                    <Td className="text-slate-500">{new Date(w.createdAt).toLocaleDateString()}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-3">
                        {isCurrent ? (
                          <span className="text-xs text-slate-400">you're here</span>
                        ) : (
                          <EnterButton orgId={w.id} />
                        )}
                        <button
                          onClick={() => setDeleting(w)}
                          disabled={isCurrent}
                          title={isCurrent ? "Switch out of this workspace before deleting it" : undefined}
                          className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {deleting && (
        <DeleteModal
          workspace={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void list.refetch();
          }}
        />
      )}
    </Wrap>
  );
}

function EnterButton({ orgId }: { orgId: string }) {
  const enter = trpc.platformAdmin.enterWorkspace.useMutation({
    onSuccess: () => {
      setActiveOrg(orgId);
      window.location.assign("/"); // hard reload so x-active-org takes effect
    },
  });
  return (
    <button
      onClick={() => enter.mutate({ orgId })}
      disabled={enter.isPending}
      className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
    >
      {enter.isPending ? "Entering…" : "Enter →"}
    </button>
  );
}

function DeleteModal({
  workspace,
  onClose,
  onDeleted,
}: {
  workspace: WorkspaceRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const del = trpc.platformAdmin.deleteWorkspace.useMutation({
    onSuccess: onDeleted,
    onError: (e) => setError(e.message),
  });
  const matches = confirmName.trim() === workspace.name.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-16"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="p-6">
          <h2 className="text-lg font-semibold tracking-tight text-rose-700">Delete workspace</h2>
          <p className="mt-2 text-sm text-slate-600">
            This permanently deletes <span className="font-medium text-slate-900">{workspace.name}</span> and
            everything in it — {workspace.members} member(s), {workspace.projects} project(s), and all
            related data. This cannot be undone.
          </p>
          <label className="mt-4 block text-sm">
            <span className="text-slate-700">Type the workspace name to confirm</span>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={workspace.name}
              autoFocus
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
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
              type="button"
              disabled={!matches || del.isPending}
              onClick={() => {
                setError(null);
                del.mutate({ orgId: workspace.id, confirmName: confirmName.trim() });
              }}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40"
            >
              {del.isPending ? "Deleting…" : "Delete workspace"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Wrap({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-10">{children}</div>;
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
