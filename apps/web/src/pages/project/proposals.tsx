import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  type ProposalStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters, useLabels } from "../../lib/i18n";

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
  const [generating, setGenerating] = useState(false);
  const list = trpc.proposals.list.useQuery({ projectId: project.id });

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="font-display text-2xl font-normal tracking-tight text-ink-900">
            Proposals
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            What you send the client.
          </p>
        </div>
        {!generating && (
          <button
            type="button"
            onClick={() => setGenerating(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800"
          >
            Generate new
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
          <p className="text-xs text-slate-500">Loading…</p>
        ) : list.error ? (
          <p className="text-xs text-rose-700">{list.error.message}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="rounded-md border border-paper-200 bg-white p-4 text-xs text-slate-500">
            No proposals yet. Click <strong>Generate new</strong> to pick work
            items and produce the first one.
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
        <span>generated {fmt.date(proposal.createdAt)}</span>
        {proposal.sentAt && <span>· sent {fmt.date(proposal.sentAt)}</span>}
        {proposal.decidedAt && (
          <span>· decided {fmt.date(proposal.decidedAt)}</span>
        )}
        {proposal.expiresAt && (
          <span>· expires {fmt.date(proposal.expiresAt)}</span>
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
  const utils = trpc.useUtils();
  const items = trpc.workItems.list.useQuery({ projectId });

  const [title, setTitle] = useState("");
  const [introText, setIntroText] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [expiresAt, setExpiresAt] = useState("");
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

  // Preview total uses each work item's own clientMarkupPct (the Plan
  // is now the only place markup is set). Items with no markup default
  // to 0% — i.e. internal cost only.
  const previewTotal = useMemo(() => {
    let total = 0;
    for (const w of allEligible) {
      if (!selected.has(w.id)) continue;
      const qty = w.qty ? parseFloat(w.qty) : null;
      const unit = w.unitPriceAmount ? parseFloat(w.unitPriceAmount) : null;
      if (qty == null || unit == null) continue;
      const m = w.clientMarkupPct ? parseFloat(w.clientMarkupPct) : 0;
      total += qty * unit * (1 + m / 100);
    }
    return total;
  }, [allEligible, selected]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("Pick at least one work item.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (currency.trim().length !== 3) {
      setError("Currency must be a 3-letter code.");
      return;
    }
    generate.mutate({
      projectId,
      workItemIds: Array.from(selected),
      title: title.trim(),
      introText: introText.trim() || undefined,
      currency: currency.trim().toUpperCase(),
      expiresAt: expiresAt || undefined,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-md border border-paper-200 bg-white p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.15em] text-safety-700">
        New · proposal
      </p>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Title *" wide>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            autoFocus
            placeholder="Rubén Darío 123 — Proposal v1"
          />
        </Field>
        <Field label="Currency">
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className={`${inputCls} uppercase`}
            maxLength={3}
          />
        </Field>
        <Field label="Expires (optional)">
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Intro (optional)" wide>
          <textarea
            rows={3}
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            className={inputCls}
            placeholder="Lead paragraph the client sees at the top of the proposal."
          />
        </Field>
      </div>

      <div className="mt-4 rounded-md border border-paper-200">
        <div className="flex items-center justify-between border-b border-paper-200 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
            Work items · pick what goes on the proposal
          </p>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-paper-200">
          {items.isLoading ? (
            <p className="p-3 text-xs text-slate-500">Loading…</p>
          ) : allEligible.length === 0 ? (
            <p className="p-3 text-xs text-slate-500">
              No work items on this project yet — add some on the Plan tab
              first.
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
        <div className="mt-3 flex items-center justify-end gap-4 text-[11px] uppercase tracking-wider text-slate-500">
          <span>
            {selected.size} item{selected.size === 1 ? "" : "s"} · markup from
            Plan
          </span>
          <span className="text-base text-blueprint-900">
            {fmt.currency(previewTotal.toFixed(2), currency || defaultCurrency)}
          </span>
        </div>
      )}

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
          disabled={generate.isPending}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {generate.isPending ? "Generating…" : "Generate proposal"}
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
          internal{" "}
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
