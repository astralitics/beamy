import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  PROJECT_TYPE_LABELS,
  ROOM_TYPE_LABELS,
  type ProjectStatus,
  type RoomType,
} from "@beamy/shared";
import { trpc } from "../lib/trpc";
import { useFormatters } from "../lib/i18n";

type RoomRow = inferRouterOutputs<AppRouter>["projects"]["listRooms"][number];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fmt = useFormatters();
  const project = trpc.projects.get.useQuery({ id: id ?? "" }, { enabled: !!id });

  if (!id) return null;
  if (project.isLoading) {
    return <p className="p-10 text-sm text-slate-500">Loading…</p>;
  }
  if (project.error) {
    return (
      <div className="p-10">
        <p className="text-sm text-rose-700">{project.error.message}</p>
        <Link to="/projects" className="mt-4 inline-block text-sm text-sky-600">
          ← Back to projects
        </Link>
      </div>
    );
  }
  if (!project.data) return null;

  const p = project.data;
  return (
    <div className="mx-auto max-w-5xl p-10">
      <Link
        to="/projects"
        className="text-xs text-slate-500 hover:text-slate-900"
      >
        ← Projects
      </Link>

      <div className="mt-3 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
            <StatusPill status={p.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>{PROJECT_TYPE_LABELS[p.projectType]}</span>
            {p.client && (
              <span>
                Client: <span className="text-slate-900">{p.client.name}</span>
              </span>
            )}
            {p.address && <span>{p.address}</span>}
            {p.contractAmount && p.contractCurrency && (
              <span>
                Contract:{" "}
                <span className="text-slate-900">
                  {fmt.currency(p.contractAmount, p.contractCurrency)}
                </span>
              </span>
            )}
            {p.startedAt && (
              <span>
                Started: <span className="text-slate-900">{fmt.date(p.startedAt)}</span>
              </span>
            )}
          </div>
          {p.notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
              {p.notes}
            </p>
          )}
        </div>
      </div>

      <RoomsSection projectId={p.id} />

      <div className="mt-12 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Coming next in M2</p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          <li>Assets — manufacturer / model / serial / warranty / install</li>
          <li>Materials — paint / tile / flooring with lot numbers + coverage</li>
          <li>Photos — tagged to room / asset / material</li>
          <li>Recall search — <em>"what fridge in the Anderson kitchen?"</em></li>
        </ul>
      </div>
    </div>
  );
}

// ────────────────────── rooms section ──────────────────────

function RoomsSection({ projectId }: { projectId: string }) {
  const list = trpc.projects.listRooms.useQuery({ projectId });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RoomRow | null>(null);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Rooms</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Each room anchors the assets, materials, and finishes that get
            installed in it.
          </p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
          >
            Add room
          </button>
        )}
      </div>

      {adding && (
        <RoomForm
          projectId={projectId}
          mode="create"
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <RoomForm
          projectId={projectId}
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {list.isLoading ? (
          <p className="col-span-full text-xs text-slate-500">Loading…</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="col-span-full rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            No rooms yet. Click <strong>Add room</strong> to start.
          </p>
        ) : (
          list.data.map((r) => (
            <RoomRowItem key={r.id} room={r} onEdit={() => setEditing(r)} />
          ))
        )}
      </div>
    </section>
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
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{room.name}</span>
          {room.roomType && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
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
      className="mt-3 rounded-md border border-slate-200 bg-white p-3"
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
          className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
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

// ────────────────────── shared ──────────────────────

const STATUS_PILL_CLS: Record<ProjectStatus, string> = {
  lead: "bg-sky-100 text-sky-800",
  active: "bg-emerald-100 text-emerald-800",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-violet-100 text-violet-800",
  archived: "bg-slate-100 text-slate-700",
};

function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLS[status]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

const inputCls =
  "block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

const selectCls =
  "block w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

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
