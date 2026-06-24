import { useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  FURNITURE_CATEGORIES_BY_VERTICAL,
  FURNITURE_STATUS_LABELS,
  type FurnitureCategory,
  type FurnitureStatus,
  type RoomType,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT } from "../../lib/i18n";
import { useVertical } from "../../lib/vertical";
import { EmptyState } from "../../components/vertical-mark";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
  MoneyInput,
  PageHeader,
  Pill,
  Select,
  Textarea,
} from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type FurnitureRow = inferRouterOutputs<AppRouter>["furniture"]["list"][number];

const STATUS_TONE: Record<
  FurnitureStatus,
  "neutral" | "info" | "warn" | "success" | "muted"
> = {
  planned: "neutral",
  selected: "info",
  ordered: "warn",
  delivered: "info",
  placed: "success",
  returned: "neutral",
  retired: "muted",
};

export default function ProjectFurniture() {
  const vertical = useVertical();
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [modal, setModal] = useState<
    | { mode: "closed" }
    | { mode: "create" }
    | { mode: "edit"; piece: FurnitureRow }
  >({ mode: "closed" });
  const [statusFilter, setStatusFilter] = useState<FurnitureStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<FurnitureCategory | "">(
    "",
  );
  const [roomFilter, setRoomFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const list = trpc.furniture.list.useQuery({
    projectId: project.id,
    roomId: roomFilter || undefined,
    category: categoryFilter || undefined,
    status: statusFilter || undefined,
    search: search.trim() || undefined,
  });
  const rooms = trpc.projects.listRooms.useQuery({ projectId: project.id });
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="animate-fade">
      <PageHeader
        title={t("furniture.title")}
        lede={t("furniture.lede")}
        action={
          <Button
            variant="primary"
            onClick={() => setModal({ mode: "create" })}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("furniture.add")}
          </Button>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as FurnitureStatus | "")
            }
          >
            <option value="">{t("filter.all_statuses")}</option>
            {(Object.keys(FURNITURE_STATUS_LABELS) as FurnitureStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {L.furnitureStatus(s)}
                </option>
              ),
            )}
          </Select>
        </div>
        <div className="w-48">
          <Select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as FurnitureCategory | "")
            }
          >
            <option value="">{t("filter.all_categories")}</option>
            {FURNITURE_CATEGORIES_BY_VERTICAL[vertical].map((c) => (
              <option key={c} value={c}>
                {L.furnitureCategory(c)}
              </option>
            ))}
          </Select>
        </div>
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
        <div className="relative min-w-[240px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("furniture.search")}
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
      ) : !list.data || list.data.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={
              search.trim() || roomFilter || categoryFilter || statusFilter
                ? t("furniture.empty_filtered")
                : t("furniture.empty")
            }
            action={
              !search.trim() &&
              !roomFilter &&
              !categoryFilter &&
              !statusFilter ? (
                <Button
                  variant="primary"
                  onClick={() => setModal({ mode: "create" })}
                >
                  <Icon name="plus" className="h-4 w-4" />
                  {t("furniture.add_first")}
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
                <th>{t("col.piece")}</th>
                <th>{t("col.category")}</th>
                <th>{t("col.room")}</th>
                <th className="r">{t("col.qty")}</th>
                <th>{t("col.status")}</th>
                <th className="r">{t("col.delivery")}</th>
                <th className="r">{t("col.price")}</th>
                <th aria-hidden className="r w-8" />
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <tr
                  key={p.id}
                  className="clickable group"
                  onClick={() =>
                    navigate(`/projects/${project.id}/furniture/${p.id}`)
                  }
                >
                  <td>
                    <Link
                      to={`/projects/${project.id}/furniture/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block"
                    >
                      <span className="font-medium text-text group-hover:text-accent">{p.name}</span>
                      {(p.manufacturer || p.designer) && (
                        <span className="block text-text-muted">
                          {[p.designer, p.manufacturer]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="text-text-muted">
                    {L.furnitureCategory(p.category)}
                  </td>
                  <td className="text-text-muted">{p.room?.name ?? "—"}</td>
                  <td className="r text-text">{p.quantity}</td>
                  <td>
                    <Pill tone={STATUS_TONE[p.status]} dot>
                      {L.furnitureStatus(p.status)}
                    </Pill>
                  </td>
                  <td className="r whitespace-nowrap text-text-muted">
                    {p.deliveryDate ? fmt.date(p.deliveryDate) : "—"}
                  </td>
                  <td className="r text-text">
                    {p.purchasePriceAmount && p.purchasePriceCurrency
                      ? fmt.currency(
                          p.purchasePriceAmount,
                          p.purchasePriceCurrency,
                        )
                      : "—"}
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

      {modal.mode !== "closed" && (
        <FurnitureFormModal
          projectId={project.id}
          mode={modal.mode}
          existing={modal.mode === "edit" ? modal.piece : undefined}
          rooms={rooms.data ?? []}
          onClose={() => setModal({ mode: "closed" })}
        />
      )}
    </div>
  );
}

// ────────────────────── form modal ──────────────────────

type RoomLite = { id: string; name: string; roomType: string | null };

function FurnitureFormModal({
  projectId,
  mode,
  existing,
  rooms,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: FurnitureRow;
  rooms: RoomLite[];
  onClose: () => void;
}) {
  const isEdit = mode === "edit";
  const vertical = useVertical();
  const L = useLabels();
  const t = useT();

  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState<FurnitureCategory>(
    existing?.category ?? "seating",
  );
  const [status, setStatus] = useState<FurnitureStatus>(
    existing?.status ?? "planned",
  );
  const [roomId, setRoomId] = useState(existing?.roomId ?? "");
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 1));
  const [manufacturer, setManufacturer] = useState(existing?.manufacturer ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [designer, setDesigner] = useState(existing?.designer ?? "");
  const [dimensions, setDimensions] = useState(existing?.dimensions ?? "");
  const [material, setMaterial] = useState(existing?.material ?? "");
  const [finish, setFinish] = useState(existing?.finish ?? "");
  const [deliveryDate, setDeliveryDate] = useState(existing?.deliveryDate ?? "");
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState(
    existing?.warrantyExpiresAt ?? "",
  );
  const [purchasePriceAmount, setPurchasePriceAmount] = useState(
    existing?.purchasePriceAmount ?? "",
  );
  const [purchasePriceCurrency, setPurchasePriceCurrency] = useState(
    existing?.purchasePriceCurrency ?? "USD",
  );
  const [productUrl, setProductUrl] = useState(existing?.productUrl ?? "");
  const [photoUrl, setPhotoUrl] = useState(existing?.photoUrl ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.furniture.create.useMutation({
    onSuccess: () => {
      utils.furniture.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.furniture.update.useMutation({
    onSuccess: () => {
      utils.furniture.list.invalidate({ projectId });
      if (existing) utils.furniture.get.invalidate({ id: existing.id });
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
      setError(t("furniture.err_price_currency"));
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      setError(t("furniture.err_quantity_min"));
      return;
    }
    const base = {
      category,
      status,
      name: name.trim(),
      quantity: qty,
      roomId: roomId || undefined,
      manufacturer: manufacturer.trim() || undefined,
      model: model.trim() || undefined,
      designer: designer.trim() || undefined,
      dimensions: dimensions.trim() || undefined,
      material: material.trim() || undefined,
      finish: finish.trim() || undefined,
      deliveryDate: deliveryDate || undefined,
      warrantyExpiresAt: warrantyExpiresAt || undefined,
      purchasePriceAmount: amt || undefined,
      purchasePriceCurrency: amt ? cur : undefined,
      productUrl: productUrl.trim() || undefined,
      photoUrl: photoUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    if (isEdit && existing) {
      update.mutate({ id: existing.id, patch: base });
    } else {
      create.mutate({ projectId, ...base });
    }
  }

  return (
    <Modal
      title={
        isEdit && existing
          ? t("furniture.edit_title", { name: existing.name })
          : t("furniture.new_title")
      }
      subtitle={isEdit ? undefined : t("furniture.new_subtitle")}
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
              form="furniture-form"
              variant="primary"
              disabled={submitting}
            >
              {submitting
                ? t("common.saving")
                : isEdit
                  ? t("common.save_changes")
                  : t("furniture.add")}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="furniture-form"
        onSubmit={onSubmit}
        className="grid gap-5 sm:grid-cols-2"
      >
        <Field label={t("col.name")} required wide>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder={t("furniture.ph.name")}
          />
        </Field>
        <Field label={t("col.category")}>
          <Select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as FurnitureCategory)
            }
          >
            {FURNITURE_CATEGORIES_BY_VERTICAL[vertical].map((c) => (
              <option key={c} value={c}>
                {L.furnitureCategory(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("col.status")}>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as FurnitureStatus)}
          >
            {(Object.keys(FURNITURE_STATUS_LABELS) as FurnitureStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {L.furnitureStatus(s)}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label={t("col.room")} hint={t("common.optional")}>
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">{t("furniture.room_none")}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.roomType
                  ? ` (${L.roomType(r.roomType as RoomType)})`
                  : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("furniture.field.quantity")}>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label={t("furniture.field.designer")}>
          <Input
            value={designer}
            onChange={(e) => setDesigner(e.target.value)}
            placeholder="Mario Bellini"
          />
        </Field>
        <Field label={t("furniture.field.manufacturer")}>
          <Input
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder="B&B Italia"
          />
        </Field>
        <Field label={t("furniture.field.model_sku")}>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="CAM01"
          />
        </Field>
        <Field
          label={t("furniture.field.dimensions")}
          hint={t("furniture.hint.dimensions")}
          wide
        >
          <Input
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder='84"W × 36"D × 28"H'
          />
        </Field>
        <Field label={t("furniture.field.material")}>
          <Input
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder={t("furniture.ph.material")}
          />
        </Field>
        <Field label={t("furniture.field.finish_color")}>
          <Input
            value={finish}
            onChange={(e) => setFinish(e.target.value)}
            placeholder={t("furniture.ph.finish")}
          />
        </Field>
        <Field label={t("furniture.field.delivery_date")}>
          <Input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </Field>
        <Field label={t("furniture.field.warranty_expires")}>
          <Input
            type="date"
            value={warrantyExpiresAt}
            onChange={(e) => setWarrantyExpiresAt(e.target.value)}
          />
        </Field>
        <Field
          label={t("furniture.field.purchase_price")}
          hint={t("common.optional")}
          wide
        >
          <MoneyInput
            amount={purchasePriceAmount}
            currency={purchasePriceCurrency}
            onAmountChange={setPurchasePriceAmount}
            onCurrencyChange={setPurchasePriceCurrency}
            placeholder="8,500.00"
          />
        </Field>
        <Field
          label={t("furniture.field.product_link")}
          hint={t("furniture.hint.product_link")}
          wide
        >
          <Input
            type="url"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://bebitalia.com/…"
          />
        </Field>
        <Field label={t("furniture.field.photo_url")} wide>
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
            rows={3}
            placeholder={t("furniture.ph.notes")}
          />
        </Field>
      </form>
    </Modal>
  );
}
