import { z } from "zod";

/**
 * bids — inbound subcontractor side. One row per vendor PDF.
 *
 * Designed around the Propuesta data shape: heterogeneous units
 * (ea / m² / ml / lote), open `flags` slugs ("validity-likely-
 * expired" / "freight-not-included" / etc.), and a hard
 * `ivaIncluded` bool because the math branch matters for the
 * dashboard money roll-up.
 */

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const bidStatusSchema = z.enum([
  "received",
  "comparing",
  // `accepted` = approved & work underway ("Ongoing"); `completed` =
  // work wrapped up. Payment is tracked separately on the linked bill.
  "accepted",
  "completed",
  "rejected",
  "expired",
]);
export type BidStatus = z.infer<typeof bidStatusSchema>;

export const BID_STATUS_LABELS: Record<BidStatus, string> = {
  received: "Received",
  comparing: "Comparing",
  accepted: "Ongoing",
  completed: "Completed",
  rejected: "Rejected",
  expired: "Expired",
};

/**
 * Open-ended slugs for bid flags. UI maps known ones to friendly
 * labels; unknown slugs render as kebab-case. `iva-included` /
 * `iva-not-included` are NOT here — `ivaIncluded` is a hard column.
 */
export const BID_FLAG_LABELS: Record<string, string> = {
  "validity-likely-expired": "Validity likely expired",
  "freight-not-included": "Freight not included",
  "deposit-required": "Deposit required",
  "missing-cotizacion-only-credentials": "Missing credentials (cotización only)",
};

const flagSlug = z.string().regex(/^[a-z0-9-]+$/, "kebab-case slug");

export const bidCreateInputSchema = z
  .object({
    projectId: z.string().uuid(),
    vendorId: z.string().uuid().optional(),
    packageId: z.string().uuid().optional(),
    trade: z.string().trim().max(80).optional(),
    bidNumber: z.string().trim().max(120).optional(),
    bidDate: isoDate.optional(),
    validUntil: isoDate.optional(),
    subtotalAmount: moneyAmount.optional(),
    ivaAmount: moneyAmount.optional(),
    totalAmount: moneyAmount.optional(),
    currency: currencyCode.optional(),
    ivaIncluded: z.boolean().default(false),
    status: bidStatusSchema.default("received"),
    decidedAt: isoDate.optional(),
    flags: z.array(flagSlug).max(20).default([]),
    notes: z.string().trim().max(10000).optional(),
  })
  .superRefine((val, ctx) => {
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
export type BidCreateInput = z.infer<typeof bidCreateInputSchema>;

export const bidPatchSchema = z
  .object({
    vendorId: z.string().uuid().nullable().optional(),
    packageId: z.string().uuid().nullable().optional(),
    trade: z.string().trim().max(80).nullable().optional(),
    bidNumber: z.string().trim().max(120).nullable().optional(),
    bidDate: isoDate.nullable().optional(),
    validUntil: isoDate.nullable().optional(),
    subtotalAmount: moneyAmount.nullable().optional(),
    ivaAmount: moneyAmount.nullable().optional(),
    totalAmount: moneyAmount.nullable().optional(),
    currency: currencyCode.nullable().optional(),
    ivaIncluded: z.boolean().optional(),
    status: bidStatusSchema.optional(),
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
  });
export type BidPatch = z.infer<typeof bidPatchSchema>;

export const bidUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: bidPatchSchema,
});
export type BidUpdateInput = z.infer<typeof bidUpdateInputSchema>;

/**
 * Save-as-new-version: snapshot bid `id` (header + its line items) into
 * a fresh version, applying an optional header `patch`, and retire the
 * source as read-only history. See bids.saveAsVersion.
 */
export const bidSaveAsVersionInputSchema = z.object({
  id: z.string().uuid(),
  patch: bidPatchSchema.optional(),
});
export type BidSaveAsVersionInput = z.infer<
  typeof bidSaveAsVersionInputSchema
>;

/** Approve / reject a quote — sets status + decidedAt, no side effects. */
export const bidDecideInputSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["accepted", "rejected"]),
});
export type BidDecideInput = z.infer<typeof bidDecideInputSchema>;

export const bidListInputSchema = z.object({
  projectId: z.string().uuid(),
  status: bidStatusSchema.optional(),
  vendorId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
});
export type BidListInput = z.infer<typeof bidListInputSchema>;

export const bidIdInputSchema = z.object({ id: z.string().uuid() });
export type BidIdInput = z.infer<typeof bidIdInputSchema>;

export const bidAwardInputSchema = z.object({ id: z.string().uuid() });
export type BidAwardInput = z.infer<typeof bidAwardInputSchema>;

// ────────────────────── bid packages ──────────────────────

/**
 * A bid_package groups competing bids for one piece of work. Status is
 * the package's own — distinct from each bid's status.
 */
export const bidPackageStatusSchema = z.enum([
  "open",
  "awarded",
  "cancelled",
]);
export type BidPackageStatus = z.infer<typeof bidPackageStatusSchema>;

export const BID_PACKAGE_STATUS_LABELS: Record<BidPackageStatus, string> = {
  open: "Open",
  awarded: "Awarded",
  cancelled: "Cancelled",
};

export const bidPackageCreateInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
  scope: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(10000).optional(),
});
export type BidPackageCreateInput = z.infer<typeof bidPackageCreateInputSchema>;

export const bidPackageUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    scope: z.string().trim().max(2000).nullable().optional(),
    status: bidPackageStatusSchema.optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
  }),
});
export type BidPackageUpdateInput = z.infer<typeof bidPackageUpdateInputSchema>;

export const bidPackageListInputSchema = z.object({
  projectId: z.string().uuid(),
  status: bidPackageStatusSchema.optional(),
});
export type BidPackageListInput = z.infer<typeof bidPackageListInputSchema>;

export const bidPackageIdInputSchema = z.object({ id: z.string().uuid() });
export type BidPackageIdInput = z.infer<typeof bidPackageIdInputSchema>;
