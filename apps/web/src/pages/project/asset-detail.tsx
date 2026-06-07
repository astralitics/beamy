import { useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  ASSET_EVENT_TYPE_LABELS,
  type AssetEventType,
  type AssetStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT } from "../../lib/i18n";
import {
  Button,
  Field,
  Icon,
  Input,
  Modal,
  MoneyInput,
  Pill,
  Select,
  Textarea,
} from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type AssetDetail = inferRouterOutputs<AppRouter>["assets"]["get"];
type AssetEventRow =
  inferRouterOutputs<AppRouter>["assets"]["events"]["list"][number];

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

const EVENT_ACCENT: Record<AssetEventType, string> = {
  installed: "bg-emerald-500",
  serviced: "bg-sky-500",
  repaired: "bg-amber-500",
  inspected: "bg-violet-500",
  warranty_claimed: "bg-rose-500",
  removed: "bg-ink-500",
  reinstalled: "bg-emerald-500",
  retired: "bg-ink-400",
  note: "bg-ink-300",
};

export default function ProjectAssetDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
  const [addingEvent, setAddingEvent] = useState(false);

  const asset = trpc.assets.get.useQuery(
    { id: assetId ?? "" },
    { enabled: !!assetId },
  );
  const events = trpc.assets.events.list.useQuery(
    { assetId: assetId ?? "" },
    { enabled: !!assetId },
  );

  const utils = trpc.useUtils();
  const remove = trpc.assets.remove.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/assets`);
    },
  });

  if (!assetId) return null;
  if (asset.isLoading) {
    return <p className="text-sm text-ink-500">{t("common.loading")}</p>;
  }
  if (asset.error) {
    return <p className="text-sm text-rose-700">{asset.error.message}</p>;
  }
  if (!asset.data) return null;
  const a = asset.data;
  const today = new Date().toISOString().slice(0, 10);
  const warrantyExpired = a.warrantyExpiresAt && a.warrantyExpiresAt < today;
  const warrantyDaysLeft = a.warrantyExpiresAt
    ? Math.ceil(
        (new Date(a.warrantyExpiresAt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div className="animate-fade space-y-12">
      <header>
        <Link
          to={`/projects/${project.id}/assets`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          {t("assets.title")}
        </Link>

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Pill tone={STATUS_TONE[a.status]} dot>
                {L.assetStatus(a.status)}
              </Pill>
              <span className="text-[13px] text-ink-500">
                {L.assetCategory(a.category)}
                {a.room ? ` · ${a.room.name}` : ""}
              </span>
            </div>
            <h1 className="mt-3 font-display text-4xl font-normal leading-[1.1] tracking-tightest text-ink-900">
              {a.name}
            </h1>
            {(a.manufacturer || a.model) && (
              <p className="mt-2 text-[15px] text-ink-600">
                {[a.manufacturer, a.model].filter(Boolean).join(" · ")}
                {a.serialNumber && (
                  <span className="ml-2 font-mono text-[13px] text-ink-500">
                    SN {a.serialNumber}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {a.productUrl && (
              <a
                href={a.productUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 transition-colors hover:bg-paper-50 hover:border-ink-300"
              >
                {t("detail.product_page")}
                <ExternalIcon className="h-3.5 w-3.5" />
              </a>
            )}
            <Button
              variant="primary"
              onClick={() => setAddingEvent(true)}
            >
              <Icon name="plus" className="h-4 w-4" />
              {t("detail.log_event")}
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("col.installed")}>
          {a.installDate ? fmt.date(a.installDate) : "—"}
        </Fact>
        <Fact
          label={t("col.warranty")}
          tone={warrantyExpired ? "alert" : undefined}
        >
          {a.warrantyExpiresAt ? (
            <span className="flex flex-col">
              <span>{fmt.date(a.warrantyExpiresAt)}</span>
              {warrantyDaysLeft !== null && (
                <span
                  className={`text-xs ${
                    warrantyExpired
                      ? "text-rose-600"
                      : warrantyDaysLeft <= 60
                        ? "text-amber-600"
                        : "text-ink-500"
                  }`}
                >
                  {warrantyExpired
                    ? t("asset.warranty_days_expired", {
                        days: Math.abs(warrantyDaysLeft),
                      })
                    : t("asset.warranty_days_left", {
                        days: warrantyDaysLeft,
                      })}
                </span>
              )}
            </span>
          ) : (
            "—"
          )}
        </Fact>
        <Fact label={t("asset.fact.purchase")}>
          {a.purchasePriceAmount && a.purchasePriceCurrency
            ? fmt.currency(a.purchasePriceAmount, a.purchasePriceCurrency)
            : "—"}
        </Fact>
        <Fact label={t("col.vendor")}>{a.vendor?.name ?? "—"}</Fact>
      </section>

      {(a.photoUrl || a.notes) && (
        <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          {a.photoUrl && (
            <div className="overflow-hidden rounded-xl border border-ink-200/70 bg-white">
              <img
                src={a.photoUrl}
                alt={a.name}
                className="aspect-[4/3] w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
          {a.notes && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                {t("detail.notes")}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
                {a.notes}
              </p>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="font-display text-xl font-normal tracking-tight text-ink-900">
          {t("detail.timeline")}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {t("detail.timeline_lede.asset")}
        </p>
        <div className="mt-6">
          {events.isLoading ? (
            <p className="text-sm text-ink-500">{t("common.loading")}</p>
          ) : events.error ? (
            <p className="text-sm text-rose-700">{events.error.message}</p>
          ) : !events.data || events.data.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-200 bg-white px-6 py-10 text-center">
              <p className="text-[15px] text-ink-700">
                {t("detail.nothing_logged")}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {t("asset.timeline_empty_hint")}
              </p>
              <Button
                variant="secondary"
                onClick={() => setAddingEvent(true)}
                className="mt-4"
              >
                <Icon name="plus" className="h-4 w-4" />
                {t("detail.log_first_event")}
              </Button>
            </div>
          ) : (
            <ol className="relative ml-3 space-y-6 border-l border-ink-200/80 pl-6">
              {events.data.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  projectId={project.id}
                  onDeleted={() =>
                    utils.assets.events.list.invalidate({ assetId: a.id })
                  }
                />
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="border-t border-ink-100 pt-8">
        <button
          type="button"
          onClick={() => {
            if (confirm(t("asset.delete_confirm", { name: a.name }))) {
              remove.mutate({ id: a.id });
            }
          }}
          className="text-[13px] text-rose-600 hover:text-rose-800"
        >
          {t("detail.delete_asset")}
        </button>
      </section>

      {addingEvent && (
        <EventFormModal
          assetId={a.id}
          onClose={() => setAddingEvent(false)}
        />
      )}
    </div>
  );
}

// ────────────────────── Fact tile ──────────────────────

function Fact({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "alert";
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {label}
      </p>
      <div
        className={`mt-1 text-[16px] font-medium ${tone === "alert" ? "text-rose-700" : "text-ink-900"}`}
      >
        {children}
      </div>
    </div>
  );
}

// ────────────────────── Timeline row ──────────────────────

function EventRow({
  event,
  projectId,
  onDeleted,
}: {
  event: AssetEventRow;
  projectId: string;
  onDeleted: () => void;
}) {
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
  const remove = trpc.assets.events.remove.useMutation({
    onSuccess: onDeleted,
  });
  const accent = EVENT_ACCENT[event.eventType];
  const trackedBill = event.bill;

  return (
    <li className="relative">
      <span
        aria-hidden
        className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ${accent} ring-4 ring-paper-50`}
      />
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-medium text-ink-900">
            {L.assetEvent(event.eventType)}
          </span>
          <span className="text-[12px] text-ink-400">
            · {fmt.date(event.occurredAt)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                trackedBill
                  ? t("asset.event_delete_confirm_billed")
                  : t("asset.event_delete_confirm"),
              )
            ) {
              remove.mutate({ id: event.id });
            }
          }}
          className="text-[12px] text-ink-400 hover:text-rose-600"
        >
          {t("common.remove")}
        </button>
      </div>
      <p className="mt-1 text-[15px] text-ink-700">{event.summary}</p>
      {(event.vendor ||
        (event.costAmount && event.costCurrency)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
          {event.vendor && <span>{event.vendor.name}</span>}
          {event.costAmount && event.costCurrency && (
            <span className="tnum">
              {fmt.currency(event.costAmount, event.costCurrency)}
            </span>
          )}
          {trackedBill && (
            <Link
              to={`/projects/${projectId}/money`}
              title={t("asset.open_in_finance")}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-100"
            >
              <FinanceIcon className="h-3 w-3" />
              {t("detail.tracked_in_finance")}
            </Link>
          )}
        </div>
      )}
      {event.notes && (
        <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-600">
          {event.notes}
        </p>
      )}
    </li>
  );
}

