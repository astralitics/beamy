import { useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  FURNITURE_EVENT_TYPE_LABELS,
  type FurnitureEventType,
  type FurnitureStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels } from "../../lib/i18n";
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
type FurnitureEventRow =
  inferRouterOutputs<AppRouter>["furniture"]["events"]["list"][number];

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

const EVENT_ACCENT: Record<FurnitureEventType, string> = {
  selected: "bg-sky-500",
  ordered: "bg-amber-500",
  delivered: "bg-violet-500",
  placed: "bg-emerald-500",
  moved: "bg-sky-500",
  cleaned: "bg-sky-400",
  reupholstered: "bg-amber-500",
  repaired: "bg-amber-500",
  returned: "bg-rose-500",
  retired: "bg-ink-400",
  note: "bg-ink-300",
};

export default function ProjectFurnitureDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { furnitureId } = useParams<{ furnitureId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const L = useLabels();
  const [addingEvent, setAddingEvent] = useState(false);

  const piece = trpc.furniture.get.useQuery(
    { id: furnitureId ?? "" },
    { enabled: !!furnitureId },
  );
  const events = trpc.furniture.events.list.useQuery(
    { furnitureId: furnitureId ?? "" },
    { enabled: !!furnitureId },
  );

  const utils = trpc.useUtils();
  const remove = trpc.furniture.remove.useMutation({
    onSuccess: () => {
      utils.furniture.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/furniture`);
    },
  });

  if (!furnitureId) return null;
  if (piece.isLoading) return <p className="text-sm text-ink-500">Loading…</p>;
  if (piece.error)
    return <p className="text-sm text-rose-700">{piece.error.message}</p>;
  if (!piece.data) return null;

  const p = piece.data;

  const subLine = [p.designer, p.manufacturer].filter(Boolean).join(" · ");
  const finishLine = [p.material, p.finish].filter(Boolean).join(" · ");

  return (
    <div className="animate-fade space-y-12">
      <header>
        <Link
          to={`/projects/${project.id}/furniture`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          Furniture
        </Link>

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Pill tone={STATUS_TONE[p.status]} dot>
                {L.furnitureStatus(p.status)}
              </Pill>
              <span className="text-[13px] text-ink-500">
                {L.furnitureCategory(p.category)}
                {p.room ? ` · ${p.room.name}` : ""}
                {p.quantity > 1 ? ` · qty ${p.quantity}` : ""}
              </span>
            </div>
            <h1 className="mt-3 font-display text-4xl font-normal leading-[1.1] tracking-tightest text-ink-900">
              {p.name}
            </h1>
            {subLine && (
              <p className="mt-2 text-[15px] text-ink-600">{subLine}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {p.productUrl && (
              <a
                href={p.productUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 transition-colors hover:bg-paper-50 hover:border-ink-300"
              >
                Product page
                <ExternalIcon className="h-3.5 w-3.5" />
              </a>
            )}
            <Button variant="primary" onClick={() => setAddingEvent(true)}>
              <Icon name="plus" className="h-4 w-4" />
              Log event
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-5">
        <Fact label="Delivery">
          {p.deliveryDate ? fmt.date(p.deliveryDate) : "—"}
        </Fact>
        <Fact label="Warranty">
          {p.warrantyExpiresAt ? fmt.date(p.warrantyExpiresAt) : "—"}
        </Fact>
        <Fact label="Price">
          {p.purchasePriceAmount && p.purchasePriceCurrency
            ? fmt.currency(p.purchasePriceAmount, p.purchasePriceCurrency)
            : "—"}
        </Fact>
        <Fact label="Dimensions">{p.dimensions ?? "—"}</Fact>
        <Fact label="Vendor">{p.vendor?.name ?? "—"}</Fact>
      </section>

      {(p.photoUrl || finishLine || p.notes) && (
        <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          {p.photoUrl ? (
            <div className="overflow-hidden rounded-xl border border-ink-200/70 bg-white">
              <img
                src={p.photoUrl}
                alt={p.name}
                className="aspect-[4/3] w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <div />
          )}
          <div>
            {finishLine && (
              <>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  Material · finish
                </h3>
                <p className="mt-2 text-[15px] text-ink-700">{finishLine}</p>
              </>
            )}
            {p.notes && (
              <>
                <h3
                  className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400 ${finishLine ? "mt-6" : ""}`}
                >
                  Notes
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
                  {p.notes}
                </p>
              </>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl font-normal tracking-tight text-ink-900">
          Timeline
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          What's happened to this piece, in chronological order.
        </p>
        <div className="mt-6">
          {events.isLoading ? (
            <p className="text-sm text-ink-500">Loading…</p>
          ) : events.error ? (
            <p className="text-sm text-rose-700">{events.error.message}</p>
          ) : !events.data || events.data.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-200 bg-white px-6 py-10 text-center">
              <p className="text-[15px] text-ink-700">Nothing logged yet.</p>
              <p className="mt-1 text-sm text-ink-500">
                Log selection, delivery, cleaning, or any note as you go.
              </p>
              <Button
                variant="secondary"
                onClick={() => setAddingEvent(true)}
                className="mt-4"
              >
                <Icon name="plus" className="h-4 w-4" />
                Log first event
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
                    utils.furniture.events.list.invalidate({
                      furnitureId: p.id,
                    })
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
            if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
              remove.mutate({ id: p.id });
            }
          }}
          className="text-[13px] text-rose-600 hover:text-rose-800"
        >
          Delete this piece
        </button>
      </section>

      {addingEvent && (
        <EventFormModal
          furnitureId={p.id}
          onClose={() => setAddingEvent(false)}
        />
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

function EventRow({
  event,
  projectId,
  onDeleted,
}: {
  event: FurnitureEventRow;
  projectId: string;
  onDeleted: () => void;
}) {
  const fmt = useFormatters();
  const L = useLabels();
  const remove = trpc.furniture.events.remove.useMutation({
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
            {L.furnitureEvent(event.eventType)}
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
                  ? "Delete this event? The linked bill in project finance will also be removed."
                  : "Delete this event?",
              )
            ) {
              remove.mutate({ id: event.id });
            }
          }}
          className="text-[12px] text-ink-400 hover:text-rose-600"
        >
          Remove
        </button>
      </div>
      <p className="mt-1 text-[15px] text-ink-700">{event.summary}</p>
      {(event.vendor || (event.costAmount && event.costCurrency)) && (
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
              title="Open in project finance"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-100"
            >
              <FinanceIcon className="h-3 w-3" />
              Tracked in finance
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

function EventFormModal({
  furnitureId,
  onClose,
}: {
  furnitureId: string;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const L = useLabels();
  const [eventType, setEventType] = useState<FurnitureEventType>("delivered");
  const [occurredAt, setOccurredAt] = useState(today);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costCurrency, setCostCurrency] = useState("USD");
  const [trackInFinance, setTrackInFinance] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasCost = costAmount.trim().length > 0;

  const utils = trpc.useUtils();
  const create = trpc.furniture.events.create.useMutation({
    onSuccess: () => {
      utils.furniture.events.list.invalidate({ furnitureId });
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
      setError("Cost and currency must be set together.");
      return;
    }
    create.mutate({
      furnitureId,
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
      title="Log event"
      subtitle="Record delivery, cleaning, repair, or a note."
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-rose-600">{error}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="furniture-event-form"
              variant="primary"
              disabled={create.isPending}
            >
              {create.isPending ? "Saving…" : "Log event"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="furniture-event-form"
        onSubmit={onSubmit}
        className="grid gap-5 sm:grid-cols-2"
      >
        <Field label="Type">
          <Select
            value={eventType}
            onChange={(e) =>
              setEventType(e.target.value as FurnitureEventType)
            }
          >
            {(
              Object.keys(
                FURNITURE_EVENT_TYPE_LABELS,
              ) as FurnitureEventType[]
            ).map((t) => (
              <option key={t} value={t}>
                {L.furnitureEvent(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" required>
          <Input
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </Field>
        <Field label="Summary" required wide>
          <Input
            required
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Steam-cleaned by Lily Clean; new dust cover installed"
            autoFocus
          />
        </Field>
        <Field label="Cost" hint="Optional" wide>
          <MoneyInput
            amount={costAmount}
            currency={costCurrency}
            onAmountChange={setCostAmount}
            onCurrencyChange={setCostCurrency}
            placeholder="220.00"
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
                  Paid from company account
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-500">
                  Logs a paid bill in the project ledger and links it here. Uncheck if this cost is informational only.
                </span>
              </span>
            </label>
          </div>
        )}
        <Field label="Notes" wide>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Care notes, swatch refs, what to watch for."
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
