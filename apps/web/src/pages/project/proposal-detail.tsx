import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  PROPOSAL_STATUS_FLOW,
  PROPOSAL_STATUS_LABELS,
  type ProposalStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";

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
  const utils = trpc.useUtils();

  const proposalQ = trpc.proposals.get.useQuery(
    { id: proposalId ?? "" },
    { enabled: !!proposalId },
  );
  const downloadQ = trpc.proposals.getDownloadUrl.useQuery(
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

  if (!proposalId) return null;
  if (proposalQ.isLoading) {
    return <p className="text-xs text-slate-500">Loading…</p>;
  }
  if (proposalQ.error) {
    return <p className="text-xs text-rose-700">{proposalQ.error.message}</p>;
  }
  const p = proposalQ.data;
  if (!p) return null;

  const advanceTo = nextStatus(p.status);

  return (
    <div>
      <Link
        to={`/projects/${project.id}/proposals`}
        className="font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-blueprint-900"
      >
        ← Back to proposals
      </Link>

      <div className="mt-3 overflow-hidden rounded-lg border border-paper-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-paper-200 px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
            <span className="text-slate-700">{p.number}</span>
            <span className="mx-2 text-slate-300">|</span>
            generated {fmt.date(p.createdAt)}
            {p.version > 1 && (
              <>
                <span className="mx-2 text-slate-300">|</span>v{p.version}
              </>
            )}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${STATUS_PILL_CLS[p.status]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {PROPOSAL_STATUS_LABELS[p.status]}
          </span>
        </div>

        <div className="px-5 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-blueprint-900">
            {p.title}
          </h1>
          {p.introText && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
              {p.introText}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 divide-y divide-paper-200 border-t border-paper-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Fact label="Total">
            {p.totalAmount && p.totalCurrency
              ? fmt.currency(p.totalAmount, p.totalCurrency)
              : "—"}
          </Fact>
          <Fact label="Sent">{p.sentAt ? fmt.date(p.sentAt) : "—"}</Fact>
          <Fact label="Expires">
            {p.expiresAt ? fmt.date(p.expiresAt) : "—"}
          </Fact>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {downloadQ.data?.url && (
          <a
            href={downloadQ.data.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Open HTML artifact ↗
          </a>
        )}
        {advanceTo && (
          <button
            type="button"
            onClick={() => transition.mutate({ id: p.id, to: advanceTo })}
            disabled={transition.isPending}
            className="rounded-md border border-paper-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-paper-50 disabled:opacity-50"
          >
            Mark {PROPOSAL_STATUS_LABELS[advanceTo].toLowerCase()}
          </button>
        )}
        {p.status === "sent" && (
          <button
            type="button"
            onClick={() => transition.mutate({ id: p.id, to: "rejected" })}
            disabled={transition.isPending}
            className="rounded-md border border-paper-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-paper-50 disabled:opacity-50"
          >
            Mark rejected
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Permanently delete ${p.number}?`)) {
              remove.mutate({ id: p.id });
            }
          }}
          disabled={remove.isPending}
          className="ml-auto text-xs text-rose-600 hover:text-rose-800 disabled:opacity-50"
        >
          {remove.isPending ? "…" : "Delete proposal"}
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-paper-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper-50 text-left">
            <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <th className="px-3 py-2">Section</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {p.lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-xs text-slate-500">
                  No lines on this proposal.
                </td>
              </tr>
            ) : (
              p.lines.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-safety-700">
                    {line.sectionLabel ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-blueprint-900">
                    {line.displayDescription}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px]">
                    {line.displayQty
                      ? `${trimQty(line.displayQty)}${line.displayUnit ? ` ${line.displayUnit}` : ""}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px]">
                    {line.displayUnitPrice
                      ? fmt.currency(line.displayUnitPrice, line.currency)
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] font-medium">
                    {line.displayTotal
                      ? fmt.currency(line.displayTotal, line.currency)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-blueprint-900">
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
