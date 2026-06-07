import { useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { ROOM_TYPE_LABELS, type RoomType } from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useLabels, useT } from "../../lib/i18n";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
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
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            {t("rooms.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-500">{t("rooms.lede")}</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Icon name="plus" className="h-4 w-4" />
          {t("rooms.add")}
        </Button>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="w-52">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as RoomType | "")}
          >
            <option value="">{t("rooms.filter.all_types")}</option>
            {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
              <option key={t} value={t}>
                {L.roomType(t)}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-[260px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("rooms.search")}
            className="pl-10"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
        {list.isLoading ? (
          <p className="px-6 py-8 text-sm text-ink-500">{t("common.loading")}</p>
        ) : list.error ? (
          <p className="px-6 py-8 text-sm text-rose-700">{list.error.message}</p>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-display text-xl text-ink-900">
              {search.trim() || typeFilter
                ? t("rooms.empty_filtered")
                : t("rooms.empty")}
            </p>
            {!search.trim() && !typeFilter && (
              <Button
                variant="primary"
                onClick={() => setAdding(true)}
                className="mt-5"
              >
                <Icon name="plus" className="h-4 w-4" />
                {t("rooms.add_first")}
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="border-b border-ink-100 bg-paper-50">
              <tr className="text-left">
                <Th>{t("col.name")}</Th>
                <Th>{t("col.type")}</Th>
                <Th>{t("rooms.col.floor")}</Th>
                <Th align="right">{t("rooms.col.area")}</Th>
                <Th align="right">{t("rooms.col.ceiling")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="group border-b border-ink-100 transition-colors last:border-b-0 hover:bg-paper-50"
                >
                  <Td>
                    <Link
                      to={`/projects/${project.id}/rooms/${r.id}`}
                      className="block"
                    >
                      <span className="font-medium text-ink-900">{r.name}</span>
                      {r.description && (
                        <span className="block truncate text-xs text-ink-500">
                          {r.description}
                        </span>
                      )}
                    </Link>
                  </Td>
                  <Td className="text-ink-600">
                    {r.roomType ? L.roomType(r.roomType) : "—"}
                  </Td>
                  <Td className="text-ink-600">{r.floor ?? "—"}</Td>
                  <Td align="right" className="tnum text-ink-700">
                    {r.floorAreaSqM ? `${r.floorAreaSqM} m²` : "—"}
                  </Td>
                  <Td align="right" className="tnum text-ink-700">
                    {r.ceilingHeightM ? `${r.ceilingHeightM} m` : "—"}
                  </Td>
                  <Td align="right">
                    <Link
                      to={`/projects/${project.id}/rooms/${r.id}`}
                      aria-label={t("rooms.open")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                    >
                      <Icon name="chevron-right" className="h-4 w-4" />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <RoomCreateModal
          projectId={project.id}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-5 py-3 ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
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
          <p className="text-xs text-rose-600">{error}</p>
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
            {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
              <option key={t} value={t}>
                {L.roomType(t)}
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
