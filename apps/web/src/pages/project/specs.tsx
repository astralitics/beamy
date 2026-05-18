import { useState, type FormEvent, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  ROOM_TYPE_LABELS,
  SPEC_STATE_FLOW,
  SPEC_STATE_LABELS,
  SPEC_TYPE_LABELS,
  type SpecState,
  type SpecType,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type SpecRow = inferRouterOutputs<AppRouter>["specs"]["list"][number];

/**
 * Specs & finishes — the planning + procurement layer. Each row is
 * something the client commits to buy and install: a fridge, a tile,
 * a paint color. Carries the pre-install lifecycle (specified →
 * approved → ordered → received → installed) and the price math.
 *
 * After install, the asset or material row is created (manual in v1;
 * workflow in M5). The spec stays as the procurement audit trail.
 */
export default function ProjectSpecs() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SpecRow | null>(null);
  const [stateFilter, setStateFilter] = useState<SpecState | "open" | "all">(
    "open",
  );
  const [typeFilter, setTypeFilter] = useState<SpecType | "">("");
  const [roomFilter, setRoomFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const stateInput =
    stateFilter === "all" || stateFilter === "open" ? undefined : stateFilter;
  const list = trpc.specs.list.useQuery({
    projectId: project.id,
    state: stateInput,
    specType: typeFilter || undefined,
    roomId: roomFilter || undefined,
    search: search.trim() || undefined,
  });
  const rooms = trpc.projects.listRooms.useQuery({ projectId: project.id });

  // "open" = everything that isn't installed or cancelled. Done client-side
  // since the API takes a single state filter.
  const filtered =
    stateFilter === "open"
      ? (list.data ?? []).filter(
          (s) => s.state !== "installed" && s.state !== "cancelled",
        )
      : list.data ?? [];

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            Specs &amp; finishes
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Specified → approved → ordered → received → installed.
          </p>
        </div>
        {!adding && !editing && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800"
          >
            Add spec
          </button>
        )}
      </div>

      {!adding && !editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={stateFilter}
            onChange={(e) =>
              setStateFilter(e.target.value as SpecState | "open" | "all")
            }
            className={selectCls}
          >
            <option value="open">Open (not installed)</option>
            <option value="all">All states</option>
            {SPEC_STATE_FLOW.map((s) => (
              <option key={s} value={s}>
                {SPEC_STATE_LABELS[s]}
              </option>
            ))}
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as SpecType | "")}
            className={selectCls}
          >
            <option value="">All types</option>
            {(Object.keys(SPEC_TYPE_LABELS) as SpecType[]).map((t) => (
              <option key={t} value={t}>
                {SPEC_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, description, category…"
            className="flex-1 rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
          />
        </div>
      )}

      {adding && (
        <SpecForm
          projectId={project.id}
          mode="create"
          onClose={() => setAdding(false)}
          rooms={rooms.data ?? []}
        />
      )}
      {editing && (
        <SpecForm
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
        ) : filtered.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            {search.trim() || typeFilter || roomFilter || stateFilter !== "open"
              ? "No specs match these filters."
              : (
                <>
                  No open specs. Click <strong>Add spec</strong> to start the
                  procurement trail — finish, fixture, or appliance.
                </>
              )}
          </p>
        ) : (
          <div className="grid gap-2">
            {filtered.map((s) => (
              <SpecRowItem
                key={s.id}
                spec={s}
                onEdit={() => setEditing(s)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────── row ──────────────────────

const STATE_PILL_CLS: Record<SpecState, string> = {
  specified: "bg-slate-50 text-slate-700 ring-slate-200",
  client_approved: "bg-sky-50 text-sky-800 ring-sky-200",
  ordered: "bg-amber-50 text-amber-800 ring-amber-200",
  received: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  installed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
};

function nextState(state: SpecState): SpecState | null {
  const idx = SPEC_STATE_FLOW.indexOf(state);
  if (idx < 0 || idx === SPEC_STATE_FLOW.length - 1) return null;
  return SPEC_STATE_FLOW[idx + 1] ?? null;
}

function SpecRowItem({
  spec,
  onEdit,
}: {
  spec: SpecRow;
  onEdit: () => void;
}) {
  const fmt = useFormatters();
  const utils = trpc.useUtils();
  const remove = trpc.specs.remove.useMutation({
    onSuccess: () =>
      utils.specs.list.invalidate({ projectId: spec.projectId }),
  });
  const transition = trpc.specs.transition.useMutation({
    onSuccess: () =>
      utils.specs.list.invalidate({ projectId: spec.projectId }),
  });

  const advanceTo = nextState(spec.state);
  const canCancel = spec.state !== "cancelled" && spec.state !== "installed";

  const markup =
    spec.catalogPriceAmount && spec.clientPriceAmount
      ? markupPct(spec.catalogPriceAmount, spec.clientPriceAmount)
      : null;

  return (
    <div className="rounded-md border border-paper-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-blueprint-900">{spec.name}</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATE_PILL_CLS[spec.state]}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
              {SPEC_STATE_LABELS[spec.state]}
            </span>
            <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              → {SPEC_TYPE_LABELS[spec.specType]}
            </span>
            {spec.room && (
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                · {spec.room.name}
              </span>
            )}
            {spec.category && (
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                · {spec.category}
              </span>
            )}
          </div>
          {spec.description && (
            <div className="mt-0.5 text-xs text-slate-600">
              {spec.description}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] uppercase tracking-wider text-slate-400">
            {spec.catalogPriceAmount && spec.catalogPriceCurrency && (
              <span>
                catalog{" "}
                {fmt.currency(spec.catalogPriceAmount, spec.catalogPriceCurrency)}
              </span>
            )}
            {spec.clientPriceAmount && spec.clientPriceCurrency && (
              <span>
                client{" "}
                {fmt.currency(spec.clientPriceAmount, spec.clientPriceCurrency)}
                {markup !== null && (
                  <span className="ml-1 text-safety-700"> · +{markup}%</span>
                )}
              </span>
            )}
            {spec.vendor && <span>vendor · {spec.vendor.name}</span>}
          </div>
          <LifecycleTimeline spec={spec} />
          {spec.notes && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">
              {spec.notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {advanceTo && (
            <button
              type="button"
              onClick={() =>
                transition.mutate({ id: spec.id, to: advanceTo })
              }
              disabled={transition.isPending}
              className="rounded-md border border-paper-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-paper-50 disabled:opacity-50"
              title={`Mark as ${SPEC_STATE_LABELS[advanceTo]}`}
            >
              → {SPEC_STATE_LABELS[advanceTo]}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            Edit
          </button>
          {canCancel && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Cancel ${spec.name}?`)) {
                  transition.mutate({ id: spec.id, to: "cancelled" });
                }
              }}
              disabled={transition.isPending}
              className="text-xs text-amber-700 hover:text-amber-900 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm(`Permanently remove ${spec.name}?`)) {
                remove.mutate({ id: spec.id });
              }
            }}
            disabled={remove.isPending}
            className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
          >
            {remove.isPending ? "…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LifecycleTimeline({ spec }: { spec: SpecRow }) {
  const fmt = useFormatters();
  const steps: Array<{ label: string; date: string | null }> = [
    { label: "approved", date: spec.approvedAt },
    { label: "ordered", date: spec.orderedAt },
    { label: "received", date: spec.receivedAt },
    { label: "installed", date: spec.installedAt },
  ];
  const stamped = steps.filter((s) => s.date);
  if (stamped.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-slate-400">
      {stamped.map((s) => (
        <span key={s.label}>
          {s.label} · <span className="text-slate-600">{fmt.date(s.date!)}</span>
        </span>
      ))}
    </div>
  );
}

/** Markup percent rounded to whole number. */
function markupPct(catalog: string, client: string): number | null {
  const c = parseFloat(catalog);
  const k = parseFloat(client);
  if (!isFinite(c) || !isFinite(k) || c === 0) return null;
  return Math.round(((k - c) / c) * 100);
}

// ────────────────────── form ──────────────────────

type RoomLite = { id: string; name: string; roomType: string | null };

function SpecForm({
  projectId,
  mode,
  existing,
  rooms,
  onClose,
}: {
  projectId: string;
  mode: "create" | "edit";
  existing?: SpecRow;
  rooms: RoomLite[];
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [specType, setSpecType] = useState<SpecType>(
    existing?.specType ?? "asset",
  );
  const [category, setCategory] = useState(existing?.category ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [roomId, setRoomId] = useState(existing?.roomId ?? "");
  const [state, setState] = useState<SpecState>(existing?.state ?? "specified");
  const [catalogPriceAmount, setCatalogPriceAmount] = useState(
    existing?.catalogPriceAmount ?? "",
  );
  const [catalogPriceCurrency, setCatalogPriceCurrency] = useState(
    existing?.catalogPriceCurrency ?? "USD",
  );
  const [clientPriceAmount, setClientPriceAmount] = useState(
    existing?.clientPriceAmount ?? "",
  );
  const [clientPriceCurrency, setClientPriceCurrency] = useState(
    existing?.clientPriceCurrency ?? "USD",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const create = trpc.specs.create.useMutation({
    onSuccess: () => {
      utils.specs.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const update = trpc.specs.update.useMutation({
    onSuccess: () => {
      utils.specs.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });
  const submitting = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cat = catalogPriceAmount.trim();
    const catCur = catalogPriceCurrency.trim();
    const cli = clientPriceAmount.trim();
    const cliCur = clientPriceCurrency.trim();
    if ((cat && !catCur) || (!cat && catCur)) {
      setError("Catalog price + currency must be set together.");
      return;
    }
    if ((cli && !cliCur) || (!cli && cliCur)) {
      setError("Client price + currency must be set together.");
      return;
    }
    const base = {
      specType,
      category: category.trim() || undefined,
      name: name.trim(),
      description: description.trim() || undefined,
      state,
      roomId: roomId || undefined,
      catalogPriceAmount: cat || undefined,
      catalogPriceCurrency: cat ? catCur : undefined,
      clientPriceAmount: cli || undefined,
      clientPriceCurrency: cli ? cliCur : undefined,
      notes: notes.trim() || undefined,
    };
    if (mode === "edit" && existing) {
      update.mutate({ id: existing.id, patch: base });
    } else {
      create.mutate({ projectId, ...base });
    }
  }

  // Quick markup helper — fills client price from catalog × (1 + pct/100)
  function applyMarkup(pct: number) {
    const cat = parseFloat(catalogPriceAmount);
    if (!isFinite(cat) || cat <= 0) return;
    const client = cat * (1 + pct / 100);
    setClientPriceAmount(client.toFixed(2));
    if (!clientPriceCurrency) setClientPriceCurrency(catalogPriceCurrency);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-md border border-paper-200 bg-white p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {mode === "edit" ? "Edit · spec" : "New · spec"}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Name *" wide>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="e.g. Sub-Zero PRO 48 fridge / Carrara marble countertop"
          />
        </Field>
        <Field label="Type">
          <select
            value={specType}
            onChange={(e) => setSpecType(e.target.value as SpecType)}
            className={selectCls}
          >
            {(Object.keys(SPEC_TYPE_LABELS) as SpecType[]).map((t) => (
              <option key={t} value={t}>
                {SPEC_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
            placeholder="appliance / tile / countertop…"
          />
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
        <Field label="State">
          <select
            value={state}
            onChange={(e) => setState(e.target.value as SpecState)}
            className={selectCls}
          >
            {(Object.keys(SPEC_STATE_LABELS) as SpecState[]).map((s) => (
              <option key={s} value={s}>
                {SPEC_STATE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" wide>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputCls}
            placeholder="Color, finish, size, sheen — whatever pins it down."
          />
        </Field>
        <Field label="Catalog price (trade)">
          <div className="flex gap-2">
            <input
              value={catalogPriceAmount}
              onChange={(e) => setCatalogPriceAmount(e.target.value)}
              className={`${inputCls} !w-auto flex-1`}
              placeholder="9500.00"
              inputMode="decimal"
            />
            <input
              value={catalogPriceCurrency}
              onChange={(e) =>
                setCatalogPriceCurrency(e.target.value.toUpperCase())
              }
              className={`${inputCls} !w-24 uppercase text-center tracking-wider`}
              maxLength={3}
            />
          </div>
        </Field>
        <Field label="Client price">
          <div className="flex gap-2">
            <input
              value={clientPriceAmount}
              onChange={(e) => setClientPriceAmount(e.target.value)}
              className={`${inputCls} !w-auto flex-1`}
              placeholder="11400.00"
              inputMode="decimal"
            />
            <input
              value={clientPriceCurrency}
              onChange={(e) =>
                setClientPriceCurrency(e.target.value.toUpperCase())
              }
              className={`${inputCls} !w-24 uppercase text-center tracking-wider`}
              maxLength={3}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
            <span className="font-mono uppercase tracking-wider">markup ·</span>
            {[10, 15, 20, 25, 30].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyMarkup(p)}
                className="rounded border border-paper-200 px-1.5 py-0.5 font-mono text-[10px] hover:bg-paper-50"
              >
                +{p}%
              </button>
            ))}
          </div>
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
