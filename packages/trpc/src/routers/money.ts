import { eq } from "drizzle-orm";
import { bills, getDb, invoices } from "@beamy/db";
import { orgScopedProcedure, router } from "../init";

/**
 * `money` router — the firm-wide money read model.
 *
 * Catalog-aligned: this mirrors the astralitics-catalog `accounts-payable.apAging`
 * contract and its read-model philosophy — aging is COMPUTED (status + due date),
 * never a stored bucket; money is grouped PER CURRENCY with no FX conversion
 * (D-17); no GL. AP = vendor bills, AR = client invoices. When Beamy converges
 * onto the catalog's `accounts-payable` + `budget-control` modules, the page
 * already speaks these shapes.
 */
type ByCcy = { currency: string; amount: string };
type Bucket = { key: BucketKey; label: string; byCurrency: ByCcy[] };
type BucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d90";

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: "current", label: "Not yet due" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90", label: "90+ days" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysPastDue(dueAt: string | null, today: string): number {
  if (!dueAt) return -1; // no due date → treated as not overdue
  const due = Date.parse(`${dueAt}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(due)) return -1;
  return Math.floor((now - due) / 86_400_000);
}

function bucketFor(dueAt: string | null, today: string): BucketKey {
  const d = daysPastDue(dueAt, today);
  if (d <= 0) return "current";
  if (d <= 30) return "d1_30";
  if (d <= 60) return "d31_60";
  if (d <= 90) return "d61_90";
  return "d90";
}

/** Per-currency accumulator → sorted ByCcy[] (largest first). */
function toByCcy(map: Record<string, number>): ByCcy[] {
  return Object.entries(map)
    .filter(([, v]) => Math.abs(v) > 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
}

type Ledger = {
  outstanding: ByCcy[];
  overdue: ByCcy[];
  settled: ByCcy[]; // paid (AP) / collected (AR)
  billed: ByCcy[]; // AR only — invoiced (sent + paid); empty for AP
  openCount: number;
  overdueCount: number;
  aging: Bucket[];
};

export const moneyRouter = router({
  /**
   * Firm-wide AR + AP snapshot: outstanding, overdue, aging buckets, and
   * settled totals — all per currency, computed as of now.
   */
  firmSummary: orgScopedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const today = todayIso();

    const [billRows, invoiceRows] = await Promise.all([
      db
        .select({
          amount: bills.amount,
          currency: bills.currency,
          dueAt: bills.dueAt,
          status: bills.status,
        })
        .from(bills)
        .where(eq(bills.orgId, ctx.orgId)),
      db
        .select({
          amount: invoices.amount,
          currency: invoices.currency,
          dueAt: invoices.dueAt,
          status: invoices.status,
        })
        .from(invoices)
        .where(eq(invoices.orgId, ctx.orgId)),
    ]);

    // ── AP (bills): open is outstanding; paid is settled ──
    const apOutstanding: Record<string, number> = {};
    const apOverdue: Record<string, number> = {};
    const apSettled: Record<string, number> = {};
    const apAging: Record<BucketKey, Record<string, number>> = blankAging();
    let apOpen = 0;
    let apOverdueCount = 0;
    for (const b of billRows) {
      const amt = Number(b.amount);
      if (Number.isNaN(amt)) continue;
      if (b.status === "paid") {
        add(apSettled, b.currency, amt);
      } else if (b.status === "open") {
        add(apOutstanding, b.currency, amt);
        const key = bucketFor(b.dueAt, today);
        add(apAging[key], b.currency, amt);
        apOpen += 1;
        if (daysPastDue(b.dueAt, today) > 0) {
          add(apOverdue, b.currency, amt);
          apOverdueCount += 1;
        }
      }
    }

    // ── AR (invoices): sent is outstanding; paid is collected; both are billed ──
    const arOutstanding: Record<string, number> = {};
    const arOverdue: Record<string, number> = {};
    const arSettled: Record<string, number> = {};
    const arBilled: Record<string, number> = {};
    const arAging: Record<BucketKey, Record<string, number>> = blankAging();
    let arOpen = 0;
    let arOverdueCount = 0;
    for (const inv of invoiceRows) {
      const amt = Number(inv.amount);
      if (Number.isNaN(amt)) continue;
      if (inv.status === "paid") {
        add(arSettled, inv.currency, amt);
        add(arBilled, inv.currency, amt);
      } else if (inv.status === "sent") {
        add(arOutstanding, inv.currency, amt);
        add(arBilled, inv.currency, amt);
        const key = bucketFor(inv.dueAt, today);
        add(arAging[key], inv.currency, amt);
        arOpen += 1;
        if (daysPastDue(inv.dueAt, today) > 0) {
          add(arOverdue, inv.currency, amt);
          arOverdueCount += 1;
        }
      }
    }

    const ap: Ledger = {
      outstanding: toByCcy(apOutstanding),
      overdue: toByCcy(apOverdue),
      settled: toByCcy(apSettled),
      billed: [],
      openCount: apOpen,
      overdueCount: apOverdueCount,
      aging: agingToBuckets(apAging),
    };
    const ar: Ledger = {
      outstanding: toByCcy(arOutstanding),
      overdue: toByCcy(arOverdue),
      settled: toByCcy(arSettled),
      billed: toByCcy(arBilled),
      openCount: arOpen,
      overdueCount: arOverdueCount,
      aging: agingToBuckets(arAging),
    };

    return { asOf: new Date().toISOString(), ar, ap };
  }),
});

function add(map: Record<string, number>, ccy: string, amt: number) {
  map[ccy] = (map[ccy] ?? 0) + amt;
}

function blankAging(): Record<BucketKey, Record<string, number>> {
  return {
    current: {},
    d1_30: {},
    d31_60: {},
    d61_90: {},
    d90: {},
  };
}

function agingToBuckets(
  aging: Record<BucketKey, Record<string, number>>,
): Bucket[] {
  return BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    byCurrency: toByCcy(aging[b.key]),
  }));
}
