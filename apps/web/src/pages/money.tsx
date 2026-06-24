import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@beamy/trpc";
import { trpc } from "../lib/trpc";
import { useT } from "../lib/i18n";
import { Money, PageHeader, Pill } from "../components/ui";

type Summary = inferRouterOutputs<AppRouter>["money"]["firmSummary"];
type Ledger = Summary["ar"];
type ByCcy = { currency: string; amount: string };

/** Firm Money — receivables + payables across every project, with computed
 *  aging. BEAM styling, the one canonical table format. */
export default function MoneyPage() {
  const t = useT();
  const q = trpc.money.firmSummary.useQuery();

  const hasAny =
    q.data &&
    [q.data.ar.outstanding, q.data.ar.settled, q.data.ar.billed, q.data.ap.outstanding, q.data.ap.settled].some(
      (a) => a.length > 0,
    );

  return (
    <div className="mx-auto max-w-[1500px] animate-rise px-4 py-8 sm:px-6 lg:px-10 lg:py-14">
      <PageHeader title={t("money.title")} lede={t("money.lede")} />

      {q.isLoading ? (
        <p className="mt-10 text-sm text-text-muted">{t("common.loading")}</p>
      ) : q.error ? (
        <p className="mt-10 text-sm text-danger">{q.error.message}</p>
      ) : !hasAny ? (
        <div className="mt-10 rounded-2xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
          <p className="font-display text-2xl font-bold text-text">{t("money.empty")}</p>
          <p className="mt-2 text-[14px] text-text-muted">{t("money.empty_sub")}</p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <LedgerCard title={t("money.section.ar")} hint={t("money.ar_hint")} ledger={q.data!.ar} settledLabel={t("money.collected")} />
          <LedgerCard title={t("money.section.ap")} hint={t("money.ap_hint")} ledger={q.data!.ap} settledLabel={t("money.paid")} />
        </div>
      )}
    </div>
  );
}

function LedgerCard({
  title,
  hint,
  ledger,
  settledLabel,
}: {
  title: string;
  hint: string;
  ledger: Ledger;
  settledLabel: string;
}) {
  const t = useT();
  const agingRows = ledger.aging.filter((b) => b.byCurrency.length > 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-text">{title}</h2>
          <p className="mt-0.5 text-[13px] text-text-muted">{hint}</p>
        </div>
        {ledger.overdueCount > 0 && (
          <Pill tone="alert" dot>
            {ledger.overdueCount} {t("money.overdue").toLowerCase()}
          </Pill>
        )}
      </div>

      {/* outstanding hero */}
      <div className="beam-rail mt-6">
        <p className="section-label">{t("money.outstanding")}</p>
        <div className="mt-1.5 flex flex-col gap-0.5">
          {ledger.outstanding.length === 0 ? (
            <Money className="text-3xl" />
          ) : (
            ledger.outstanding.map((r) => <Money key={r.currency} amount={r.amount} currency={r.currency} className="text-3xl" />)
          )}
        </div>
      </div>

      {/* two sub-stats */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Stat label={t("money.overdue")} rows={ledger.overdue} tone="danger" />
        <Stat label={settledLabel} rows={ledger.settled} tone="success" />
      </div>

      {/* aging table */}
      <div className="mt-6">
        <p className="section-label mb-3">{t("money.aging")}</p>
        {agingRows.length === 0 ? (
          <p className="text-[13px] text-text-faint">—</p>
        ) : (
          <div className="data-table">
            <table>
              <tbody>
                {agingRows.map((b) => {
                  const overdue = b.key !== "current";
                  return (
                    <tr key={b.key}>
                      <td>
                        <span
                          className={`inline-flex items-center gap-2 text-[14px] ${
                            b.key === "d90" ? "text-danger" : overdue ? "text-warn" : "text-text-muted"
                          }`}
                        >
                          {overdue && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                          {b.label}
                        </span>
                      </td>
                      <td className="r">
                        <MoneyList rows={b.byCurrency} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, rows, tone }: { label: string; rows: ByCcy[]; tone: "danger" | "success" }) {
  return (
    <div className="rounded-xl border border-border bg-bg-subtle/40 px-4 py-3">
      <p className="section-label">{label}</p>
      <div className="mt-1.5">
        {rows.length === 0 ? (
          <Money className="text-base" />
        ) : (
          rows.map((r) => (
            <div key={r.currency}>
              <Money amount={r.amount} currency={r.currency} className={`text-base ${tone === "danger" ? "!text-danger" : "!text-success"}`} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MoneyList({ rows }: { rows: ByCcy[] }) {
  if (rows.length === 0) return <Money mono />;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      {rows.map((r) => (
        <Money key={r.currency} amount={r.amount} currency={r.currency} mono />
      ))}
    </span>
  );
}
