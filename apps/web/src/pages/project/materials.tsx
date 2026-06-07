import { useState, type FormEvent, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  MATERIAL_CATEGORY_LABELS,
  MATERIAL_UNIT_LABELS,
  ROOM_TYPE_LABELS,
  type MaterialCategory,
  type MaterialUnit,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useLabels } from "../../lib/i18n";

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
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
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

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            Materials
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Lot-tracked finishes — paint, tile, flooring.
          </p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800"
          >
            Add material
          </button>
        )}
      </div>

      {!adding && !editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">All rooms</option>
            {rooms.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as MaterialCategory | "")
            }
            className={selectCls}
          >
            <option value="">All categories</option>
            {(Object.keys(MATERIAL_CATEGORY_LABELS) as MaterialCategory[]).map(
              (c) => (
                <option key={c} value={c}>
                  {L.materialCategory(c)}
                </option>
              ),
            )}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, manufacturer, color, lot…"
            className="flex-1 rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
          />
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

      <div className="mt-4">
        {list.isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : list.error ? (
          <p className="text-xs text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            {search.trim() || roomFilter || categoryFilter
              ? "No materials match these filters."
              : (
                <>
                  No materials yet. Click <strong>Add material</strong> to log
                  the first batch — paint code, tile lot, flooring sku.
                </>
              )}
          </p>
        ) : (
          <div className="grid gap-2">
            {list.data.map((m) => (
              <MaterialRowItem
                key={m.id}
                material={m}
                onEdit={() => setEditing(m)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────── row ──────────────────────

function MaterialRowItem({
  material,
  onEdit,
}: {
  material: MaterialRow;
  onEdit: () => void;
}) {
  const L = useLabels();
  const utils = trpc.useUtils();
  const remove = trpc.materials.remove.useMutation({
    onSuccess: () =>
      utils.materials.list.invalidate({ projectId: material.projectId }),
  });

  const idLine: string[] = [];
  if (material.manufacturer) idLine.push(material.manufacturer);
  if (material.productCode) idLine.push(material.productCode);
  if (material.colorName) idLine.push(material.colorName);

  return (
    <div className="rounded-md border border-paper-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-blueprint-900">
              {material.name}
            </span>
            <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              {L.materialCategory(material.category)}
            </span>
            {material.room && (
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                · {material.room.name}
              </span>
            )}
          </div>
          {idLine.length > 0 && (
            <div className="mt-0.5 text-xs text-slate-600">
              {idLine.join(" · ")}
            </div>
          )}
          {material.lotNumber && (
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-safety-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-safety-800 ring-1 ring-inset ring-safety-200">
              lot · {material.lotNumber}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] uppercase tracking-wider text-slate-400">
            {material.quantity && material.quantityUnit && (
              <span>
                {material.quantity} {L.materialUnit(material.quantityUnit)}
              </span>
            )}
            {material.atticStockQuantity && material.quantityUnit && (
              <span>
                attic stock · {material.atticStockQuantity}{" "}
                {L.materialUnit(material.quantityUnit)}
                {material.atticStockLocation && (
                  <span> @ {material.atticStockLocation}</span>
                )}
              </span>
            )}
            {material.vendor && <span>vendor · {material.vendor.name}</span>}
          </div>
          {material.coverageNotes && (
            <p className="mt-1.5 text-xs italic text-slate-500">
              {material.coverageNotes}
            </p>
          )}
          {material.notes && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">
              {material.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
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
              if (confirm(`Remove ${material.name}?`)) {
                remove.mutate({ id: material.id });
              }
            }}
            disabled={remove.isPending}
            className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
          >
            {remove.isPending ? "…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
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
      setError("Pick a unit when entering a quantity.");
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
      className="mt-4 rounded-md border border-paper-200 bg-white p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {mode === "edit" ? "Edit · material" : "New · material"}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Name *" wide>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="e.g. Benjamin Moore Decorator's White"
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MaterialCategory)}
            className={selectCls}
          >
            {(Object.keys(MATERIAL_CATEGORY_LABELS) as MaterialCategory[]).map(
              (c) => (
                <option key={c} value={c}>
                  {L.materialCategory(c)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Primary room">
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className={selectCls}
          >
            <option value="">— (none)</option>
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
        <Field label="Manufacturer">
          <input
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            className={inputCls}
            placeholder="Benjamin Moore"
          />
        </Field>
        <Field label="Product code">
          <input
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
            className={inputCls}
            placeholder="OC-149"
          />
        </Field>
        <Field label="Color / finish">
          <input
            value={colorName}
            onChange={(e) => setColorName(e.target.value)}
            className={inputCls}
            placeholder="Decorator's White / matte"
          />
        </Field>
        <Field label="Lot number">
          <input
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            className={inputCls}
            placeholder="482-A"
          />
        </Field>
        <Field label="Quantity">
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
              <option value="">unit</option>
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
        <Field label="Attic stock left over">
          <input
            value={atticStockQuantity}
            onChange={(e) => setAtticStockQuantity(e.target.value)}
            className={inputCls}
            placeholder="2.5"
            inputMode="decimal"
          />
        </Field>
        <Field label="Attic stock location" wide>
          <input
            value={atticStockLocation}
            onChange={(e) => setAtticStockLocation(e.target.value)}
            className={inputCls}
            placeholder="basement shelf · north wall"
          />
        </Field>
        <Field label="Coverage notes" wide>
          <input
            value={coverageNotes}
            onChange={(e) => setCoverageNotes(e.target.value)}
            className={inputCls}
            placeholder="all kitchen + dining walls + ceiling"
          />
        </Field>
        <Field label="Notes" wide>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
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
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

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
