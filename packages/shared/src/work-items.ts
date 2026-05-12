import { z } from "zod";

/**
 * work_items — execution unit. Quoted, approved, scheduled,
 * executed, accepted. Multi-room ready (M2M via work_item_rooms).
 *
 * Designed around the Propuesta line-item shape: heterogeneous
 * units (ea / m² / ml / lote), nullable bid_id (drafts before
 * quoting), nullable vendor_id (kept open until a bid is accepted).
 */

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const markupPct = z
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
    bidId: z.string().uuid().optional(),
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
      bidId: z.string().uuid().nullable().optional(),
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
      clientMarkupPct: markupPct.nullable().optional(),
      clientUnitPrice: moneyAmount.nullable().optional(),
      clientTotal: moneyAmount.nullable().optional(),
      clientCurrency: currencyCode.nullable().optional(),
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
  bidId: z.string().uuid().optional(),
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
