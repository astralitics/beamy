import { useState, type FormEvent, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  ASSET_CATEGORY_LABELS,
  ROOM_TYPE_LABELS,
  type AssetCategory,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type AssetRow = inferRouterOutputs<AppRouter>["assets"]["list"][number];

/**
 * Assets — per-instance physical items installed on the project. The
 * "what fridge in the kitchen?" record. M2's recall layer, instance half.
 */
export default function ProjectAssets() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [roomFilter, setRoomFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "">("");
  const [search, setSearch] = useState("");

  const list = trpc.assets.list.useQuery({
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
          <h2 className="text-lg font-semibold tracking-tight text-blueprint-900">
            Assets
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Per-instance items installed on this project — manufacturer, model,
            serial, install date, warranty. Two years from now, this row
            answers <em className="not-italic">"what fridge in the kitchen?"</em>
          </p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Add asset
          </button>
        )}
      </div>

      {/* Filters */}
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
              setCategoryFilter(e.target.value as AssetCategory | "")
            }
            className={selectCls}
          >
            <option value="">All categories</option>
            {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map(
              (c) => (
                <option key={c} value={c}>
                  {ASSET_CATEGORY_LABELS[c]}
                </option>
              ),
            )}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, manufacturer, model, serial…"
            className="flex-1 rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
      )}

      {adding && (
        <AssetForm
          projectId={project.id}
          mode="create"
          onClose={() => setAdding(false)}
          rooms={rooms.data ?? []}
        />
      )}
      {editing && (
        <AssetForm
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
              ? "No assets match these filters."
              : (
                <>
                  No assets yet. Click <strong>Add asset</strong> to record the
                  first one — the appliance, fixture, or piece of equipment
                  going in.
                </>
              )}
          </p>
        ) : (
          <div className="grid gap-2">
            {list.data.map((a) => (
              <AssetRowItem
                key={a.id}
                asset={a}
                onEdit={() => setEditing(a)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────── row ──────────────────────

function AssetRowItem({
  asset,
  onEdit,
}: {
  asset: AssetRow;
  onEdit: () => void;
}) {
  const fmt = useFormatters();
  const utils = trpc.useUtils();
  const remove = trpc.assets.remove.useMutation({
    onSuccess: () =>
      utils.assets.list.invalidate({ projectId: asset.projectId }),
  });

  const sub: string[] = [];
  if (asset.manufacturer) sub.push(asset.manufacturer);
  if (asset.model) sub.push(asset.model);
  if (asset.serialNumber) sub.push(`SN ${asset.serialNumber}`);

  return (
    <div className="rounded-md border border-paper-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-blueprint-900">{asset.name}</span>
            <span className="rounded-full bg-paper-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              {ASSET_CATEGORY_LABELS[asset.category]}
            </span>
            {asset.room && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                · {asset.room.name}
              </span>
            )}
          </div>
          {sub.length > 0 && (
            <div className="mt-0.5 text-xs text-slate-600">
              {sub.join(" · ")}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
            {asset.installDate && (
              <span>installed {fmt.date(asset.installDate)}</span>
            )}
            {asset.warrantyExpiresAt && (
              <span>warranty thru {fmt.date(asset.warrantyExpiresAt)}</span>
            )}
            {asset.vendor && (
              <span>vendor · {asset.vendor.name}</span>
            )}
          </div>
          {asset.notes && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">
              {asset.notes}
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
              if (confirm(`Remove ${asset.name}?`)) remove.mutate({ id: asset.id });
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

function AssetForm({
  projectId,
  mode,
  existing,
  rooms,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: AssetRow;
  rooms: RoomLite[];
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState<AssetCategory>(
    existing?.category ?? "appliance",
  );
  const [roomId, setRoomId] = useState(existing?.roomId ?? "");
  const [manufacturer, setManufacturer] = useState(
    existing?.manufacturer ?? "",
  );
  const [model, setModel] = useState(existing?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(
    existing?.serialNumber ?? "",
  );
  const [installDate, setInstallDate] = useState(existing?.installDate ?? "");
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState(
    existing?.warrantyExpiresAt ?? "",
  );
  const [purchasePriceAmount, setPurchasePriceAmount] = useState(
    existing?.purchasePriceAmount ?? "",
  );
  const [purchasePriceCurrency, setPurchasePriceCurrency] = useState(
    existing?.purchasePriceCurrency ?? "USD",
  );
  const [photoUrl, setPhotoUrl] = useState(existing?.photoUrl ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.assets.create.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.assets.update.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = purchasePriceAmount.trim();
    const cur = purchasePriceCurrency.trim();
    if ((amt && !cur) || (!amt && cur)) {
      setError("Purchase price and currency must be set together.");
      return;
    }
    const base = {
      category,
      name: name.trim(),
      roomId: roomId || undefined,
      manufacturer: manufacturer.trim() || undefined,
      model: model.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      installDate: installDate || undefined,
      warrantyExpiresAt: warrantyExpiresAt || undefined,
      purchasePriceAmount: amt || undefined,
      purchasePriceCurrency: amt ? cur : undefined,
      photoUrl: photoUrl.trim() || undefined,
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
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {mode === "edit" ? "Edit · asset" : "New · asset"}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Name *" wide>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="e.g. Sub-Zero PRO 48 Fridge"
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as AssetCategory)}
            className={selectCls}
          >
            {(Object.keys(ASSET_CATEGORY_LABELS) as AssetCategory[]).map(
              (c) => (
                <option key={c} value={c}>
                  {ASSET_CATEGORY_LABELS[c]}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Room">
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
                  ? ` (${ROOM_TYPE_LABELS[r.roomType as keyof typeof ROOM_TYPE_LABELS] ?? r.roomType})`
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
            placeholder="Sub-Zero"
          />
        </Field>
        <Field label="Model">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputCls}
            placeholder="BI-48S/O"
          />
        </Field>
        <Field label="Serial number">
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            className={inputCls}
            placeholder="SN-1234567"
          />
        </Field>
        <Field label="Install date">
          <input
            type="date"
            value={installDate}
            onChange={(e) => setInstallDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Warranty expires">
          <input
            type="date"
            value={warrantyExpiresAt}
            onChange={(e) => setWarrantyExpiresAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Purchase price">
          <div className="flex gap-2">
            <input
              value={purchasePriceAmount}
              onChange={(e) => setPurchasePriceAmount(e.target.value)}
              className={`${inputCls} flex-1`}
              placeholder="12500.00"
              inputMode="decimal"
            />
            <input
              value={purchasePriceCurrency}
              onChange={(e) =>
                setPurchasePriceCurrency(e.target.value.toUpperCase())
              }
              className={`${inputCls} w-16 uppercase`}
              maxLength={3}
            />
          </div>
        </Field>
        <Field label="Photo URL" wide>
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            className={inputCls}
            placeholder="https://… (full Storage backend lands in M8)"
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

// ────────────────────── styles + Field ──────────────────────

const inputCls =
  "block w-full rounded-md border border-paper-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

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
