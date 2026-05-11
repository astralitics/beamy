import { useOutletContext } from "react-router-dom";
import { useState, type FormEvent, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { ROOM_TYPE_LABELS, type RoomType } from "@beamy/shared";
import { trpc } from "../../lib/trpc";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type RoomRow = inferRouterOutputs<AppRouter>["projects"]["listRooms"][number];

/**
 * Work plan — the rooms layer. The starting point for everything spatial:
 * assets, materials, drawings, RFIs all reference room IDs from here.
 *
 * (More work-plan content lands later: phases, scope items, schedule.)
 */
export default function ProjectWorkPlan() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RoomRow | null>(null);
  const list = trpc.projects.listRooms.useQuery({ projectId: project.id });

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-blueprint-900">
            Rooms
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Each room anchors the assets, materials, and finishes that get
            installed in it.
          </p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Add room
          </button>
        )}
      </div>

      {adding && (
        <RoomForm
          projectId={project.id}
          mode="create"
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <RoomForm
          projectId={project.id}
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {list.isLoading ? (
          <p className="col-span-full text-xs text-slate-500">Loading…</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="col-span-full rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            No rooms yet. Click <strong>Add room</strong> to start.
          </p>
        ) : (
          list.data.map((r) => (
            <RoomRowItem key={r.id} room={r} onEdit={() => setEditing(r)} />
          ))
        )}
      </div>
    </div>
  );
}

function RoomRowItem({
  room,
  onEdit,
}: {
  room: RoomRow;
  onEdit: () => void;
}) {
  const utils = trpc.useUtils();
  const remove = trpc.projects.removeRoom.useMutation({
    onSuccess: () =>
      utils.projects.listRooms.invalidate({ projectId: room.projectId }),
  });
  return (
    <div className="flex items-center gap-3 rounded-md border border-paper-200 bg-white px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{room.name}</span>
          {room.roomType && (
            <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              {ROOM_TYPE_LABELS[room.roomType]}
            </span>
          )}
        </div>
        {room.notes && (
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {room.notes}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-slate-500 hover:text-slate-900"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm(`Remove ${room.name}?`)) remove.mutate({ id: room.id });
        }}
        disabled={remove.isPending}
        className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
      >
        {remove.isPending ? "…" : "Remove"}
      </button>
    </div>
  );
}

function RoomForm({
  projectId,
  mode,
  existing,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: RoomRow;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [roomType, setRoomType] = useState<RoomType | "">(
    existing?.roomType ?? "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const add = trpc.projects.addRoom.useMutation({
    onSuccess: () => {
      utils.projects.listRooms.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const upd = trpc.projects.updateRoom.useMutation({
    onSuccess: () => {
      utils.projects.listRooms.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = add.isPending || upd.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const base = {
      name: name.trim(),
      roomType: (roomType || undefined) as RoomType | undefined,
      notes: notes.trim() || undefined,
    };
    if (mode === "edit" && existing) {
      upd.mutate({ id: existing.id, patch: base });
    } else {
      add.mutate({ projectId, ...base });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-md border border-paper-200 bg-white p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="Kitchen / Primary Bath / Office"
          />
        </Field>
        <Field label="Type">
          <select
            value={roomType}
            onChange={(e) => setRoomType(e.target.value as RoomType | "")}
            className={selectCls}
          >
            <option value="">— (none)</option>
            {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
              <option key={t} value={t}>
                {ROOM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" wide>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
            placeholder="Square footage, ceiling height, scope notes…"
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-paper-200 px-3 py-1 text-xs hover:bg-paper-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : mode === "edit" ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "block w-full rounded-md border border-paper-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

const selectCls =
  "block w-full rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
