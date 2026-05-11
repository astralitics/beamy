import { z } from "zod";

/**
 * Invoices — money clients owe us. State machine:
 *   draft → sent → paid  (void at any time).
 * "Overdue" computed at display time from (status=sent && due_at < today).
 */

export const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "void"]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const invoiceCreateInputSchema = z.object({
  projectId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  invoiceNumber: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  amount: moneyAmount,
  currency: currencyCode,
  issuedAt: isoDate.optional(),
  sentAt: isoDate.optional(),
  dueAt: isoDate.optional(),
  paidAt: isoDate.optional(),
  status: invoiceStatusSchema.default("draft"),
  notes: z.string().trim().max(10000).optional(),
  externalRef: z.string().trim().max(200).optional(),
});
export type InvoiceCreateInput = z.infer<typeof invoiceCreateInputSchema>;

export const invoiceUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    clientId: z.string().uuid().nullable().optional(),
    invoiceNumber: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    amount: moneyAmount.optional(),
    currency: currencyCode.optional(),
    issuedAt: isoDate.nullable().optional(),
    sentAt: isoDate.nullable().optional(),
    dueAt: isoDate.nullable().optional(),
    paidAt: isoDate.nullable().optional(),
    status: invoiceStatusSchema.optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
    externalRef: z.string().trim().max(200).nullable().optional(),
  }),
});
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateInputSchema>;

export const invoiceListInputSchema = z.object({
  projectId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  status: invoiceStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type InvoiceListInput = z.infer<typeof invoiceListInputSchema>;

export const invoiceIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type InvoiceIdInput = z.infer<typeof invoiceIdInputSchema>;

/**
 * Quick-action: mark invoice sent (status + sent_at).
 */
export const invoiceMarkSentInputSchema = z.object({
  id: z.string().uuid(),
  sentAt: isoDate.optional(),
});
export type InvoiceMarkSentInput = z.infer<typeof invoiceMarkSentInputSchema>;

/**
 * Quick-action: mark invoice paid (status + paid_at).
 */
export const invoiceMarkPaidInputSchema = z.object({
  id: z.string().uuid(),
  paidAt: isoDate.optional(),
});
export type InvoiceMarkPaidInput = z.infer<typeof invoiceMarkPaidInputSchema>;

export function isInvoiceOverdue(
  status: InvoiceStatus,
  dueAt: string | null,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return status === "sent" && dueAt !== null && dueAt < today;
}
