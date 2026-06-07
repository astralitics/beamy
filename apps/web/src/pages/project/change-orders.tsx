import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  CHANGE_ORDER_LINE_KIND_LABELS,
  type ChangeOrderLineKind,
  type ChangeOrderStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type COSummary =
  inferRouterOutputs<AppRouter>["changeOrders"]["list"][number];
type WorkItemRow = inferRouterOutputs<AppRouter>["workItems"]["list"][number];

/**
 * Change orders tab — list + inline create form. Each CO is its
 * own document with N line items, a frozen money delta, and a
 * lifecycle status. Approval applies line deltas to work_items
 * (handled server-side).
 */
export default function ProjectChangeOrders() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const list = trpc.changeOrders.list.useQuery({ projectId: project.id });

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            {t("co.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {t("co.lede")}
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800"
          >
            {t("co.new")}
          </button>
        )}
      </div>

      {creating && (
        <CreateForm
          projectId={project.id}
          defaultCurrency={project.contractCurrency ?? "MXN"}
          onClose={() => setCreating(false)}
        />
      )}

      <div className="mt-5 grid gap-2">
        {list.isLoading ? (
          <p className="text-xs text-slate-500">{t("common.loading")}</p>
        ) : list.error ? (
          <p className="text-xs text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            {t("co.empty_prefix")} <strong>{t("co.new")}</strong>{" "}
            {t("co.empty_suffix")}
          </p>
        ) : (
          list.data.map((co) => (
            <COCard key={co.id} projectId={project.id} co={co} />
          ))
        )}
      </div>
    </div>
  );
}

const STATUS_PILL_CLS: Record<ChangeOrderStatus, string> = {
  drafted: "bg-slate-50 text-slate-700 ring-slate-200",
  sent: "bg-sky-50 text-sky-800 ring-sky-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  void: "bg-paper-100 text-slate-500 ring-paper-200",
};

function COCard({
  projectId,
  co,
}: {
  projectId: string;
  co: COSummary;
}) {
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
  const delta = parseFloat(co.totalDeltaAmount);
  const negative = delta < 0;
  return (
    <Link
      to={`/projects/${projectId}/change-orders/${co.id}`}
      className="block rounded-md border border-paper-200 bg-white p-3 hover:border-paper-300 hover:shadow-sm"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">
          {co.number}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[co.status]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {L.changeOrderStatus(co.status)}
        </span>
        <span className="text-sm font-medium text-blueprint-900">{co.title}</span>
        <span
          className={`ml-auto font-mono text-sm font-semibold ${negative ? "text-rose-700" : "text-emerald-700"}`}
        >
          {negative ? "" : "+"}
          {fmt.currency(co.totalDeltaAmount, co.totalDeltaCurrency)}
        </span>
      </div>
      <div className="mt-1 flex gap-3 text-[10px] uppercase tracking-wider text-slate-400">
        <span>{t("co.drafted_at", { date: fmt.date(co.createdAt) })}</span>
        {co.sentAt && (
          <span>· {t("co.sent_at", { date: fmt.date(co.sentAt) })}</span>
        )}
        {co.decidedAt && (
          <span>
            · {t("co.decided_at", { date: fmt.date(co.decidedAt) })}
            {co.decidedBy ? ` ${t("co.by_actor", { actor: co.decidedBy })}` : ""}
          </span>
        )}
      </div>
    </Link>
  );
}

// ───────────────────────────────────── create form ────────────

interface DraftLine {
  key: string;
  kind: ChangeOrderLineKind;
  workItemId: string;
  description: string;
  qty: string;
  unit: string;
  unitPriceAmount: string;
  unitPriceCurrency: string;
  totalDeltaAmount: string;
  notes: string;
}

