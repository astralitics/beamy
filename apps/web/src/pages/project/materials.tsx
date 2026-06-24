import { useState, type FormEvent, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  MATERIAL_CATEGORIES_BY_VERTICAL,
  MATERIAL_UNIT_LABELS,
  ROOM_TYPE_LABELS,
  type MaterialCategory,
  type MaterialUnit,
} from "@beamy/shared";
import {
  Button,
  ConfirmDialog,
  Icon,
  Input,
  PageHeader,
  Pill,
  Select,
} from "../../components/ui";
import { EmptyState } from "../../components/vertical-mark";
import { trpc } from "../../lib/trpc";
import { useLabels, useT } from "../../lib/i18n";
import { useVertical } from "../../lib/vertical";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type MaterialRow = inferRouterOutputs<AppRouter>["materials"]["list"][number];

/**
 * Materials — per-batch identity. Paint, tile, flooring tracked by lot
 * number. The recall layer's batch half. Two years from now when a tile
 * chips, the lot number from this row is what the supplier asks for.
 */
export default function ProjectMaterials() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const L = useLabels();
  const t = useT();
  const vertical = useVertical();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [removing, setRemoving] = useState<MaterialRow | null>(null);
  const [roomFilter, setRoomFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | "">(
    "",
  );
  const [search, setSearch] = useState("");

  const list = trpc.materials.list.useQuery({
    projectId: project.id,
    roomId: roomFilter || undefined,
    category: categoryFilter || undefined,
    search: search.trim() || undefined,
  });
  const rooms = trpc.projects.listRooms.useQuery({ projectId: project.id });

  const utils = trpc.useUtils();
  const remove = trpc.materials.remove.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate({ projectId: project.id });
      setRemoving(null);
    },
  });

  return (
    <div>
      <PageHeader
        title={t("materials.title")}
        lede={t("materials.lede")}
        action={
          !adding && !editing ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Icon name="plus" className="h-4 w-4" />
              {t("materials.add")}
            </Button>
          ) : undefined
        }
      />

      {!adding && !editing && (
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <div className="w-44">
            <Select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
            >
              <option value="">{t("filter.all_rooms")}</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as MaterialCategory | "")
              }
            >
              <option value="">{t("filter.all_categories")}</option>
              {MATERIAL_CATEGORIES_BY_VERTICAL[vertical].map((c) => (
                <option key={c} value={c}>
                  {L.materialCategory(c)}
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
              placeholder={t("materials.search")}
              className="pl-10"
            />
          </div>
        </div>
      )}

      {adding && (
        <MaterialForm
          projectId={project.id}
          mode="create"
          onClose={() => setAdding(false)}
          rooms={rooms.data ?? []}
        />
      )}
      {editing && (
        <MaterialForm
          projectId={project.id}
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
          rooms={rooms.data ?? []}
        />
      )}

      {!adding && !editing && (
        <>
          {list.isLoading ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-12 text-center text-text-muted">
              {t("common.loading")}
            </div>
          ) : list.error ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-12 text-center text-text-muted">
              {list.error.message}
            </div>
          ) : !list.data || list.data.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title={
                  search.trim() || roomFilter || categoryFilter
                    ? t("materials.empty_filtered")
                    : t("materials.empty_cta_pre")
                }
                sub={
                  search.trim() || roomFilter || categoryFilter
                    ? undefined
                    : `${t("materials.add")} ${t("materials.empty_cta_post")}`
                }
              />
            </div>
          ) : (
            <div className="data-table mt-6">
              <table>
                <thead>
                  <tr>
                    <th>{t("col.name")}</th>
                    <th className="hidden md:table-cell">{t("col.room")}</th>
                    <th className="hidden md:table-cell">{t("col.category")}</th>
                    <th className="hidden md:table-cell">{t("materials.field.lot_number")}</th>
                    <th className="r">{t("materials.field.quantity")}</th>
                    <th aria-hidden className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((m) => (
                    <MaterialRowItem
                      key={m.id}
                      material={m}
                      onEdit={() => setEditing(m)}
                      onRemove={() => setRemoving(m)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {removing && (
        <ConfirmDialog
          title={t("materials.remove_title")}
          message={t("materials.remove_confirm", { name: removing.name })}
          confirmLabel={t("common.remove")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={remove.isPending}
          error={remove.error?.message}
          onConfirm={() => remove.mutate({ id: removing.id })}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

// ────────────────────── row ──────────────────────

function MaterialRowItem({
  material,
  onEdit,
  onRemove,
}: {
  material: MaterialRow;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const L = useLabels();
  const t = useT();

  const idLine: string[] = [];
  if (material.manufacturer) idLine.push(material.manufacturer);
  if (material.productCode) idLine.push(material.productCode);
  if (material.colorName) idLine.push(material.colorName);

  return (
    <tr className="clickable group" onClick={onEdit}>
      <td>
        <span className="font-medium text-text group-hover:text-accent">
          {material.name}
        </span>
        {idLine.length > 0 && (
          <span className="mt-0.5 block truncate text-[12px] text-text-muted">
            {idLine.join(" · ")}
          </span>
        )}
        {(material.atticStockQuantity && material.quantityUnit) ||
        material.vendor ||
        material.coverageNotes ||
        material.notes ? (
          <span className="mt-1 block space-y-0.5 text-[12px] text-text-faint">
            {material.atticStockQuantity && material.quantityUnit && (
              <span className="block">
                {t("materials.attic_stock")} · {material.atticStockQuantity}{" "}
                {L.materialUnit(material.quantityUnit)}
                {material.atticStockLocation && (
                  <span> @ {material.atticStockLocation}</span>
                )}
              </span>
            )}
            {material.vendor && (
              <span className="block">
                {t("col.vendor")} · {material.vendor.name}
              </span>
            )}
            {material.coverageNotes && (
              <span className="block italic">{material.coverageNotes}</span>
            )}
            {material.notes && (
              <span className="block whitespace-pre-wrap">
                {material.notes}
              </span>
            )}
          </span>
        ) : null}
      </td>
      <td className="hidden text-text-muted md:table-cell">
        {material.room?.name ?? "—"}
      </td>
      <td className="hidden text-text-muted md:table-cell">
        {L.materialCategory(material.category)}
      </td>
      <td className="hidden md:table-cell">
        {material.lotNumber ? (
          <Pill tone="warn">
            {t("materials.lot")} · {material.lotNumber}
          </Pill>
        ) : (
          <span className="text-text-faint">—</span>
        )}
      </td>
      <td className="r whitespace-nowrap text-text-muted tnum">
        {material.quantity && material.quantityUnit
          ? `${material.quantity} ${L.materialUnit(material.quantityUnit)}`
          : "—"}
      </td>
      <td className="r">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-[12px] text-text-muted transition-colors hover:text-danger"
        >
          {t("common.remove")}
        </button>
      </td>
    </tr>
  );
}

// ────────────────────── form ──────────────────────

type RoomLite = { id: string; name: string; roomType: string | null };

function MaterialForm({
  projectId,
  mode,
  existing,
  rooms,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: MaterialRow;
  rooms: RoomLite[];
  onClose: () => void;
}) {
  const L = useLabels();
  const t = useT();
  const vertical = useVertical();
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState<MaterialCategory>(
    existing?.category ?? "paint",
  );
  const [roomId, setRoomId] = useState(existing?.roomId ?? "");
  const [manufacturer, setManufacturer] = useState(
    existing?.manufacturer ?? "",
  );
  const [productCode, setProductCode] = useState(existing?.productCode ?? "");
  const [colorName, setColorName] = useState(existing?.colorName ?? "");
  const [lotNumber, setLotNumber] = useState(existing?.lotNumber ?? "");
  const [quantity, setQuantity] = useState(existing?.quantity ?? "");
  const [quantityUnit, setQuantityUnit] = useState<MaterialUnit | "">(
    existing?.quantityUnit ?? "",
  );
  const [atticStockQuantity, setAtticStockQuantity] = useState(
    existing?.atticStockQuantity ?? "",
  );
  const [atticStockLocation, setAtticStockLocation] = useState(
    existing?.atticStockLocation ?? "",
  );
  const [coverageNotes, setCoverageNotes] = useState(
    existing?.coverageNotes ?? "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.materials.create.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.materials.update.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const q = quantity.trim();
    const aq = atticStockQuantity.trim();
    if ((q || aq) && !quantityUnit) {
      setError(t("materials.error_unit_required"));
      return;
    }
    const base = {
      category,
      name: name.trim(),
      roomId: roomId || undefined,
      manufacturer: manufacturer.trim() || undefined,
      productCode: productCode.trim() || undefined,
      colorName: colorName.trim() || undefined,
      lotNumber: lotNumber.trim() || undefined,
      quantity: q || undefined,
      quantityUnit: (quantityUnit || undefined) as MaterialUnit | undefined,
      atticStockQuantity: aq || undefined,
      atticStockLocation: atticStockLocation.trim() || undefined,
      coverageNotes: coverageNotes.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    if (mode === "edit" && existing) {
      update.mutate({ id: existing.id, patch: base });
    } else {
      create.mutate({ projectId, ...base });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-2xl border border-border bg-surface p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {mode === "edit"
          ? t("materials.form_title_edit")
          : t("materials.form_title_new")}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label={t("materials.field.name")} wide>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder={t("materials.field.name_placeholder")}
          />
        </Field>
        <Field label={t("col.category")}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MaterialCategory)}
            className={selectCls}
          >
            {MATERIAL_CATEGORIES_BY_VERTICAL[vertical].map((c) => (
              <option key={c} value={c}>
                {L.materialCategory(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("materials.field.primary_room")}>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className={selectCls}
          >
            <option value="">{t("materials.field.room_none")}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.roomType
                  ? ` (${L.roomType(r.roomType as keyof typeof ROOM_TYPE_LABELS)})`
                  : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("materials.field.manufacturer")}>
          <input
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            className={inputCls}
            placeholder="Benjamin Moore"
          />
        </Field>
        <Field label={t("materials.field.product_code")}>
          <input
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            className={inputCls}
            placeholder="OC-149"
          />
        </Field>
        <Field label={t("materials.field.color")}>
          <input
            value={colorName}
            onChange={(e) => setColorName(e.target.value)}
            className={inputCls}
            placeholder="Decorator's White / matte"
          />
        </Field>
        <Field label={t("materials.field.lot_number")}>
          <input
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            className={inputCls}
            placeholder="482-A"
          />
        </Field>
        <Field label={t("materials.field.quantity")}>
          <div className="flex gap-2">
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={`${inputCls} !w-auto flex-1`}
              placeholder="12.5"
              inputMode="decimal"
            />
            <select
              value={quantityUnit}
              onChange={(e) =>
                setQuantityUnit(e.target.value as MaterialUnit | "")
              }
              className={`${selectCls} w-28`}
            >
              <option value="">{t("materials.field.unit")}</option>
              {(Object.keys(MATERIAL_UNIT_LABELS) as MaterialUnit[]).map(
                (u) => (
                  <option key={u} value={u}>
                    {L.materialUnit(u)}
                  </option>
                ),
              )}
            </select>
          </div>
        </Field>
        <Field label={t("materials.field.attic_stock")}>
          <input
            value={atticStockQuantity}
            onChange={(e) => setAtticStockQuantity(e.target.value)}
            className={inputCls}
            placeholder="2.5"
            inputMode="decimal"
          />
        </Field>
        <Field label={t("materials.field.attic_stock_location")} wide>
          <input
            value={atticStockLocation}
            onChange={(e) => setAtticStockLocation(e.target.value)}
            className={inputCls}
            placeholder={t("materials.field.attic_stock_location_placeholder")}
          />
        </Field>
        <Field label={t("materials.field.coverage_notes")} wide>
          <input
            value={coverageNotes}
            onChange={(e) => setCoverageNotes(e.target.value)}
            className={inputCls}
            placeholder={t("materials.field.coverage_notes_placeholder")}
          />
        </Field>
        <Field label={t("detail.notes")} wide>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-border px-3 py-1 text-xs hover:bg-bg-subtle"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-accent px-3 py-1 text-xs font-semibold text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting
            ? t("common.saving")
            : mode === "edit"
              ? t("common.save")
              : t("common.add")}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "block w-full rounded-xl border border-border bg-surface px-3.5 h-10 text-[14px] text-text placeholder:text-text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

const selectCls =
  "block w-full rounded-xl border border-border bg-surface px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

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
      <span className="text-text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
