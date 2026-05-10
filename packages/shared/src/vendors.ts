import { z } from "zod";

/**
 * Vendor = a sub or supplier the firm pays. Distinct from `clients` (parties
 * the firm is paid by). Compliance docs (W9, COIs, licenses) are tracked as
 * a sub-entity (`vendor_compliance`) keyed off the vendor row, with
 * expiration dates that drive workflow #21 (compliance sweep).
 */

export const vendorStatusSchema = z.enum(["active", "archived"]);
export type VendorStatus = z.infer<typeof vendorStatusSchema>;

export const billingUnitSchema = z.enum([
  "hour",
  "day",
  "project",
  "retainer",
  "unit",
]);
export type BillingUnit = z.infer<typeof billingUnitSchema>;

/**
 * Suggested trade values shown in the UI dropdown. The DB column is plain
 * text — firms can use values outside this list without schema changes
 * (D-41 spirit applied to vendor trades). Keep alphabetized.
 */
export const SUGGESTED_TRADES = [
  "cabinetry",
  "carpentry",
  "cleaning",
  "concrete",
  "demolition",
  "drywall",
  "electrical",
  "excavation",
  "fire_protection",
  "flooring",
  "framing",
  "garage_door",
  "general_contractor",
  "glazing",
  "hvac",
  "insulation",
  "landscape",
  "masonry",
  "millwork",
  "painting",
  "plumbing",
  "roofing",
  "security",
  "siding",
  "solar",
  "tile",
  "windows_doors",
  "other",
] as const;

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");

export const vendorCreateInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    trade: z.string().trim().min(1, "Trade is required").max(60),
    primaryContact: z.string().trim().max(200).optional(),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    phone: z.string().trim().max(60).optional(),
    address: z.string().trim().max(500).optional(),
    defaultRateAmount: moneyAmount.optional(),
    defaultRateCurrency: currencyCode.optional(),
    billingUnit: billingUnitSchema.default("hour"),
    paymentTerms: z.string().trim().max(120).optional(),
    ein: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(5000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  })
  .superRefine((val, ctx) => {
    const hasAmount = val.defaultRateAmount !== undefined;
    const hasCurrency = val.defaultRateCurrency !== undefined;
    if (hasAmount !== hasCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "defaultRateAmount and defaultRateCurrency must be set together",
        path: ["defaultRateAmount"],
      });
    }
  });
export type VendorCreateInput = z.infer<typeof vendorCreateInputSchema>;

export const vendorUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    trade: z.string().trim().min(1).max(60).optional(),
    primaryContact: z.string().trim().max(200).optional(),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    phone: z.string().trim().max(60).optional(),
    address: z.string().trim().max(500).optional(),
    defaultRateAmount: moneyAmount.optional(),
    defaultRateCurrency: currencyCode.optional(),
    billingUnit: billingUnitSchema.optional(),
    paymentTerms: z.string().trim().max(120).optional(),
    ein: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(5000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  }),
});
export type VendorUpdateInput = z.infer<typeof vendorUpdateInputSchema>;

export const vendorListInputSchema = z.object({
  status: vendorStatusSchema.optional(),
  trade: z.string().trim().max(60).optional(),
  search: z.string().trim().max(200).optional(),
});
export type VendorListInput = z.infer<typeof vendorListInputSchema>;

export const vendorIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type VendorIdInput = z.infer<typeof vendorIdInputSchema>;

// ─────────────────── compliance ───────────────────

export const complianceDocTypeSchema = z.enum([
  "w9",
  "coi_general",
  "coi_workers_comp",
  "license",
  "business_license",
  "other",
]);
export type ComplianceDocType = z.infer<typeof complianceDocTypeSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const complianceCreateInputSchema = z
  .object({
    vendorId: z.string().uuid(),
    docType: complianceDocTypeSchema,
    effectiveFrom: isoDate.optional(),
    expiresAt: isoDate.optional(),
    coverageAmount: moneyAmount.optional(),
    coverageCurrency: currencyCode.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    const hasAmount = val.coverageAmount !== undefined;
    const hasCurrency = val.coverageCurrency !== undefined;
    if (hasAmount !== hasCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "coverageAmount and coverageCurrency must be set together",
        path: ["coverageAmount"],
      });
    }
  });
export type ComplianceCreateInput = z.infer<typeof complianceCreateInputSchema>;

export const complianceUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    docType: complianceDocTypeSchema.optional(),
    effectiveFrom: isoDate.optional(),
    expiresAt: isoDate.optional(),
    coverageAmount: moneyAmount.optional(),
    coverageCurrency: currencyCode.optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
});
export type ComplianceUpdateInput = z.infer<typeof complianceUpdateInputSchema>;

export const complianceIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type ComplianceIdInput = z.infer<typeof complianceIdInputSchema>;

export const complianceListInputSchema = z.object({
  vendorId: z.string().uuid(),
});
export type ComplianceListInput = z.infer<typeof complianceListInputSchema>;
