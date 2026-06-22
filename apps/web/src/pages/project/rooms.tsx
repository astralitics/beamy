import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { ROOM_TYPES_BY_VERTICAL, type RoomType } from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useLabels, useT } from "../../lib/i18n";
import { useVertical } from "../../lib/vertical";
import { EmptyState } from "../../components/vertical-mark";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type RoomRow =
  inferRouterOutputs<AppRouter>["projects"]["listRooms"][number];

export default function ProjectRooms() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const L = useLabels();
  const t = useT();
  const vertical = useVertical();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [typeFilter, setTypeFilter] = useState<RoomType | "">("");
  const [search, setSearch] = useState("");

  const list = trpc.projects.listRooms.useQuery({ projectId: project.id });

  const filtered = useMemo(() => {
    const data = list.data ?? [];
    const s = search.trim().toLowerCase();
    return data.filter((r) => {
      if (typeFilter && r.roomType !== typeFilter) return false;
      if (!s) return true;
      const blob = [r.name, r.description, r.floor, r.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(s);
    });
  }, [list.data, typeFilter, search]);

  return (
    <div className="animate-fade">
      <PageHeader
        title={t("rooms.title")}
        lede={t("rooms.lede")}
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Icon name="plus" className="h-4 w-4" />
            {t("rooms.add")}
          </Button>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as RoomType | "")}
          >
            <option value="">{t("rooms.filter.all_types")}</option>
            {ROOM_TYPES_BY_VERTICAL[vertical].map((rt) => (
              <option key={rt} value={rt}>
                {L.roomType(rt)}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-[240px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("rooms.search")}
            className="pl-10"
          />
        </div>
      </div>

      {list.isLoading ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-12 text-center text-text-muted">
          {t("common.loading")}
        </div>
      ) : list.error ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-12 text-center text-danger">
          {list.error.message}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={
              search.trim() || typeFilter
                ? t("rooms.empty_filtered")
                : t("rooms.empty")
            }
            action={
              !search.trim() && !typeFilter ? (
                <Button variant="primary" onClick={() => setAdding(true)}>
                  <Icon name="plus" className="h-4 w-4" />
                  {t("rooms.add_first")}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="data-table mt-6">
          <table>
            <thead>
              <tr>
                <th>{t("col.name")}</th>
                <th>{t("col.type")}</th>
                <th>{t("rooms.col.floor")}</th>
                <th className="r">{t("rooms.col.area")}</th>
                <th className="r">{t("rooms.col.ceiling")}</th>
                <th aria-hidden className="r w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="clickable group"
                  onClick={() =>
                    navigate(`/projects/${project.id}/rooms/${r.id}`)
                  }
                >
                  <td>
                    <Link
                      to={`/projects/${project.id}/rooms/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block"
                    >
                      <span className="font-medium text-text group-hover:text-accent">{r.name}</span>
                      {r.description && (
                        <span className="block truncate text-text-muted">
                          {r.description}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="text-text-muted">
                    {r.roomType ? L.roomType(r.roomType) : "—"}
                  </td>
                  <td className="text-text-muted">{r.floor ?? "—"}</td>
                  <td className="r">
                    {r.floorAreaSqM ? `${r.floorAreaSqM} m²` : "—"}
                  </td>
                  <td className="r">
                    {r.ceilingHeightM ? `${r.ceilingHeightM} m` : "—"}
                  </td>
                  <td className="r">
                    <Icon
                      name="chevron-right"
                      className="ml-auto h-4 w-4 text-text-faint transition-colors group-hover:text-accent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <RoomCreateModal
          projectId={project.id}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function RoomCreateModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const L = useLabels();
  const t = useT();
  const vertical = useVertical();
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<RoomType | "">("");
  const [floor, setFloor] = useState("");
  const [description, setDescription] = useState("");
  const [floorAreaSqM, setFloorAreaSqM] = useState("");
  const [ceilingHeightM, setCeilingHeightM] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.projects.addRoom.useMutation({
    onSuccess: () => {
      utils.projects.listRooms.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate({
      projectId,
      name: name.trim(),
      roomType: roomType || undefined,
      description: description.trim() || undefined,
      floor: floor.trim() || undefined,
      floorAreaSqM: floorAreaSqM.trim() || undefined,
      ceilingHeightM: ceilingHeightM.trim() || undefined,
      photoUrl: photoUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Modal
      title={t("rooms.modal.title")}
      subtitle={t("rooms.modal.subtitle")}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-danger">{error}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="room-create-form"
              variant="primary"
              disabled={create.isPending}
            >
              {create.isPending ? t("common.saving") : t("rooms.add")}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="room-create-form"
        onSubmit={onSubmit}
        className="grid gap-5 sm:grid-cols-2"
      >
        <Field label={t("col.name")} required wide>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder={t("rooms.field.name_placeholder")}
          />
        </Field>
        <Field label={t("col.type")}>
          <Select
            value={roomType}
            onChange={(e) => setRoomType(e.target.value as RoomType | "")}
          >
            <option value="">—</option>
            {ROOM_TYPES_BY_VERTICAL[vertical].map((rt) => (
              <option key={rt} value={rt}>
                {L.roomType(rt)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("rooms.field.floor")} hint={t("rooms.field.floor_hint")}>
          <Input
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="P6"
          />
        </Field>
        <Field label={t("rooms.field.floor_area")}>
          <Input
            value={floorAreaSqM}
            onChange={(e) => setFloorAreaSqM(e.target.value)}
            placeholder="32.5"
            inputMode="decimal"
          />
        </Field>
        <Field label={t("rooms.field.ceiling_height")}>
          <Input
            value={ceilingHeightM}
            onChange={(e) => setCeilingHeightM(e.target.value)}
            placeholder="2.7"
            inputMode="decimal"
          />
        </Field>
        <Field
          label={t("col.description")}
          hint={t("rooms.field.description_hint")}
          wide
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("rooms.field.description_placeholder")}
          />
        </Field>
        <Field label={t("rooms.field.photo_url")} wide>
          <Input
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label={t("detail.notes")} wide>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </Field>
      </form>
    </Modal>
  );
}
