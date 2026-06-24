import { useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  ASSET_CATEGORIES_BY_VERTICAL,
  ASSET_STATUS_LABELS,
  ROOM_TYPE_LABELS,
  type AssetCategory,
  type AssetStatus,
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
type AssetRow = inferRouterOutputs<AppRouter>["assets"]["list"][number];

const STATUS_TONE: Record<
  AssetStatus,
  "info" | "success" | "warn" | "neutral" | "muted"
> = {
  planned: "info",
  installed: "success",
  under_repair: "warn",
  removed: "neutral",
  retired: "muted",
};

export default function ProjectAssets() {
  const vertical = useVertical();
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [modal, setModal] = useState<
    | { mode: "closed" }
    | { mode: "create" }
    | { mode: "edit"; asset: AssetRow }
  >({ mode: "closed" });
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "">("");
  const [roomFilter, setRoomFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const list = trpc.assets.list.useQuery({
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="animate-fade">
      <PageHeader
        title={t("assets.title")}
        lede={t("assets.lede")}
        action={
          <Button
            variant="primary"
            onClick={() => setModal({ mode: "create" })}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t("assets.add")}
          </Button>
        }
      />

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AssetStatus | "")}
          >
            <option value="">{t("filter.all_statuses")}</option>
            {(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map((s) => (
              <option key={s} value={s}>
                {L.assetStatus(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as AssetCategory | "")
            }
          >
            <option value="">{t("filter.all_categories")}</option>
            {ASSET_CATEGORIES_BY_VERTICAL[vertical].map((c) => (
              <option key={c} value={c}>
                {L.assetCategory(c)}
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
            placeholder={t("assets.search")}
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
                ? t("assets.empty_filtered")
                : t("assets.empty")
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
                  {t("assets.add_first")}
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
                <th>{t("col.category")}</th>
                <th>{t("col.room")}</th>
                <th>{t("col.status")}</th>
                <th className="r">{t("col.installed")}</th>
                <th className="r">{t("col.warranty")}</th>
                <th className="r">{t("col.price")}</th>
                <th aria-hidden className="r w-8" />
              </tr>
            </thead>
            <tbody>
              {list.data.map((a) => {
                const warrantyExpired =
                  a.warrantyExpiresAt && a.warrantyExpiresAt < today;
                return (
                  <tr
                    key={a.id}
                    className="clickable group"
                    onClick={() =>
                      navigate(`/projects/${project.id}/assets/${a.id}`)
                    }
                  >
                    <td>
                      <Link
                        to={`/projects/${project.id}/assets/${a.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block"
                      >
                        <span className="font-medium text-text group-hover:text-accent">
                          {a.name}
                        </span>
                        {(a.manufacturer || a.model) && (
                          <span className="block text-text-muted">
                            {[a.manufacturer, a.model]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="text-text-muted">
                      {L.assetCategory(a.category)}
                    </td>
                    <td className="text-text-muted">{a.room?.name ?? "—"}</td>
                    <td>
                      <Pill tone={STATUS_TONE[a.status]} dot>
                        {L.assetStatus(a.status)}
                      </Pill>
                    </td>
                    <td className="r whitespace-nowrap text-text-muted">
                      {a.installDate ? fmt.date(a.installDate) : "—"}
                    </td>
                    <td className="r whitespace-nowrap">
                      {a.warrantyExpiresAt ? (
                        <span
                          className={
                            warrantyExpired
                              ? "text-danger"
                              : "text-text-muted"
                          }
                        >
                          {fmt.date(a.warrantyExpiresAt)}
                          {warrantyExpired && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide">
                              {t("assets.warranty_expired")}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="r text-text">
                      {a.purchasePriceAmount && a.purchasePriceCurrency
                        ? fmt.currency(
                            a.purchasePriceAmount,
                            a.purchasePriceCurrency,
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal.mode !== "closed" && (
        <AssetFormModal
          projectId={project.id}
          mode={modal.mode}
          existing={modal.mode === "edit" ? modal.asset : undefined}
          rooms={rooms.data ?? []}
          onClose={() => setModal({ mode: "closed" })}
        />
      )}
    </div>
  );
}

// ────────────────────── form modal ──────────────────────

type RoomLite = { id: string; name: string; roomType: string | null };

function AssetFormModal({
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
  const isEdit = mode === "edit";
  const vertical = useVertical();
  const L = useLabels();
  const t = useT();

  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState<AssetCategory>(
    existing?.category ?? "appliance",
  );
  const [status, setStatus] = useState<AssetStatus>(
    existing?.status ?? "installed",
  );
  const [roomId, setRoomId] = useState(existing?.roomId ?? "");
  const [manufacturer, setManufacturer] = useState(existing?.manufacturer ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(existing?.serialNumber ?? "");
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
  const [productUrl, setProductUrl] = useState(existing?.productUrl ?? "");
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
      if (existing) utils.assets.get.invalidate({ id: existing.id });
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
      setError(t("asset.price_currency_together"));
      return;
    }
    const base = {
      category,
      status,
      name: name.trim(),
      roomId: roomId || undefined,
      manufacturer: manufacturer.trim() || undefined,
      model: model.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      installDate: installDate || undefined,
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
          ? t("asset.edit_title", { name: existing.name })
          : t("asset.new_title")
      }
      subtitle={isEdit ? undefined : t("asset.new_subtitle")}
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
              form="asset-form"
              variant="primary"
              disabled={submitting}
            >
              {submitting
                ? t("common.saving")
                : isEdit
                  ? t("common.save_changes")
                  : t("assets.add")}
            </Button>
          </div>
        </div>
      }
    >
      <form id="asset-form" onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
        <Field label={t("col.name")} required wide>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Sub-Zero PRO 48 Fridge"
          />
        </Field>
        <Field label={t("col.category")}>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as AssetCategory)}
          >
            {ASSET_CATEGORIES_BY_VERTICAL[vertical].map((c) => (
              <option key={c} value={c}>
                {L.assetCategory(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("col.status")}>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as AssetStatus)}
          >
            {(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map((s) => (
              <option key={s} value={s}>
                {L.assetStatus(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("col.room")} hint={t("common.optional")} wide>
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">{t("asset.room_none")}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.roomType
                  ? ` (${L.roomType(r.roomType as keyof typeof ROOM_TYPE_LABELS)})`
                  : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("asset.field.manufacturer")}>
          <Input
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder="Sub-Zero"
          />
        </Field>
        <Field label={t("asset.field.model")}>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="BI-48S/O"
          />
        </Field>
        <Field label={t("asset.field.serial_number")} wide>
          <Input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="SN-1234567"
          />
        </Field>
        <Field label={t("asset.field.install_date")}>
          <Input
            type="date"
            value={installDate}
            onChange={(e) => setInstallDate(e.target.value)}
          />
        </Field>
        <Field label={t("asset.field.warranty_expires")}>
          <Input
            type="date"
            value={warrantyExpiresAt}
            onChange={(e) => setWarrantyExpiresAt(e.target.value)}
          />
        </Field>
        <Field label={t("asset.field.purchase_price")} hint={t("common.optional")} wide>
          <MoneyInput
            amount={purchasePriceAmount}
            currency={purchasePriceCurrency}
            onAmountChange={setPurchasePriceAmount}
            onCurrencyChange={setPurchasePriceCurrency}
            placeholder="12,500.00"
          />
        </Field>
        <Field label={t("asset.field.product_link")} hint={t("asset.field.product_link_hint")} wide>
          <Input
            type="url"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://subzero-wolf.com/…"
          />
        </Field>
        <Field label={t("asset.field.photo_url")} wide>
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
            placeholder={t("asset.field.notes_ph")}
          />
        </Field>
      </form>
    </Modal>
  );
}
