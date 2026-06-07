import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { ROOM_TYPE_LABELS, type RoomType } from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useLabels } from "../../lib/i18n";
import {
  Button,
  Field,
  Icon,
  Input,
  Select,
  Textarea,
} from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];

export default function ProjectRoomDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const L = useLabels();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const room = trpc.projects.getRoom.useQuery(
    { id: roomId ?? "" },
    { enabled: !!roomId },
  );

  const utils = trpc.useUtils();
  const update = trpc.projects.updateRoom.useMutation({
    onSuccess: () => {
      utils.projects.listRooms.invalidate({ projectId: project.id });
      utils.projects.getRoom.invalidate({ id: roomId ?? "" });
      setEditing(false);
    },
    onError: (err) => setError(err.message),
  });
  const remove = trpc.projects.removeRoom.useMutation({
    onSuccess: () => {
      utils.projects.listRooms.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/rooms`);
    },
  });

  // Editable copies — populated when the room loads.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<RoomType | "">("");
  const [floor, setFloor] = useState("");
  const [description, setDescription] = useState("");
  const [floorAreaSqM, setFloorAreaSqM] = useState("");
  const [ceilingHeightM, setCeilingHeightM] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!room.data) return;
    setName(room.data.name);
    setRoomType((room.data.roomType ?? "") as RoomType | "");
    setFloor(room.data.floor ?? "");
    setDescription(room.data.description ?? "");
    setFloorAreaSqM(room.data.floorAreaSqM ?? "");
    setCeilingHeightM(room.data.ceilingHeightM ?? "");
    setPhotoUrl(room.data.photoUrl ?? "");
    setNotes(room.data.notes ?? "");
  }, [room.data]);

  if (!roomId) return null;
  if (room.isLoading) return <p className="text-sm text-ink-500">Loading…</p>;
  if (room.error)
    return <p className="text-sm text-rose-700">{room.error.message}</p>;
  if (!room.data) return null;
  const r = room.data;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    update.mutate({
      id: r.id,
      patch: {
        name: name.trim(),
        roomType: roomType || undefined,
        floor: floor.trim() || null,
        description: description.trim() || null,
        floorAreaSqM: floorAreaSqM.trim() || null,
        ceilingHeightM: ceilingHeightM.trim() || null,
        photoUrl: photoUrl.trim() || null,
        notes: notes.trim() || null,
      },
    });
  }

  return (
    <div className="animate-fade space-y-12">
      <header>
        <Link
          to={`/projects/${project.id}/rooms`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          Rooms
        </Link>

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[13px] text-ink-500">
              {r.roomType ? L.roomType(r.roomType) : "Room"}
              {r.floor ? ` · ${r.floor}` : ""}
            </p>
            <h1 className="mt-2 font-display text-4xl font-normal leading-[1.1] tracking-tightest text-ink-900">
              {r.name}
            </h1>
            {r.description && !editing && (
              <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-600">
                {r.description}
              </p>
            )}
          </div>
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </header>

      {!editing && (
        <>
          <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Type">
              {r.roomType ? L.roomType(r.roomType) : "—"}
            </Fact>
            <Fact label="Floor">{r.floor ?? "—"}</Fact>
            <Fact label="Floor area">
              {r.floorAreaSqM ? `${r.floorAreaSqM} m²` : "—"}
            </Fact>
            <Fact label="Ceiling height">
              {r.ceilingHeightM ? `${r.ceilingHeightM} m` : "—"}
            </Fact>
          </section>

          {r.photoUrl && (
            <section>
              <div className="overflow-hidden rounded-xl border border-ink-200/70 bg-white">
                <img
                  src={r.photoUrl}
                  alt={r.name}
                  className="aspect-[16/9] w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </section>
          )}

          {r.notes && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                Notes
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
                {r.notes}
              </p>
            </section>
          )}

          <section className="border-t border-ink-100 pt-8">
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `Delete "${r.name}"? Items in this room (assets, furniture, materials) will be detached, not deleted.`,
                  )
                ) {
                  remove.mutate({ id: r.id });
                }
              }}
              className="text-[13px] text-rose-600 hover:text-rose-800"
            >
              Delete this room
            </button>
          </section>
        </>
      )}

      {editing && (
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" required wide>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Type">
              <Select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as RoomType | "")}
              >
                <option value="">—</option>
                {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
                  <option key={t} value={t}>
                    {L.roomType(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Floor / level">
              <Input
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="P6"
              />
            </Field>
            <Field label="Floor area (m²)">
              <Input
                value={floorAreaSqM}
                onChange={(e) => setFloorAreaSqM(e.target.value)}
                placeholder="32.5"
                inputMode="decimal"
              />
            </Field>
            <Field label="Ceiling height (m)">
              <Input
                value={ceilingHeightM}
                onChange={(e) => setCeilingHeightM(e.target.value)}
                placeholder="2.7"
                inputMode="decimal"
              />
            </Field>
            <Field label="Description" wide>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </Field>
            <Field label="Photo URL" wide>
              <Input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Notes" wide>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </Field>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {label}
      </p>
      <p className="mt-1 truncate text-[15px] font-medium text-ink-900">
        {children}
      </p>
    </div>
  );
}
