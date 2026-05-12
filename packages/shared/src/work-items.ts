import { z } from "zod";

/**
 * Proposals + work_items — the execution spine. A proposal is a
 * vendor bid; a work_item is the unit of work that gets quoted,
 * approved, scheduled, executed, and billed against.
 *
 * Designed around the Propuesta data shape: line items with
 * multi-room scope, vendor flags ("iva-not-included"), and
 * heterogeneous units (ea / m² / ml / lote).
 */

// ─────────────────────────────────────── primitives ───────────

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const qtyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "decimal with up to 4 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

function moneyPairCheck(
  amount: string | null | undefined,
  currency: string | null | undefined,
  ctx: z.RefinementCtx,
  amountPath: string,
) {
  const hasAmount = amount !== undefined && amount !== null;
  const hasCurrency = currency !== undefined && currency !== null;
  if (hasAmount !== hasCurrency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "amount and currency must be set together",
      path: [amountPath],
    });
  }
}

// ─────────────────────────────────────── proposals ────────────

export const proposalStatusSchema = z.enum([
  "received",
  "comparing",
  "accepted",
  "rejected",
  "expired",
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  received: "Received",
  comparing: "Comparing",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

/**
 * Open-ended slugs for proposal flags. Codified here as a soft
 * enum — Zod accepts any kebab-case string so importers can land
 * unfamiliar flags; UI maps the known ones to friendly labels.
 */
export const PROPOSAL_FLAG_LABELS: Record<string, string> = {
  "iva-not-included": "IVA not included",
  "iva-included": "IVA included",
  "validity-likely-expired": "Validity likely expired",
  "freight-not-included": "Freight not included",
  "deposit-required": "Deposit required",
};

const flagSlug = z.string().regex(/^[a-z0-9-]+$/, "kebab-case slug");

export const proposalCreateInputSchema = z
  .object({
    projectId: z.string().uuid(),
    vendorId: z.string().uuid().optional(),
    trade: z.string().trim().max(80).optional(),
    quoteNumber: z.string().trim().max(120).optional(),
    quoteDate: isoDate.optional(),
    validUntil: isoDate.optional(),
    subtotalAmount: moneyAmount.optional(),
    ivaAmount: moneyAmount.optional(),
    totalAmount: moneyAmount.optional(),
    currency: currencyCode.optional(),
    status: proposalStatusSchema.default("received"),
    decidedAt: isoDate.optional(),
    flags: z.array(flagSlug).max(20).default([]),
    notes: z.string().trim().max(10000).optional(),
  })
  .superRefine((val, ctx) => {
    // If any money figure is set, currency must be too.
    const anyMoney =
      val.subtotalAmount !== undefined ||
      val.ivaAmount !== undefined ||
      val.totalAmount !== undefined;
    if (anyMoney && !val.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "currency required when any monetary amount is set",
        path: ["currency"],
      });
    }
  });
export type ProposalCreateInput = z.infer<typeof proposalCreateInputSchema>;

export const proposalUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z
    .object({
      vendorId: z.string().uuid().nullable().optional(),
      trade: z.string().trim().max(80).nullable().optional(),
      quoteNumber: z.string().trim().max(120).nullable().optional(),
      quoteDate: isoDate.nullable().optional(),
      validUntil: isoDate.nullable().optional(),
      subtotalAmount: moneyAmount.nullable().optional(),
      ivaAmount: moneyAmount.nullable().optional(),
      totalAmount: moneyAmount.nullable().optional(),
      currency: currencyCode.nullable().optional(),
      status: proposalStatusSchema.optional(),
      decidedAt: isoDate.nullable().optional(),
      flags: z.array(flagSlug).max(20).optional(),
      notes: z.string().trim().max(10000).nullable().optional(),
    })
    .superRefine((val, ctx) => {
      const anyMoney =
        val.subtotalAmount !== undefined ||
        val.ivaAmount !== undefined ||
        val.totalAmount !== undefined;
      const currencyTouched = val.currency !== undefined;
      if (anyMoney && currencyTouched && val.currency === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "currency required when any monetary amount is set",
          path: ["currency"],
        });
      }
    }),
});
export type ProposalUpdateInput = z.infer<typeof proposalUpdateInputSchema>;

export const proposalListInputSchema = z.object({
  projectId: z.string().uuid(),
  status: proposalStatusSchema.optional(),
  vendorId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
});
export type ProposalListInput = z.infer<typeof proposalListInputSchema>;

export const proposalIdInputSchema = z.object({ id: z.string().uuid() });
export type ProposalIdInput = z.infer<typeof proposalIdInputSchema>;