// ────────────────────── Add Event modal ──────────────────────

function EventFormModal({
  assetId,
  onClose,
}: {
  assetId: string;
  onClose: () => void;
}) {
  const L = useLabels();
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  const [eventType, setEventType] = useState<AssetEventType>("serviced");
  const [occurredAt, setOccurredAt] = useState(today);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costCurrency, setCostCurrency] = useState("USD");
  const [trackInFinance, setTrackInFinance] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasCost = costAmount.trim().length > 0;

  const utils = trpc.useUtils();
  const create = trpc.assets.events.create.useMutation({
    onSuccess: () => {
      utils.assets.events.list.invalidate({ assetId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = costAmount.trim();
    const cur = costCurrency.trim();
    if ((amt && !cur) || (!amt && cur)) {
      setError(t("asset.cost_currency_together"));
      return;
    }
    create.mutate({
      assetId,
      eventType,
      occurredAt,
      summary: summary.trim(),
      notes: notes.trim() || undefined,
      costAmount: amt || undefined,
      costCurrency: amt ? cur : undefined,
      trackInFinance: amt ? trackInFinance : false,
    });
  }

  return (
    <Modal
      title={t("detail.log_event")}
      subtitle={t("asset.event_subtitle")}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-rose-600">{error}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="event-form"
              variant="primary"
              disabled={create.isPending}
            >
              {create.isPending ? t("common.saving") : t("detail.log_event")}
            </Button>
          </div>
        </div>
      }
    >
      <form id="event-form" onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
        <Field label={t("col.type")}>
          <Select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as AssetEventType)}
          >
            {(Object.keys(ASSET_EVENT_TYPE_LABELS) as AssetEventType[]).map(
              (t) => (
                <option key={t} value={t}>
                  {L.assetEvent(t)}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label={t("asset.field.date")} required>
          <Input
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </Field>
        <Field label={t("asset.field.summary")} required wide>
          <Input
            required
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={t("asset.field.summary_ph")}
            autoFocus
          />
        </Field>
        <Field label={t("asset.field.cost")} hint={t("common.optional")} wide>
          <MoneyInput
            amount={costAmount}
            currency={costCurrency}
            onAmountChange={setCostAmount}
            onCurrencyChange={setCostCurrency}
            placeholder="120.00"
          />
        </Field>
        {hasCost && (
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 bg-paper-50 px-4 py-3 transition-colors hover:bg-paper-100">
              <input
                type="checkbox"
                checked={trackInFinance}
                onChange={(e) => setTrackInFinance(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-ink-900 focus:ring-2 focus:ring-ink-900/15"
              />
              <span>
                <span className="block text-[14px] font-medium text-ink-900">
                  {t("detail.paid_from_company")}
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-500">
                  {t("detail.paid_from_company_hint")}
                </span>
              </span>
            </label>
          </div>
        )}
        <Field label={t("detail.notes")} wide>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t("asset.event_notes_ph")}
          />
        </Field>
      </form>
    </Modal>
  );
}

function FinanceIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