function CreateForm({
  projectId,
  defaultCurrency,
  onClose,
}: {
  projectId: string;
  defaultCurrency: string;
  onClose: () => void;
}) {
  const fmt = useFormatters();
  const t = useT();
  const L = useLabels();
  const utils = trpc.useUtils();
  const items = trpc.workItems.list.useQuery({ projectId });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [lines, setLines] = useState<DraftLine[]>([
    emptyLine("add", defaultCurrency),
  ]);
  const [error, setError] = useState<string | null>(null);

  const create = trpc.changeOrders.create.useMutation({
    onSuccess: () => {
      utils.changeOrders.list.invalidate({ projectId });
      utils.projects.overviewStats.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const total = useMemo(
    () =>
      lines.reduce((acc, l) => {
        const n = parseFloat(l.totalDeltaAmount);
        return acc + (isFinite(n) ? n : 0);
      }, 0),
    [lines],
  );

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine("modify", currency)]);
  }

  /**
   * When a `remove` line's work_item gets selected, default the
   * totalDeltaAmount to the negative of the work_item's current
   * total. The user can still override.
   */
  function onWorkItemSelected(line: DraftLine, workItemId: string) {
    const w = (items.data ?? []).find((it) => it.id === workItemId);
    if (line.kind === "remove" && w?.totalAmount) {
      const neg = (-parseFloat(w.totalAmount)).toFixed(2);
      updateLine(line.key, { workItemId, totalDeltaAmount: neg });
    } else if (line.kind === "modify" && w) {
      updateLine(line.key, {
        workItemId,
        description: w.description,
        qty: w.qty ?? "",
        unit: w.unit ?? "",
        unitPriceAmount: w.unitPriceAmount ?? "",
        unitPriceCurrency: w.unitPriceCurrency ?? currency,
      });
    } else {
      updateLine(line.key, { workItemId });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(t("co.err_title_required"));
      return;
    }
    if (lines.length === 0) {
      setError(t("co.err_min_one_line"));
      return;
    }
    for (const l of lines) {
      if (l.kind === "add" && !l.description.trim()) {
        setError(t("co.err_add_needs_description"));
        return;
      }
      if ((l.kind === "modify" || l.kind === "remove") && !l.workItemId) {
        setError(t("co.err_line_needs_work_item", { kind: L.changeOrderKind(l.kind) }));
        return;
      }
      if (!l.totalDeltaAmount.trim()) {
        setError(t("co.err_line_needs_delta"));
        return;
      }
    }
    create.mutate({
      projectId,
      title: title.trim(),
      description: description.trim() || undefined,
      totalDeltaCurrency: currency.trim().toUpperCase(),
      lines: lines.map((l, i) => ({
        kind: l.kind,
        workItemId: l.workItemId || undefined,
        displayOrder: i,
        description: l.description.trim() || undefined,
        qty: l.qty.trim() || undefined,
        unit: l.unit.trim() || undefined,
        unitPriceAmount: l.unitPriceAmount.trim() || undefined,
        unitPriceCurrency: l.unitPriceAmount.trim()
          ? l.unitPriceCurrency.trim().toUpperCase() || currency
          : undefined,
        totalDeltaAmount: l.totalDeltaAmount.trim(),
        notes: l.notes.trim() || undefined,
      })),
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-md border border-paper-200 bg-white p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {t("co.form_eyebrow")}
      </p>

      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Field label={t("co.field_title")} wide>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder={t("co.field_title_ph")}
          />
        </Field>
        <Field label={t("co.field_currency")}>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className={`${inputCls} uppercase`}
            maxLength={3}
          />
        </Field>
        <Field label={t("co.field_description")} wide>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
            placeholder={t("co.field_description_ph")}
          />
        </Field>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
            {t("co.lines")}
          </p>
          <button
            type="button"
            onClick={addLine}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            {t("co.add_line")}
          </button>
        </div>
        {lines.map((l) => (
          <LineRowEditor
            key={l.key}
            line={l}
            workItems={items.data ?? []}
            currency={currency}
            onUpdate={(patch) => updateLine(l.key, patch)}
            onRemove={() => removeLine(l.key)}
            onWorkItemSelected={onWorkItemSelected}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-3 text-[11px] uppercase tracking-wider text-slate-500">
        <span>
          {t(
            lines.length === 1 ? "co.net_delta_count_one" : "co.net_delta_count_other",
            { count: lines.length },
          )}
        </span>
        <span
          className={`text-base ${total < 0 ? "text-rose-700" : "text-emerald-700"}`}
        >
          {total < 0 ? "" : "+"}
          {fmt.currency(total.toFixed(2), currency || defaultCurrency)}
        </span>
      </div>

      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-paper-200 px-3 py-1 text-xs hover:bg-paper-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {create.isPending ? t("common.saving") : t("co.create_submit")}
        </button>
      </div>
    </form>
  );
}

function LineRowEditor({
  line,
  workItems,
  currency,
  onUpdate,
  onRemove,
  onWorkItemSelected,
}: {
  line: DraftLine;
  workItems: WorkItemRow[];
  currency: string;
  onUpdate: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  onWorkItemSelected: (line: DraftLine, id: string) => void;
}) {
  const L = useLabels();
  const t = useT();
  const showWorkItemPicker = line.kind === "modify" || line.kind === "remove";
  const showAfterFields = line.kind === "add" || line.kind === "modify";

  return (
    <div className="rounded-md border border-paper-200 bg-paper-50 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <select
          value={line.kind}
          onChange={(e) =>
            onUpdate({ kind: e.target.value as ChangeOrderLineKind })
          }
          className={`${selectCls} w-28`}
        >
          {(
            Object.keys(CHANGE_ORDER_LINE_KIND_LABELS) as ChangeOrderLineKind[]
          ).map((k) => (
            <option key={k} value={k}>
              {L.changeOrderKind(k)}
            </option>
          ))}
        </select>

        {showWorkItemPicker && (
          <select
            value={line.workItemId}
            onChange={(e) => onWorkItemSelected(line, e.target.value)}
            className={`${selectCls} flex-1 min-w-[12rem]`}
          >
            <option value="">{t("co.pick_work_item")}</option>
            {workItems.map((w) => (
              <option key={w.id} value={w.id}>
                {w.ref ? `${w.ref} — ` : ""}
                {w.description.slice(0, 80)}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-xs text-rose-600 hover:text-rose-800"
        >
          {t("co.remove_line")}
        </button>
      </div>

      {showAfterFields && (
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <textarea
              rows={2}
              value={line.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              className={inputCls}
              placeholder={
                line.kind === "add"
                  ? t("co.line_description_add_ph")
                  : t("co.line_description_modify_ph")
              }
            />
          </div>
          <input
            value={line.qty}
            onChange={(e) => onUpdate({ qty: e.target.value })}
            className={inputCls}
            placeholder={t("co.line_qty_ph")}
            inputMode="decimal"
          />
          <input
            value={line.unit}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            className={inputCls}
            placeholder={t("co.line_unit_ph")}
          />
          <input
            value={line.unitPriceAmount}
            onChange={(e) => onUpdate({ unitPriceAmount: e.target.value })}
            className={inputCls}
            placeholder={t("co.line_unit_price_ph")}
            inputMode="decimal"
          />
          <input
            value={line.unitPriceCurrency}
            onChange={(e) =>
              onUpdate({ unitPriceCurrency: e.target.value.toUpperCase() })
            }
            className={`${inputCls} uppercase`}
            maxLength={3}
            placeholder={currency}
          />
        </div>
      )}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {t("co.line_money_delta", { currency })}
          </span>
          <input
            value={line.totalDeltaAmount}
            onChange={(e) => onUpdate({ totalDeltaAmount: e.target.value })}
            className={`${inputCls} mt-1`}
            placeholder={t("co.line_money_delta_ph")}
            inputMode="decimal"
          />
        </label>
        <label className="text-sm">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {t("co.line_notes")}
          </span>
          <input
            value={line.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            className={`${inputCls} mt-1`}
          />
        </label>
      </div>
    </div>
  );
}

function emptyLine(kind: ChangeOrderLineKind, currency: string): DraftLine {
  return {
    key: crypto.randomUUID(),
    kind,
    workItemId: "",
    description: "",
    qty: "",
    unit: "",
    unitPriceAmount: "",
    unitPriceCurrency: currency,
    totalDeltaAmount: "",
    notes: "",
  };
}

// ───────────────────────────────────── primitives ─────────────

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

const selectCls =
  "block rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

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