// ─────────────────────────────────────── work items ───────────

export const workItemStatusSchema = z.enum([
  "specified",
  "approved",
  "scheduled",
  "in_progress",
  "done",
  "accepted",
  "cancelled",
]);
export type WorkItemStatus = z.infer<typeof workItemStatusSchema>;

export const WORK_ITEM_STATUS_LABELS: Record<WorkItemStatus, string> = {
  specified: "Specified",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  done: "Done",
  accepted: "Accepted",
  cancelled: "Cancelled",
};

/** Ordered forward flow; UI uses this for next-step suggestions. */
export const WORK_ITEM_STATUS_FLOW: WorkItemStatus[] = [
  "specified",
  "approved",
  "scheduled",
  "in_progress",
  "done",
  "accepted",
];

export const workItemCreateInputSchema = z
  .object({
    projectId: z.string().uuid(),
    proposalId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    roomIds: z.array(z.string().uuid()).max(50).default([]),
    trade: z.string().trim().max(80).optional(),
    ref: z.string().trim().max(40).optional(),
    description: z.string().trim().min(1, "Description is required").max(2000),
    qty: qtyAmount.optional(),
    unit: z.string().trim().max(20).optional(),
    unitPriceAmount: moneyAmount.optional(),
    unitPriceCurrency: currencyCode.optional(),
    totalAmount: moneyAmount.optional(),
    totalCurrency: currencyCode.optional(),
    status: workItemStatusSchema.default("specified"),
    plannedStart: isoDate.optional(),
    plannedEnd: isoDate.optional(),
    actualStart: isoDate.optional(),
    actualEnd: isoDate.optional(),
    notes: z.string().trim().max(10000).optional(),
  })
  .superRefine((val, ctx) => {
    moneyPairCheck(
      val.unitPriceAmount,
      val.unitPriceCurrency,
      ctx,
      "unitPriceAmount",
    );
    moneyPairCheck(val.totalAmount, val.totalCurrency, ctx, "totalAmount");
  });
export type WorkItemCreateInput = z.infer<typeof workItemCreateInputSchema>;

export const workItemUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z
    .object({
      proposalId: z.string().uuid().nullable().optional(),
      vendorId: z.string().uuid().nullable().optional(),
      /** When set, replaces the room set entirely. */
      roomIds: z.array(z.string().uuid()).max(50).optional(),
      trade: z.string().trim().max(80).nullable().optional(),
      ref: z.string().trim().max(40).nullable().optional(),
      description: z.string().trim().min(1).max(2000).optional(),
      qty: qtyAmount.nullable().optional(),
      unit: z.string().trim().max(20).nullable().optional(),
      unitPriceAmount: moneyAmount.nullable().optional(),
      unitPriceCurrency: currencyCode.nullable().optional(),
      totalAmount: moneyAmount.nullable().optional(),
      totalCurrency: currencyCode.nullable().optional(),
      status: workItemStatusSchema.optional(),
      plannedStart: isoDate.nullable().optional(),
      plannedEnd: isoDate.nullable().optional(),
      actualStart: isoDate.nullable().optional(),
      actualEnd: isoDate.nullable().optional(),
      notes: z.string().trim().max(10000).nullable().optional(),
    })
    .superRefine((val, ctx) => {
      moneyPairCheck(
        val.unitPriceAmount,
        val.unitPriceCurrency,
        ctx,
        "unitPriceAmount",
      );
      moneyPairCheck(val.totalAmount, val.totalCurrency, ctx, "totalAmount");
    }),
});
export type WorkItemUpdateInput = z.infer<typeof workItemUpdateInputSchema>;

export const workItemListInputSchema = z.object({
  projectId: z.string().uuid(),
  status: workItemStatusSchema.optional(),
  trade: z.string().trim().max(80).optional(),
  roomId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  proposalId: z.string().uuid().optional(),
  /** When true, returns only items whose planned_end is in the past. */
  overdue: z.boolean().optional(),
  search: z.string().trim().max(200).optional(),
});
export type WorkItemListInput = z.infer<typeof workItemListInputSchema>;

export const workItemIdInputSchema = z.object({ id: z.string().uuid() });
export type WorkItemIdInput = z.infer<typeof workItemIdInputSchema>;

export const workItemTransitionInputSchema = z.object({
  id: z.string().uuid(),
  to: workItemStatusSchema,
  at: isoDate.optional(),
});
export type WorkItemTransitionInput = z.infer<
  typeof workItemTransitionInputSchema
>;
