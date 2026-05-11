import { z } from "zod";

/**
 * Bills — money we owe vendors. State machine: open → paid (void at any
 * time). "Overdue" is computed at display time, not stored.
 */

export const billStatusSchema = z.enum(["open", "paid", "void"]);
export type BillStatus = z.infer<typeof billStatusSchema>;

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  open: "Open",
  paid: "Paid",
  void: "Void",
};

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const billCreateInputSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
  billNumber: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  amount: moneyAmount,
  currency: currencyCode,
  issuedAt: isoDate.optional(),
  dueAt: isoDate.optional(),
  paidAt: isoDate.optional(),
  status: billStatusSchema.default("open"),
  notes: z.string().trim().max(10000).optional(),
  externalRef: z.string().trim().max(200).optional(),
});
export type BillCreateInput = z.infer<typeof billCreateInputSchema>;

export const billUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    vendorId: z.string().uuid().nullable().optional(),
    billNumber: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    amount: moneyAmount.optional(),
    currency: currencyCode.optional(),
    issuedAt: isoDate.nullable().optional(),
    dueAt: isoDate.nullable().optional(),
    paidAt: isoDate.nullable().optional(),
    status: billStatusSchema.optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
    externalRef: z.string().trim().max(200).nullable().optional(),
  }),
});
export type BillUpdateInput = z.infer<typeof billUpdateInputSchema>;

export const billListInputSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
  status: billStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type BillListInput = z.infer<typeof billListInputSchema>;

export const billIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type BillIdInput = z.infer<typeof billIdInputSchema>;

/**
 * Quick-action: mark a bill paid (sets status + paid_at in one op).
 */
export const billMarkPaidInputSchema = z.object({
  id: z.string().uuid(),
  paidAt: isoDate.optional(),
});
export type BillMarkPaidInput = z.infer<typeof billMarkPaidInputSchema>;

/**
 * Compute "overdue" — bill is open AND past due. Pure function so both
 * server and client can use it.
 */
export function isBillOverdue(
  status: BillStatus,
  dueAt: string | null,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return status === "open" && dueAt !== null && dueAt < today;
}
