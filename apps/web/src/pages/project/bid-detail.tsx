import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import {
  BID_FLAG_LABELS,
  BID_PACKAGE_STATUS_LABELS,
  BID_STATUS_LABELS,
  type BidPackageStatus,
  type BidStatus,
} from "@beamy/shared";
import { trpc } from "../../lib/trpc";
import { useFormatters } from "../../lib/i18n";
import { Button, Icon, Pill } from "../../components/ui";

type ProjectDetail = inferRouterOutputs<AppRouter>["projects"]["get"];

const STATUS_TONE: Record<
  BidStatus,
  "info" | "warn" | "success" | "alert" | "muted"
> = {
  received: "info",
  comparing: "warn",
  accepted: "success",
  rejected: "alert",
  expired: "muted",
};

const PACKAGE_TONE: Record<
  BidPackageStatus,
  "warn" | "success" | "muted"
> = {
  open: "warn",
  awarded: "success",
  cancelled: "muted",
};

export default function ProjectBidDetail() {
  const { project } = useOutletContext<{ project: ProjectDetail }>();
  const { bidId } = useParams<{ bidId: string }>();
  const navigate = useNavigate();
  const fmt = useFormatters();

  const bid = trpc.bids.get.useQuery(
    { id: bidId ?? "" },
    { enabled: !!bidId },
  );
  const lines = trpc.workItems.list.useQuery(
    { projectId: project.id, bidId: bidId ?? "" },
    { enabled: !!bidId },
  );

  const utils = trpc.useUtils();
  const award = trpc.bids.award.useMutation({
    onSuccess: () => {
      utils.bids.get.invalidate({ id: bidId ?? "" });
      utils.bids.list.invalidate({ projectId: project.id });
      utils.bidPackages.list.invalidate({ projectId: project.id });
    },
  });
  const remove = trpc.bids.remove.useMutation({
    onSuccess: () => {
      utils.bids.list.invalidate({ projectId: project.id });
      navigate(`/projects/${project.id}/bids`);
    },
  });

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
  if (bid.isLoading) return <p className="text-sm text-ink-500">Loading…</p>;
  if (bid.error)
    return <p className="text-sm text-rose-700">{bid.error.message}</p>;
  if (!bid.data) return null;

  const b = bid.data;
  const inPkg = b.package;
  const canAward =
    inPkg && inPkg.status === "open" && b.status !== "accepted";
  const today = new Date().toISOString().slice(0, 10);
  const validityExpired = b.validUntil && b.validUntil < today;

  return (
    <div className="animate-fade space-y-12">
      <header>
        <Link
          to={`/projects/${project.id}/bids`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900"
        >
          <Icon name="chevron-left" className="h-3 w-3" />
          Bids
        </Link>

        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={STATUS_TONE[b.status]} dot>
                {BID_STATUS_LABELS[b.status]}
              </Pill>
              {validityExpired && b.status !== "accepted" && (
                <Pill tone="alert">Expired</Pill>
              )}
              {inPkg && (
                <Link
                  to={`/projects/${project.id}/bids?package=${inPkg.id}`}
                  title={inPkg.scope ?? undefined}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-100"
                >
                  ◆ {inPkg.name}
                </Link>
              )}
              {inPkg && (
                <Pill tone={PACKAGE_TONE[inPkg.status]}>
                  Package · {BID_PACKAGE_STATUS_LABELS[inPkg.status]}
                </Pill>
              )}
            </div>
            <p className="mt-4 num text-5xl leading-none text-ink-900">
              {b.totalAmount && b.currency
                ? fmt.currency(b.totalAmount, b.currency)
                : "—"}
            </p>
            <h1 className="mt-3 font-display text-2xl font-normal tracking-tight text-ink-900">
              {b.vendor?.name ?? "(vendor unassigned)"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-500">
              {b.bidNumber && (
                <span className="font-mono">#{b.bidNumber}</span>
              )}
              {b.trade && <span>{b.trade}</span>}
              {b.ivaIncluded ? <span>IVA included</span> : <span>Pre-IVA</span>}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {canAward && (
              <Button
                variant="primary"
                onClick={() => {
                  const siblingMsg = inPkg
                    ? ` Other bids in "${inPkg.name}" will be marked rejected.`
                    : "";
                  if (
                    confirm(
                      `Award this bid to ${b.vendor?.name ?? "this vendor"}?${siblingMsg}`,
                    )
                  ) {
                    award.mutate({ id: b.id });
                  }
                }}
                disabled={award.isPending}
              >
                {award.isPending ? "Awarding…" : "Award"}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() =>
                navigate(`/projects/${project.id}/bids?edit=${b.id}`)
              }
            >
              Edit
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-ink-200/70 bg-ink-200/70 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Bid date">
          {b.bidDate ? fmt.date(b.bidDate) : "—"}
        </Fact>
        <Fact label="Valid until" tone={validityExpired ? "alert" : undefined}>
          {b.validUntil ? fmt.date(b.validUntil) : "—"}
        </Fact>
        <Fact label="Subtotal">
          {b.subtotalAmount && b.currency
            ? fmt.currency(b.subtotalAmount, b.currency)
            : "—"}
        </Fact>
        <Fact label="IVA">
          {b.ivaAmount && b.currency
            ? fmt.currency(b.ivaAmount, b.currency)
            : "—"}
        </Fact>
      </section>

      {b.flags.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Flags
          </h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {b.flags.map((f) => (
              <Pill key={f} tone="warn">
                {BID_FLAG_LABELS[f] ?? f}
              </Pill>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-normal tracking-tight text-ink-900">
            Itemized work
          </h2>
          <p className="text-[12px] text-ink-400">
            {lines.data?.length ?? 0}{" "}
            {(lines.data?.length ?? 0) === 1 ? "line" : "lines"}
          </p>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-ink-200/70 bg-white shadow-soft">
          {lines.isLoading ? (
            <p className="px-6 py-8 text-sm text-ink-500">Loading…</p>
          ) : lines.error ? (
            <p className="px-6 py-8 text-sm text-rose-700">
              {lines.error.message}
            </p>
          ) : !lines.data || lines.data.length === 0 ? (
            <p className="px-6 py-8 text-sm text-ink-500">
              This bid has no itemized lines yet.
            </p>
          ) : (
            <table className="w-full text-[14px]">
              <thead className="border-b border-ink-100 bg-paper-50">
                <tr className="text-left">
                  <Th>Ref</Th>
                  <Th>Description</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Unit price</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {lines.data.map((li) => (
                  <tr
                    key={li.id}
                    className="border-b border-ink-100 last:border-b-0"
                  >
                    <Td className="font-mono text-[12px] text-ink-500">
                      {li.ref ?? "—"}
                    </Td>
                    <Td className="text-ink-800">{li.description}</Td>
                    <Td align="right" className="tnum text-ink-600">
                      {li.qty
                        ? `${trimZero(li.qty)}${li.unit ? ` ${li.unit}` : ""}`
                        : "—"}
                    </Td>
                    <Td align="right" className="tnum text-ink-600">
                      {li.unitPriceAmount && li.unitPriceCurrency
                        ? fmt.currency(
                            li.unitPriceAmount,
                            li.unitPriceCurrency,
                          )
                        : "—"}
                    </Td>
                    <Td
                      align="right"
                      className="tnum font-medium text-ink-900"
                    >
                      {li.totalAmount && li.totalCurrency
                        ? fmt.currency(li.totalAmount, li.totalCurrency)
                        : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
              {linesTotal.size > 0 && (
                <tfoot className="bg-paper-50">
                  <tr>
                    <Td className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500" />
                    <Td className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                      Sum of lines
                    </Td>
                    <Td />
                    <Td />
                    <Td
                      align="right"
                      className="tnum font-semibold text-ink-900"
                    >
                      {Array.from(linesTotal.entries())
                        .map(([c, a]) =>
                          fmt.currency(a.toFixed(2), c),
                        )
                        .join(" · ")}
                    </Td>
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
            Notes
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
            {b.notes}
          </p>
        </section>
      )}

      <section className="border-t border-ink-100 pt-8">
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                `Delete this bid? Its ${lines.data?.length ?? 0} work items detach but stay.`,
              )
            ) {
              remove.mutate({ id: b.id });
            }
          }}
          className="text-[13px] text-rose-600 hover:text-rose-800"
        >
          Delete this bid
        </button>
      </section>
    </div>
  );
}

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
