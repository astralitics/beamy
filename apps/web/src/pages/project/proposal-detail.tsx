import { useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  PROPOSAL_STATUS_FLOW,
  type ProposalStatus,
} from "@beamy/shared";
import { ConfirmDialog } from "../../components/ui";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels, useT } from "../../lib/i18n";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];

const STATUS_PILL_CLS: Record<ProposalStatus, string> = {
  drafted: "bg-slate-50 text-slate-700 ring-slate-200",
  sent: "bg-sky-50 text-sky-800 ring-sky-200",
  accepted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  superseded: "bg-paper-100 text-slate-500 ring-paper-200",
};

/**
 * Proposal detail — title-block stamp + lines table + status
 * transitions + download button.
 */
export default function ProjectProposalDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();
  const L = useLabels();
  const t = useT();
  const utils = trpc.useUtils();

  const proposalQ = trpc.proposals.get.useQuery(
    { id: proposalId ?? "" },
    { enabled: !!proposalId },
  );
  const htmlQ = trpc.proposals.getHtml.useQuery(
    { id: proposalId ?? "" },
    { enabled: !!proposalId },
  );

  const transition = trpc.proposals.transition.useMutation({
    onSuccess: () => {
      utils.proposals.get.invalidate({ id: proposalId });
      utils.proposals.list.invalidate({ projectId: project.id });
    },
  });
  const remove = trpc.proposals.remove.useMutation({
    onSuccess: () => {
      utils.proposals.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/proposals`);
    },
  });

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!proposalId) return null;
  if (proposalQ.isLoading) {
    return <p className="text-xs text-text-muted">{t("common.loading")}</p>;
  }
  if (proposalQ.error) {
    return <p className="text-xs text-danger">{proposalQ.error.message}</p>;
  }
  const p = proposalQ.data;
  if (!p) return null;

  const advanceTo = nextStatus(p.status);

  // Totals breakdown from the snapshot. Legacy proposals (no subtotal
  // column) just show the bottom line via the facts card above.
  const cur = p.totalCurrency ?? "";
  const sub = p.subtotalAmount ? parseFloat(p.subtotalAmount) : null;
  const mPct = p.overallMarkupPct ? parseFloat(p.overallMarkupPct) : 0;
  const mAmt = sub != null ? sub * (mPct / 100) : 0;
  const afterMarkup = (sub ?? 0) + mAmt;
  const dAmt =
    p.discountAmount != null
      ? parseFloat(p.discountAmount)
      : p.discountPct != null
        ? afterMarkup * (parseFloat(p.discountPct) / 100)
        : 0;

  return (
    <div>
      <Link
        to={`/projects/${project.id}/proposals`}
        className="text-[10px] uppercase tracking-wider text-slate-400 hover:text-blueprint-900"
      >
        {t("proposal.back")}
      </Link>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">
            <span className="text-slate-700">{p.number}</span>
            <span className="mx-2 text-slate-300">|</span>
            {t("proposals.generated_at", { date: fmt.date(p.createdAt) })}
            {p.version > 1 && (
              <>
                <span className="mx-2 text-slate-300">|</span>v{p.version}
              </>
            )}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[p.status]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {L.proposalStatus(p.status)}
          </span>
        </div>

        <div className="px-5 py-5">
          <h1 className="font-display text-4xl font-normal tracking-tightest text-ink-900">
            {p.title}
          </h1>
          {p.introText && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
              {p.introText}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Fact label={t("proposal.fact_total")}>
            {p.totalAmount && p.totalCurrency
              ? fmt.currency(p.totalAmount, p.totalCurrency)
              : "—"}
          </Fact>
          <Fact label={t("proposal.fact_sent")}>{p.sentAt ? fmt.date(p.sentAt) : "—"}</Fact>
          <Fact label={t("proposal.fact_expires")}>
            {p.expiresAt ? fmt.date(p.expiresAt) : "—"}
          </Fact>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {advanceTo && (
          <button
            type="button"
            onClick={() => transition.mutate({ id: p.id, to: advanceTo })}
            disabled={transition.isPending}
            className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
          >
            {t("proposal.mark_status", {
              status: L.proposalStatus(advanceTo).toLowerCase(),
            })}
          </button>
        )}
        {p.status === "sent" && (
          <button
            type="button"
            onClick={() => transition.mutate({ id: p.id, to: "rejected" })}
            disabled={transition.isPending}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-danger hover:bg-bg-subtle disabled:opacity-50"
          >
            {t("proposal.mark_status", {
              status: L.proposalStatus("rejected").toLowerCase(),
            })}
          </button>
        )}
        {p.status === "accepted" && (
          <Link
            to={`/projects/${project.id}/money?phase=proposal`}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
          >
            {t("proposal.recorded_receivable")} →
          </Link>
        )}
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={remove.isPending}
          className="ml-auto text-xs text-danger hover:text-danger disabled:opacity-50"
        >
          {remove.isPending ? "…" : t("proposal.delete")}
        </button>
        {confirmingDelete && (
          <ConfirmDialog
            title={t("proposal.delete")}
            message={t("proposal.confirm_delete", { number: p.number })}
            confirmLabel={t("common.delete")}
            cancelLabel={t("common.cancel")}
            tone="danger"
            loading={remove.isPending}
            error={remove.error?.message}
            onConfirm={() => remove.mutate({ id: p.id })}
            onClose={() => setConfirmingDelete(false)}
          />
        )}
      </div>

      {htmlQ.isLoading && (
        <p className="mt-5 text-xs text-text-muted">
          {t("proposal.preview_loading")}
        </p>
      )}
      {htmlQ.data?.html && (
        <ClientPreview html={htmlQ.data.html} filename={`${p.number}.html`} />
      )}

      <div className="data-table mt-5">
        <table>
          <thead>
            <tr>
              <th>{t("proposal.col.section")}</th>
              <th>{t("col.description")}</th>
              <th>{t("proposal.col.rooms")}</th>
              <th className="r">{t("col.qty")}</th>
              <th className="r">{t("proposal.col.unit")}</th>
              <th className="r">{t("proposal.col.total")}</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-xs text-text-muted">
                  {t("proposal.no_lines")}
                </td>
              </tr>
            ) : (
              p.lines.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="whitespace-nowrap text-[10px] uppercase tracking-wide text-safety-700">
                    {line.sectionLabel ?? "—"}
                  </td>
                  <td className="text-text">
                    {line.displayDescription}
                  </td>
                  <td>
                    {line.roomNames && line.roomNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {line.roomNames.map((r, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-blueprint-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-blueprint-700 ring-1 ring-inset ring-blueprint-100"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-faint">—</span>
                    )}
                  </td>
                  <td className="r whitespace-nowrap font-mono text-[12px]">
                    {line.displayQty
                      ? `${trimQty(line.displayQty)}${line.displayUnit ? ` ${line.displayUnit}` : ""}`
                      : "—"}
                  </td>
                  <td className="r whitespace-nowrap font-mono text-[12px]">
                    {line.displayUnitPrice
                      ? fmt.currency(line.displayUnitPrice, line.currency)
                      : "—"}
                  </td>
                  <td className="r whitespace-nowrap font-mono text-[12px] font-medium">
                    {line.displayTotal
                      ? fmt.currency(line.displayTotal, line.currency)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {sub != null && (
            <tfoot className="bg-bg-subtle/45 text-[12px]">
              <tr className="border-t border-border">
                <td
                  colSpan={5}
                  className="px-5 py-1.5 text-right uppercase tracking-wider text-text-muted"
                >
                  {t("proposal.sum_subtotal")}
                </td>
                <td className="px-5 py-1.5 text-right font-mono">
                  {fmt.currency(p.subtotalAmount ?? "0", cur)}
                </td>
              </tr>
              {mPct > 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-1.5 text-right uppercase tracking-wider text-text-muted"
                  >
                    {t("proposal.sum_markup", { pct: mPct })}
                  </td>
                  <td className="px-5 py-1.5 text-right font-mono">
                    {fmt.currency(mAmt.toFixed(2), cur)}
                  </td>
                </tr>
              )}
              {dAmt > 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-1.5 text-right uppercase tracking-wider text-text-muted"
                  >
                    {t("proposal.sum_discount")}
                  </td>
                  <td className="px-5 py-1.5 text-right font-mono">
                    −{fmt.currency(dAmt.toFixed(2), cur)}
                  </td>
                </tr>
              )}
              <tr className="border-t border-border font-semibold text-text">
                <td
                  colSpan={5}
                  className="px-5 py-2 text-right uppercase tracking-wider"
                >
                  {t("proposal.sum_total")}
                </td>
                <td className="px-5 py-2 text-right font-mono">
                  {p.totalAmount ? fmt.currency(p.totalAmount, cur) : "—"}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-faint">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-text">
        {children}
      </p>
    </div>
  );
}

function nextStatus(status: ProposalStatus): ProposalStatus | null {
  const idx = PROPOSAL_STATUS_FLOW.indexOf(status);
  if (idx < 0 || idx === PROPOSAL_STATUS_FLOW.length - 1) return null;
  return PROPOSAL_STATUS_FLOW[idx + 1] ?? null;
}

function trimQty(qty: string): string {
  const n = parseFloat(qty);
  if (!isFinite(n)) return qty;
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(parseFloat(n.toFixed(4)));
}

/**
 * Client preview — renders the proposal HTML in an iframe (via srcDoc,
 * so it always renders regardless of how object storage serves the
 * stored artifact). The grouping toggle lives inside the document.
 * "Print / Save PDF" drives the iframe's own print; "Download HTML"
 * hands over the self-contained file to email.
 */
function ClientPreview({
  html,
  filename,
}: {
  html: string;
  filename: string;
}) {
  const t = useT();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function print() {
    iframeRef.current?.contentWindow?.print();
  }
  function download() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div>
          <p className="text-xs font-medium text-text">
            {t("proposal.preview")}
          </p>
          <p className="text-[10px] text-text-faint">
            {t("proposal.preview_hint")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={print}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-bg-subtle"
          >
            {t("proposal.print")}
          </button>
          <button
            type="button"
            onClick={download}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-bg-subtle"
          >
            {t("proposal.download_html")}
          </button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        title={t("proposal.preview")}
        srcDoc={html}
        className="h-[720px] w-full border-0 bg-bg-subtle"
      />
    </div>
  );
}
