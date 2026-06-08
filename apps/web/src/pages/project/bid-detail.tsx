import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { type BidStatus } from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT } from "../../lib/i18n";
import { Button, ConfirmDialog, Icon, Pill } from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];
type BidLine = inferRouterOutputs<AppRouter>["workItems"]["list"][number];

const STATUS_TONE: Record<
  BidStatus,
  "info" | "warn" | "success" | "alert" | "muted"
> = {
  received: "info",
  comparing: "warn",
  accepted: "info",
  completed: "success",
  rejected: "alert",
  expired: "muted",
};

export default function ProjectBidDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { bidId } = useParams<{ bidId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();

  const bid = trpc.bids.get.useQuery(
    { id: bidId ?? "" },
    { enabled: !!bidId },
  );
  const lines = trpc.workItems.list.useQuery(
    { projectId: project.id, bidId: bidId ?? "" },
    { enabled: !!bidId },
  );

  const utils = trpc.useUtils();
  const [confirmAction, setConfirmAction] = useState<
    "reject" | "version" | "delete" | null
  >(null);
  const invalidateBid = () => {
    utils.bids.get.invalidate({ id: bidId ?? "" });
    utils.bids.list.invalidate({ projectId: project.id });
    // Approving promotes line items into the Plan + books a payable;
    // completing moves the committed rollup. Keep all of it fresh.
    utils.workItems.list.invalidate({ projectId: project.id });
    utils.bills.list.invalidate({ projectId: project.id });
    utils.projects.overviewStats.invalidate({ projectId: project.id });
    utils.projects.phaseAndCompleteness.invalidate({ projectId: project.id });
    setConfirmAction(null);
  };
  const decide = trpc.bids.decide.useMutation({ onSuccess: invalidateBid });
  const complete = trpc.bids.update.useMutation({ onSuccess: invalidateBid });
  const saveAsVersion = trpc.bids.saveAsVersion.useMutation({
    onSuccess: (nb) => {
      utils.bids.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/bids/${nb.id}`);
    },
  });
  const remove = trpc.bids.remove.useMutation({
    onSuccess: () => {
      utils.bids.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/bids`);
    },
  });

  const [addingLine, setAddingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const linesTotal = useMemo(() => {
    if (!lines.data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const li of lines.data) {
      if (!li.totalAmount || !li.totalCurrency) continue;
      m.set(
        li.totalCurrency,
        (m.get(li.totalCurrency) ?? 0) + parseFloat(li.totalAmount),
      );
    }
    return m;
  }, [lines.data]);

  if (!bidId) return null;
  if (bid.isLoading)
    return <p className="text-sm text-ink-500">{t("common.loading")}</p>;
  if (bid.error)
    return <p className="text-sm text-rose-700">{bid.error.message}</p>;
  if (!bid.data) return null;

  const b = bid.data;
  const today = new Date().toISOString().slice(0, 10);
  const validityExpired = b.validUntil && b.validUntil < today;
  const superseded = b.supersededBy;
  const readOnly = !!superseded;
  const lineRows = lines.data ?? [];
  const colCount = readOnly ? 5 : 6;

  return (
    <div className="animate-fade space-y-12">
      <header>
        <Link
          to={`/projects/${project.id}/bids`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          {t("bids.title")}
        </Link>

        {(b.version > 1 || b.supersedesBidId || superseded) && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px]">
            <span className="rounded-full bg-ink-100 px-2 py-0.5 font-mono text-[11px] text-ink-600">
              v{b.version}
            </span>
            {b.supersedesBidId && (
              <Link
                to={`/projects/${project.id}/bids/${b.supersedesBidId}`}
                className="text-ink-500 hover:text-ink-900"
              >
                {t("bids.detail.previous_version")}
              </Link>
            )}
            {superseded && (
              <Link
                to={`/projects/${project.id}/bids/${superseded.id}`}
                className="text-ink-500 hover:text-ink-900"
              >
                {t("bids.detail.superseded_by", { version: superseded.version })}
              </Link>
            )}
          </div>
        )}

        {superseded && (
          <div className="mt-3 rounded-lg border border-ink-200 bg-paper-50 px-4 py-3 text-[13px] text-ink-600">
            {t("bids.detail.readonly_prefix")}{" "}
            <Link
              to={`/projects/${project.id}/bids/${superseded.id}`}
              className="font-medium text-ink-900 underline-offset-2 hover:underline"
            >
              v{superseded.version}
            </Link>
            {t("bids.detail.readonly_suffix")}
          </div>
        )}

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={STATUS_TONE[b.status]} dot>
                {L.bidStatus(b.status)}
              </Pill>
              {validityExpired &&
                b.status !== "accepted" &&
                b.status !== "completed" && (
                  <Pill tone="alert">{t("bids.detail.validity_expired")}</Pill>
                )}
            </div>
            <p className="mt-4 num text-5xl leading-none text-ink-900">
              {b.totalAmount && b.currency
                ? fmt.currency(b.totalAmount, b.currency)
                : "—"}
            </p>
            <h1 className="mt-3 font-display text-2xl font-normal tracking-tight text-ink-900">
              {b.vendor?.name ?? t("bids.vendor_unassigned")}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-500">
              {b.bidNumber && <span className="font-mono">#{b.bidNumber}</span>}
              {b.trade && <span>{b.trade}</span>}
              {b.ivaIncluded ? (
                <span>{t("bids.detail.iva_included")}</span>
              ) : (
                <span>{t("bids.detail.pre_iva")}</span>
              )}
            </p>
          </div>
          {!readOnly && (
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {b.status !== "accepted" && b.status !== "completed" && (
                <Button
                  variant="primary"
                  onClick={() => decide.mutate({ id: b.id, decision: "accepted" })}
                  disabled={decide.isPending}
                >
                  {t("bids.approve")}
                </Button>
              )}
              {b.status === "accepted" && (
                <Button
                  variant="primary"
                  onClick={() =>
                    complete.mutate({ id: b.id, patch: { status: "completed" } })
                  }
                  disabled={complete.isPending}
                >
                  {complete.isPending
                    ? t("bids.completing")
                    : t("bids.detail.mark_complete")}
                </Button>
              )}
              {b.status !== "rejected" && b.status !== "completed" && (
                <Button
                  variant="secondary"
                  onClick={() => setConfirmAction("reject")}
                  disabled={decide.isPending}
                >
                  {t("bids.reject")}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setConfirmAction("version")}
                disabled={saveAsVersion.isPending}
              >
                {saveAsVersion.isPending
                  ? t("common.saving")
                  : t("bids.detail.save_as_version")}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(`/projects/${project.id}/bids?edit=${b.id}`)
                }
              >
                {t("bids.detail.edit_details")}
              </Button>
            </div>
          )}
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("bids.col.bid_date")}>
          {b.bidDate ? fmt.date(b.bidDate) : "—"}
        </Fact>
        <Fact
          label={t("bids.field.valid_until")}
          tone={validityExpired ? "alert" : undefined}
        >
          {b.validUntil ? fmt.date(b.validUntil) : "—"}
        </Fact>
        <Fact label={t("bids.field.subtotal")}>
          {b.subtotalAmount && b.currency
            ? fmt.currency(b.subtotalAmount, b.currency)
            : "—"}
        </Fact>
        <Fact label={t("bids.field.iva")}>
          {b.ivaAmount && b.currency
            ? fmt.currency(b.ivaAmount, b.currency)
            : "—"}
        </Fact>
      </section>

      {b.flags.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            {t("bids.flags")}
          </h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {b.flags.map((f) => (
              <Pill key={f} tone="warn">
                {L.bidFlag(f)}
              </Pill>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-normal tracking-tight text-ink-900">
            {t("bids.detail.itemized_work")}
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-ink-400">
              {lineRows.length === 1
                ? t("bids.detail.lines_count_one", { count: lineRows.length })
                : t("bids.detail.lines_count", { count: lineRows.length })}
            </p>
            {!readOnly && !addingLine && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingLineId(null);
                  setAddingLine(true);
                }}
              >
                <Icon name="plus" className="h-4 w-4" />
                {t("bids.detail.add_line")}
              </Button>
            )}
          </div>
        </div>

        {addingLine && (
          <div className="mt-3">
            <BidLineForm
              mode="create"
              projectId={project.id}
              bidId={b.id}
              defaultCurrency={b.currency ?? "MXN"}
              defaultTrade={b.trade ?? ""}
              onClose={() => setAddingLine(false)}
            />
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
          {lines.isLoading ? (
            <p className="px-6 py-8 text-sm text-ink-500">{t("common.loading")}</p>
          ) : lines.error ? (
            <p className="px-6 py-8 text-sm text-rose-700">
              {lines.error.message}
            </p>
          ) : lineRows.length === 0 && !addingLine ? (
            <p className="px-6 py-8 text-sm text-ink-500">
              {t("bids.detail.no_lines")}
              {!readOnly && t("bids.detail.no_lines_hint")}
            </p>
          ) : (
            <table className="w-full text-[14px]">
              <thead className="border-b border-ink-100 bg-paper-50">
                <tr className="text-left">
                  <Th>{t("bids.col.ref")}</Th>
                  <Th>{t("col.description")}</Th>
                  <Th align="right">{t("bids.col.qty")}</Th>
                  <Th align="right">{t("bids.col.unit_price")}</Th>
                  <Th align="right">{t("bids.col.total")}</Th>
                  {!readOnly && <Th align="right" />}
                </tr>
              </thead>
              <tbody>
                {lineRows.map((li) =>
                  editingLineId === li.id ? (
                    <tr key={li.id} className="border-b border-ink-100">
                      <td colSpan={colCount} className="bg-paper-50/60 p-3">
                        <BidLineForm
                          mode="edit"
                          existing={li}
                          projectId={project.id}
                          bidId={b.id}
                          defaultCurrency={b.currency ?? "MXN"}
                          defaultTrade={b.trade ?? ""}
                          onClose={() => setEditingLineId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <BidLineDisplayRow
                      key={li.id}
                      li={li}
                      projectId={project.id}
                      bidId={b.id}
                      readOnly={readOnly}
                      onEdit={() => {
                        setAddingLine(false);
                        setEditingLineId(li.id);
                      }}
                    />
                  ),
                )}
              </tbody>
              {linesTotal.size > 0 && (
                <tfoot className="bg-paper-50">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500"
                    >
                      {t("bids.sum_of_lines")}
                    </td>
                    <td className="px-5 py-3 text-right tnum font-semibold text-ink-900">
                      {Array.from(linesTotal.entries())
                        .map(([c, a]) => fmt.currency(a.toFixed(2), c))
                        .join(" · ")}
                    </td>
                    {!readOnly && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </section>

      {b.notes && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            {t("detail.notes")}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
            {b.notes}
          </p>
        </section>
      )}

      <section className="border-t border-ink-100 pt-8">
        <button
          type="button"
          onClick={() => setConfirmAction("delete")}
          className="text-[13px] text-rose-600 hover:text-rose-800"
        >
          {t("bids.detail.delete")}
        </button>
      </section>

      {confirmAction === "reject" && (
        <ConfirmDialog
          title={t("bids.detail.reject_title")}
          message={t("bids.detail.confirm_reject")}
          confirmLabel={t("bids.reject")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={decide.isPending}
          error={decide.error?.message ?? undefined}
          onConfirm={() => decide.mutate({ id: b.id, decision: "rejected" })}
          onClose={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === "version" && (
        <ConfirmDialog
          title={t("bids.detail.save_as_version")}
          message={t("bids.detail.confirm_save_version")}
          confirmLabel={t("bids.detail.save_as_version")}
          cancelLabel={t("common.cancel")}
          loading={saveAsVersion.isPending}
          error={saveAsVersion.error?.message ?? undefined}
          onConfirm={() => saveAsVersion.mutate({ id: b.id })}
          onClose={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === "delete" && (
        <ConfirmDialog
          title={t("bids.detail.delete_title")}
          message={t("bids.detail.confirm_delete", { count: lineRows.length })}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          tone="danger"
          loading={remove.isPending}
          error={remove.error?.message ?? undefined}
          onConfirm={() => remove.mutate({ id: b.id })}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────── line items ─────────────

function BidLineDisplayRow({
  li,
  projectId,
  bidId,
  readOnly,
  onEdit,
}: {
  li: BidLine;
  projectId: string;
  bidId: string;
  readOnly: boolean;
  onEdit: () => void;
}) {
  const fmt = useFormatters();
  const t = useT();
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);
  const remove = trpc.workItems.remove.useMutation({
    onSuccess: () => {
      utils.workItems.list.invalidate({ projectId, bidId });
      // The server recomputes the quote total from its lines — refresh it.
      utils.bids.get.invalidate({ id: bidId });
      utils.bids.list.invalidate({ projectId });
      setConfirming(false);
    },
  });
  return (
    <tr className="border-b border-ink-100 last:border-b-0">
      <Td className="font-mono text-[12px] text-ink-500">{li.ref ?? "—"}</Td>
      <Td className="text-ink-800">{li.description}</Td>
      <Td align="right" className="tnum text-ink-600">
        {li.qty ? `${trimZero(li.qty)}${li.unit ? ` ${li.unit}` : ""}` : "—"}
      </Td>
      <Td align="right" className="tnum text-ink-600">
        {li.unitPriceAmount && li.unitPriceCurrency
          ? fmt.currency(li.unitPriceAmount, li.unitPriceCurrency)
          : "—"}
      </Td>
      <Td align="right" className="tnum font-medium text-ink-900">
        {li.totalAmount && li.totalCurrency
          ? fmt.currency(li.totalAmount, li.totalCurrency)
          : "—"}
      </Td>
      {!readOnly && (
        <Td align="right" className="whitespace-nowrap">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="text-[12px] text-ink-500 hover:text-ink-900"
            >
              {t("common.edit")}
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => setConfirming(true)}
              className="text-[12px] text-rose-600 hover:text-rose-800 disabled:opacity-50"
            >
              {t("common.remove")}
            </button>
          </div>
          {confirming && (
            <ConfirmDialog
              title={t("bids.detail.remove_line_title")}
              message={t("bids.detail.confirm_remove_line", {
                description: li.description.slice(0, 40),
              })}
              confirmLabel={t("common.remove")}
              cancelLabel={t("common.cancel")}
              tone="danger"
              loading={remove.isPending}
              error={remove.error?.message ?? undefined}
              onConfirm={() => remove.mutate({ id: li.id })}
              onClose={() => setConfirming(false)}
            />
          )}
        </Td>
      )}
    </tr>
  );
}

function BidLineForm({
  mode,
  existing,
  projectId,
  bidId,
  defaultCurrency,
  defaultTrade,
  onClose,
}: {
  mode: "create" | "edit";
  existing?: BidLine;
  projectId: string;
  bidId: string;
  defaultCurrency: string;
  defaultTrade: string;
  onClose: () => void;
}) {
  const t = useT();
  const [description, setDescription] = useState(existing?.description ?? "");
  const [ref, setRef] = useState(existing?.ref ?? "");
  const [qty, setQty] = useState(existing?.qty ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [unitPrice, setUnitPrice] = useState(existing?.unitPriceAmount ?? "");
  const [total, setTotal] = useState(existing?.totalAmount ?? "");
  const [currency, setCurrency] = useState(
    existing?.totalCurrency ?? existing?.unitPriceCurrency ?? defaultCurrency,
  );
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const onDone = () => {
    utils.workItems.list.invalidate({ projectId, bidId });
    // The server recomputes the quote total from its lines — refresh it.
    utils.bids.get.invalidate({ id: bidId });
    utils.bids.list.invalidate({ projectId });
    onClose();
  };
  const create = trpc.workItems.create.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });
  const update = trpc.workItems.update.useMutation({
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });
  const submitting = create.isPending || update.isPending;

  function autoTotal() {
    const q = parseFloat(qty);
    const u = parseFloat(unitPrice);
    if (!isFinite(q) || !isFinite(u)) return;
    if (total.trim()) return;
    setTotal((q * u).toFixed(2));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) {
      setError(t("bids.detail.err_description_required"));
      return;
    }
    const cur = currency.trim().toUpperCase();
    const up = unitPrice.trim();
    const tot = total.trim();
    if ((up || tot) && cur.length !== 3) {
      setError(t("bids.detail.err_currency_price"));
      return;
    }
    if (mode === "edit" && existing) {
      update.mutate({
        id: existing.id,
        patch: {
          description: description.trim(),
          ref: ref.trim() || null,
          qty: qty.trim() || null,
          unit: unit.trim() || null,
          unitPriceAmount: up || null,
          unitPriceCurrency: up ? cur : null,
          totalAmount: tot || null,
          totalCurrency: tot ? cur : null,
        },
      });
    } else {
      create.mutate({
        projectId,
        bidId,
        description: description.trim(),
        ref: ref.trim() || undefined,
        trade: defaultTrade.trim() || undefined,
        qty: qty.trim() || undefined,
        unit: unit.trim() || undefined,
        unitPriceAmount: up || undefined,
        unitPriceCurrency: up ? cur : undefined,
        totalAmount: tot || undefined,
        totalCurrency: tot ? cur : undefined,
        status: "specified",
      });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-ink-200 bg-white p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        {mode === "edit" ? t("bids.detail.line_edit") : t("bids.detail.line_new")}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-6">
        <label className="block text-sm sm:col-span-4">
          <span className="text-ink-700">{t("bids.detail.field.description_req")}</span>
          <input
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputCls} mt-1`}
            autoFocus
            placeholder={t("bids.detail.field.description_ph")}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-700">{t("bids.col.ref")}</span>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className={`${inputCls} mt-1`}
            placeholder={t("bids.detail.field.ref_ph")}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-700">{t("bids.detail.field.qty_unit")}</span>
          <div className="mt-1 flex gap-2">
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={autoTotal}
              className={`${inputCls} flex-1`}
              placeholder={t("bids.detail.field.qty_ph")}
              inputMode="decimal"
            />
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={`${inputCls} w-20`}
              placeholder={t("bids.detail.field.unit_ph")}
            />
          </div>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-700">{t("bids.col.unit_price")}</span>
          <input
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            onBlur={autoTotal}
            className={`${inputCls} mt-1`}
            placeholder={t("bids.detail.field.unit_price_ph")}
            inputMode="decimal"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-700">{t("bids.field.total_currency")}</span>
          <div className="mt-1 flex gap-2">
            <input
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={`${inputCls} flex-1`}
              placeholder={t("bids.detail.field.total_ph")}
              inputMode="decimal"
            />
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={`${inputCls} w-20 text-center uppercase tracking-wider`}
              maxLength={3}
            />
          </div>
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting
            ? t("common.saving")
            : mode === "edit"
              ? t("bids.detail.save_line")
              : t("bids.detail.add_line")}
        </Button>
      </div>
    </form>
  );
}

const inputCls =
  "block w-full rounded-md border border-ink-200 bg-white px-3 h-9 text-[13px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10";

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
      <p
        className={`mt-1 truncate text-[15px] font-medium ${tone === "alert" ? "text-rose-700" : "text-ink-900"}`}
      >
        {children}
      </p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-5 py-3 align-top ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}

// Trim trailing zeros from a numeric string ("2.0000" → "2", "1.5000" → "1.5").
function trimZero(n: string): string {
  if (!n.includes(".")) return n;
  return n.replace(/\.?0+$/, "");
}
