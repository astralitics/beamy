import { z } from "zod";

/**
 * change_orders — formal scope/budget change documents. CRUD plus
 * a transition endpoint that handles the approval side effects
 * (applying line deltas to work_items transactionally).
 */

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const qtyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "decimal with up to 4 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const changeOrderStatusSchema = z.enum([
  "drafted",
  "sent",
  "approved",
  "rejected",
  "void",
]);
export type ChangeOrderStatus = z.infer<typeof changeOrderStatusSchema>;

export const CHANGE_ORDER_STATUS_LABELS: Record<ChangeOrderStatus, string> = {
  drafted: "Drafted",
  sent: "Sent",
  approved: "Approved",
  rejected: "Rejected",
  void: "Void",
};

/** Ordered forward flow. UI uses for next-step suggestions. */
export const CHANGE_ORDER_STATUS_FLOW: ChangeOrderStatus[] = [
  "drafted",
  "sent",
  "approved",
];

export const changeOrderLineKindSchema = z.enum(["add", "modify", "remove"]);
export type ChangeOrderLineKind = z.infer<typeof changeOrderLineKindSchema>;

export const CHANGE_ORDER_LINE_KIND_LABELS: Record<
  ChangeOrderLineKind,
  string
> = {
  add: "Add",
  modify: "Modify",
  remove: "Remove",
};

/**
 * Per-line input. After-state semantics: a `modify` line stores
 * the values the work_item should HAVE after the CO applies (not
 * deltas). `add` lines also use these fields as the new work_item's
 * spec. `remove` lines ignore everything except work_item_id +
 * totalDeltaAmount.
 *
 * Validation invariants enforced via superRefine:
 *   - add: workItemId must be null; description/qty/unitPrice required
 *   - modify: workItemId required
 *   - remove: workItemId required
 */
export const changeOrderLineInputSchema = z
  .object({
    kind: changeOrderLineKindSchema,
    workItemId: z.string().uuid().nullable().optional(),
    displayOrder: z.number().int().min(0).default(0),
    description: z.string().trim().max(2000).optional(),
    qty: qtyAmount.optional(),
    unit: z.string().trim().max(20).optional(),
    unitPriceAmount: moneyAmount.optional(),
    unitPriceCurrency: currencyCode.optional(),
    totalDeltaAmount: moneyAmount,
    notes: z.string().trim().max(10000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "add") {
      if (val.workItemId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "add lines must not reference an existing work item",
          path: ["workItemId"],
        });
      }
      if (!val.description) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "description required for add",
          path: ["description"],
        });
      }
    } else if (val.kind === "modify" || val.kind === "remove") {
      if (!val.workItemId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${val.kind} lines must reference an existing work item`,
          path: ["workItemId"],
        });
      }
    }
    // Money pair on the unit price (add or modify with a new price).
    const hasAmt = val.unitPriceAmount != null;
    const hasCur = val.unitPriceCurrency != null;
    if (hasAmt !== hasCur) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unit price amount and currency must be set together",
        path: ["unitPriceAmount"],
      });
    }
  });
export type ChangeOrderLineInput = z.infer<typeof changeOrderLineInputSchema>;

export const changeOrderCreateInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(10000).optional(),
  totalDeltaCurrency: currencyCode,
  lines: z
    .array(changeOrderLineInputSchema)
    .min(1, "Add at least one line")
    .max(200),
  notes: z.string().trim().max(10000).optional(),
});
export type ChangeOrderCreateInput = z.infer<
  typeof changeOrderCreateInputSchema
>;

export const changeOrderPatchInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10000).nullable().optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
    decidedBy: z.string().trim().max(200).nullable().optional(),
  }),
});
export type ChangeOrderPatchInput = z.infer<typeof changeOrderPatchInputSchema>;

export const changeOrderListInputSchema = z.object({
  projectId: z.string().uuid(),
  status: changeOrderStatusSchema.optional(),
});
export type ChangeOrderListInput = z.infer<typeof changeOrderListInputSchema>;

export const changeOrderIdInputSchema = z.object({ id: z.string().uuid() });
export type ChangeOrderIdInput = z.infer<typeof changeOrderIdInputSchema>;

export const changeOrderTransitionInputSchema = z.object({
  id: z.string().uuid(),
  to: changeOrderStatusSchema,
  at: isoDate.optional(),
  /** Free-form name of who signed off — stamped on approve/reject. */
  decidedBy: z.string().trim().max(200).optional(),
});
export type ChangeOrderTransitionInput = z.infer<
  typeof changeOrderTransitionInputSchema
>;
