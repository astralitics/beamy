import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  type ProposalGroupBy,
  type ProposalStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type ProposalRow = inferRouterOutputs<AppRouter>["proposals"]["list"][number];
type WorkItemRow = inferRouterOutputs<AppRouter>["workItems"]["list"][number];

/**
 * Proposals tab — the outbound client side.
 *
 * Generator-first UX: an "Generate new" button opens the form where
 * the user picks work_items, sets a markup %, types a title +
 * intro, and hits go. Beamy renders the HTML artifact, uploads to
 * the documents bucket, and the new proposal appears in the list.
 *
 * The list below is read-only summary cards. Detail page (linked
 * per card) covers status transitions and download.
 */
export default function ProjectProposals() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const t = useT();
  const [generating, setGenerating] = useState(false);
  const list = trpc.proposals.list.useQuery({ projectId: project.id });

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            {t("proposals.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {t("proposals.lede")}
          </p>
        </div>
        {!generating && (
          <button
            type="button"
            onClick={() => setGenerating(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800"
          >
            {t("proposals.generate_new")}
          </button>
        )}
      </div>

      {generating && (
        <GenerateForm
          projectId={project.id}
          defaultCurrency={project.contractCurrency ?? "MXN"}
          onClose={() => setGenerating(false)}
        />
      )}

      <div className="mt-5 grid gap-2">
        {list.isLoading ? (
          <p className="text-xs text-slate-500">{t("common.loading")}</p>
        ) : list.error ? (
          <p className="text-xs text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            {t("proposals.empty_prefix")} <strong>{t("proposals.generate_new")}</strong>{" "}
            {t("proposals.empty_suffix")}
          </p>
        ) : (
          list.data.map((p) => (
            <ProposalCard key={p.id} projectId={project.id} proposal={p} />
          ))
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────── list card ──────────────

const STATUS_PILL_CLS: Record<ProposalStatus, string> = {
  drafted: "bg-slate-50 text-slate-700 ring-slate-200",
  sent: "bg-sky-50 text-sky-800 ring-sky-200",
  accepted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  superseded: "bg-paper-100 text-slate-500 ring-paper-200",
};

function ProposalCard({
  projectId,
  proposal,
}: {
  projectId: string;
  proposal: ProposalRow;
}) {
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
  return (
    <Link
      to={`/projects/${projectId}/proposals/${proposal.id}`}
      className="block rounded-md border border-paper-200 bg-white p-3 hover:border-paper-300 hover:shadow-sm"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">
          {proposal.number}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[proposal.status]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {L.proposalStatus(proposal.status)}
        </span>
        <span className="text-sm font-medium text-blueprint-900">
          {proposal.title}
        </span>
        <span className="ml-auto font-mono text-sm font-semibold text-blueprint-900">
          {proposal.totalAmount && proposal.totalCurrency
            ? fmt.currency(proposal.totalAmount, proposal.totalCurrency)
            : "—"}
        </span>
      </div>
      <div className="mt-1 flex gap-3 text-[10px] uppercase tracking-wider text-slate-400">
        <span>{t("proposals.generated_at", { date: fmt.date(proposal.createdAt) })}</span>
        {proposal.sentAt && (
          <span>· {t("proposals.sent_at", { date: fmt.date(proposal.sentAt) })}</span>
        )}
        {proposal.decidedAt && (
          <span>· {t("proposals.decided_at", { date: fmt.date(proposal.decidedAt) })}</span>
        )}
        {proposal.expiresAt && (
          <span>· {t("proposals.expires_at", { date: fmt.date(proposal.expiresAt) })}</span>
        )}
      </div>
    </Link>
  );
}

// ───────────────────────────────────── generate form ──────────

function GenerateForm({
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
  const utils = trpc.useUtils();
  const items = trpc.workItems.list.useQuery({ projectId });

  const [title, setTitle] = useState("");
  const [introText, setIntroText] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [expiresAt, setExpiresAt] = useState("");
  const [groupBy, setGroupBy] = useState<ProposalGroupBy>("work_type");
  const [overallMarkup, setOverallMarkup] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountUnit, setDiscountUnit] = useState<"pct" | "amount">("pct");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const generate = trpc.proposals.generate.useMutation({
    onSuccess: () => {
      utils.proposals.list.invalidate({ projectId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  // Default: include every non-cancelled item.
  const allEligible = useMemo(
    () => (items.data ?? []).filter((w) => w.status !== "cancelled"),
    [items.data],
  );
  const allSelected =
    allEligible.length > 0 && allEligible.every((w) => selected.has(w.id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allEligible.map((w) => w.id)));
  }

  // Live preview mirrors the server math: each line resolves its own
  // price (per-item override → per-item Plan markup), summed into a
  // subtotal, then the proposal-level markup and discount apply on top.
  const preview = useMemo(() => {
    let subtotal = 0;
    for (const w of allEligible) {
      if (!selected.has(w.id)) continue;
      const qty = w.qty ? parseFloat(w.qty) : null;
      const unit = w.unitPriceAmount ? parseFloat(w.unitPriceAmount) : null;
      if (qty == null) continue;
      const m = w.clientMarkupPct ? parseFloat(w.clientMarkupPct) : 0;
      const clientUnit =
        w.clientUnitPrice != null
          ? parseFloat(w.clientUnitPrice)
          : unit != null
            ? unit * (1 + m / 100)
            : null;
      if (clientUnit == null) continue;
      subtotal += qty * clientUnit;
    }
    const markupPct = parseFloat(overallMarkup) || 0;
    const markupAmount = subtotal * (markupPct / 100);
    const afterMarkup = subtotal + markupAmount;
    const dv = parseFloat(discountValue) || 0;
    const discount = discountUnit === "amount" ? dv : afterMarkup * (dv / 100);
    const total = afterMarkup - discount;
    return { subtotal, markupPct, markupAmount, discount, total };
  }, [allEligible, selected, overallMarkup, discountValue, discountUnit]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError(t("proposals.err_pick_one"));
      return;
    }
    if (!title.trim()) {
      setError(t("proposals.err_title_required"));
      return;
    }
    if (currency.trim().length !== 3) {
      setError(t("proposals.err_currency_code"));
      return;
    }
    const markupPct = parseFloat(overallMarkup) || 0;
    const dv = parseFloat(discountValue) || 0;
    generate.mutate({
      projectId,
      workItemIds: Array.from(selected),
      title: title.trim(),
      introText: introText.trim() || undefined,
      currency: currency.trim().toUpperCase(),
      expiresAt: expiresAt || undefined,
      groupBy,
      overallMarkupPct: markupPct > 0 ? markupPct : undefined,
      discountPct: discountUnit === "pct" && dv > 0 ? dv : undefined,
      discountAmount: discountUnit === "amount" && dv > 0 ? dv : undefined,
    });
  }

  const cur = currency || defaultCurrency;

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-md border border-paper-200 bg-white p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {t("proposals.form_eyebrow")}
      </p>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label={t("proposals.field_title")} wide>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder={t("proposals.field_title_ph")}
          />
        </Field>
        <Field label={t("proposals.field_currency")}>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className={`${inputCls} uppercase`}
            maxLength={3}
          />
        </Field>
        <Field label={t("proposals.field_expires")}>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={t("proposals.field_group_by")}>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as ProposalGroupBy)}
            className={inputCls}
          >
            <option value="work_type">{t("proposals.group.work_type")}</option>
            <option value="vendor">{t("proposals.group.vendor")}</option>
            <option value="room">{t("proposals.group.room")}</option>
            <option value="none">{t("proposals.group.none")}</option>
          </select>
        </Field>
        <Field label={t("proposals.field_markup")}>
          <input
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={overallMarkup}
            onChange={(e) => setOverallMarkup(e.target.value)}
            className={inputCls}
            placeholder="0"
          />
        </Field>
        <Field label={t("proposals.field_discount")}>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className={inputCls}
              placeholder="0"
            />
            <select
              value={discountUnit}
              onChange={(e) =>
                setDiscountUnit(e.target.value as "pct" | "amount")
              }
              className={`${inputCls} w-24 px-2`}
              aria-label={t("proposals.field_discount")}
            >
              <option value="pct">%</option>
              <option value="amount">{currency || defaultCurrency}</option>
            </select>
          </div>
        </Field>
        <Field label={t("proposals.field_intro")} wide>
          <textarea
            rows={3}
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            className={inputCls}
            placeholder={t("proposals.field_intro_ph")}
          />
        </Field>
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-slate-500">
        {t("proposals.picker_header")}
      </p>
      <div className="mt-1 rounded-md border border-paper-200">
        <div className="flex items-center justify-between border-b border-paper-200 px-3 py-2">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              checked={allSelected}
              onChange={toggleAll}
              disabled={allEligible.length === 0}
              className="h-4 w-4 accent-ink-900"
            />
            <span className="text-xs font-medium text-slate-700">
              {t("proposals.select_all")}
            </span>
          </label>
          {selected.size > 0 && (
            <span className="text-[10px] uppercase tracking-wider text-safety-700">
              {t("proposals.selected_count", { count: selected.size })}
            </span>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-paper-200">
          {items.isLoading ? (
            <p className="p-3 text-xs text-slate-500">{t("common.loading")}</p>
          ) : allEligible.length === 0 ? (
            <p className="p-3 text-xs text-slate-500">
              {t("proposals.picker_empty")}
            </p>
          ) : (
            allEligible.map((w) => (
              <WorkItemPickerRow
                key={w.id}
                item={w}
                checked={selected.has(w.id)}
                onToggle={() => toggle(w.id)}
              />
            ))
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mt-3 ml-auto w-full max-w-xs space-y-1">
          <SumRow
            label={t("proposals.sum_subtotal")}
            value={fmt.currency(preview.subtotal.toFixed(2), cur)}
          />
          {preview.markupPct > 0 && (
            <SumRow
              label={t("proposals.sum_markup", { pct: preview.markupPct })}
              value={fmt.currency(preview.markupAmount.toFixed(2), cur)}
            />
          )}
          {preview.discount > 0 && (
            <SumRow
              label={t("proposals.sum_discount")}
              value={`−${fmt.currency(preview.discount.toFixed(2), cur)}`}
            />
          )}
          <SumRow
            label={t("proposals.sum_total")}
            value={fmt.currency(preview.total.toFixed(2), cur)}
            strong
          />
        </div>
      )}

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
          disabled={generate.isPending}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {generate.isPending ? t("proposals.generating") : t("proposals.generate_submit")}
        </button>
      </div>
    </form>
  );
}

function WorkItemPickerRow({
  item,
  checked,
  onToggle,
}: {
  item: WorkItemRow;
  checked: boolean;
  onToggle: () => void;
}) {
  const fmt = useFormatters();
  const t = useT();
  const qty = item.qty ? parseFloat(item.qty) : null;
  const unit = item.unitPriceAmount ? parseFloat(item.unitPriceAmount) : null;
  const itemMarkup = item.clientMarkupPct
    ? parseFloat(item.clientMarkupPct)
    : 0;
  const clientUnit =
    item.clientUnitPrice != null
      ? parseFloat(item.clientUnitPrice)
      : unit != null
        ? unit * (1 + itemMarkup / 100)
        : null;
  const clientTotal = qty != null && clientUnit != null ? qty * clientUnit : null;
  const cur = item.unitPriceCurrency ?? item.totalCurrency ?? "MXN";

  return (
    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-paper-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-3.5 w-3.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {item.ref && (
            <span className="font-mono text-[11px] text-slate-500">
              {item.ref}
            </span>
          )}
          <span className="text-sm text-blueprint-900">{item.description}</span>
          {item.trade && (
            <span className="rounded-full bg-paper-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-paper-200">
              {item.trade}
            </span>
          )}
          {item.rooms.map((r) => (
            <span
              key={r.id}
              className="rounded-full bg-blueprint-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-blueprint-700 ring-1 ring-inset ring-blueprint-100"
            >
              {r.name}
            </span>
          ))}
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">
          {qty != null ? `${qty}${item.unit ? ` ${item.unit}` : ""}` : "—"}
          {" · "}
          {t("proposals.internal")}{" "}
          {unit != null ? fmt.currency(unit.toFixed(2), cur) : "—"}
        </div>
      </div>
      <div className="text-right font-mono text-xs text-blueprint-900">
        {clientTotal != null ? fmt.currency(clientTotal.toFixed(2), cur) : "—"}
      </div>
    </label>
  );
}

// ───────────────────────────────────── primitives ─────────────

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3.5 h-10 text-[14px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

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

function SumRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between ${
        strong
          ? "border-t border-paper-200 pt-1.5 text-blueprint-900"
          : "text-slate-500"
      }`}
    >
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
      <span
        className={`font-mono ${strong ? "text-base font-semibold" : "text-xs"}`}
      >
        {value}
      </span>
    </div>
  );
}
