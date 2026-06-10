import { z } from "zod";

/**
 * Asset = a per-instance physical item installed on a project. The
 * "what fridge in the kitchen?" record. One row per identifiable thing
 * with a manufacturer + model + (usually) a serial number.
 *
 * Distinct from materials (per-batch — paint, tile, flooring with lot
 * numbers).
 */

export const assetCategorySchema = z.enum([
  // construction
  "appliance",
  "fixture",
  "equipment",
  "hvac",
  "plumbing",
  "electrical",
  "lighting",
  "smart_home",
  "hardware",
  "structural",
  // landscaping — site installations
  "irrigation",
  "drainage",
  "hardscape",
  "water_feature",
  "pump",
  "other",
]);
export type AssetCategory = z.infer<typeof assetCategorySchema>;

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  appliance: "Appliance",
  fixture: "Fixture",
  equipment: "Equipment",
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  lighting: "Lighting",
  smart_home: "Smart home",
  hardware: "Hardware",
  structural: "Structural",
  irrigation: "Irrigation",
  drainage: "Drainage",
  hardscape: "Hardscape",
  water_feature: "Water feature",
  pump: "Pump",
  other: "Other",
};

export const assetStatusSchema = z.enum([
  "planned",
  "installed",
  "under_repair",
  "removed",
  "retired",
]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  planned: "Planned",
  installed: "Installed",
  under_repair: "Under repair",
  removed: "Removed",
  retired: "Retired",
};

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const httpUrl = z
  .string()
  .trim()
  .url("must be a URL")
  .max(2000);

export const assetCreateInputSchema = z
  .object({
    projectId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    category: assetCategorySchema.default("other"),
    status: assetStatusSchema.default("installed"),
    name: z.string().trim().min(1, "Name is required").max(200),
    manufacturer: z.string().trim().max(200).optional(),
    model: z.string().trim().max(200).optional(),
    serialNumber: z.string().trim().max(200).optional(),
    installDate: isoDate.optional(),
    warrantyExpiresAt: isoDate.optional(),
    purchasePriceAmount: moneyAmount.optional(),
    purchasePriceCurrency: currencyCode.optional(),
    productUrl: httpUrl.optional(),
    photoUrl: httpUrl.optional(),
    notes: z.string().trim().max(10000).optional(),
  })
  .superRefine((val, ctx) => {
    const hasAmount = val.purchasePriceAmount !== undefined;
    const hasCurrency = val.purchasePriceCurrency !== undefined;
    if (hasAmount !== hasCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "purchasePriceAmount and purchasePriceCurrency must be set together",
        path: ["purchasePriceAmount"],
      });
    }
  });
export type AssetCreateInput = z.infer<typeof assetCreateInputSchema>;

export const assetUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    roomId: z.string().uuid().nullable().optional(),
    vendorId: z.string().uuid().nullable().optional(),
    category: assetCategorySchema.optional(),
    status: assetStatusSchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    manufacturer: z.string().trim().max(200).nullable().optional(),
    model: z.string().trim().max(200).nullable().optional(),
    serialNumber: z.string().trim().max(200).nullable().optional(),
    installDate: isoDate.nullable().optional(),
    warrantyExpiresAt: isoDate.nullable().optional(),
    purchasePriceAmount: moneyAmount.nullable().optional(),
    purchasePriceCurrency: currencyCode.nullable().optional(),
    productUrl: httpUrl.nullable().optional(),
    photoUrl: httpUrl.nullable().optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
  }),
});
export type AssetUpdateInput = z.infer<typeof assetUpdateInputSchema>;

export const assetListInputSchema = z.object({
  projectId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  category: assetCategorySchema.optional(),
  status: assetStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type AssetListInput = z.infer<typeof assetListInputSchema>;

export const assetIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type AssetIdInput = z.infer<typeof assetIdInputSchema>;

// ────────────────────── asset events ──────────────────────

export const assetEventTypeSchema = z.enum([
  "installed",
  "serviced",
  "repaired",
  "inspected",
  "warranty_claimed",
  "removed",
  "reinstalled",
  "retired",
  "note",
]);
export type AssetEventType = z.infer<typeof assetEventTypeSchema>;

export const ASSET_EVENT_TYPE_LABELS: Record<AssetEventType, string> = {
  installed: "Installed",
  serviced: "Serviced",
  repaired: "Repaired",
  inspected: "Inspected",
  warranty_claimed: "Warranty claim",
  removed: "Removed",
  reinstalled: "Reinstalled",
  retired: "Retired",
  note: "Note",
};

export const assetEventCreateInputSchema = z
  .object({
    assetId: z.string().uuid(),
    eventType: assetEventTypeSchema,
    occurredAt: isoDate,
    vendorId: z.string().uuid().optional(),
    costAmount: moneyAmount.optional(),
    costCurrency: currencyCode.optional(),
    summary: z.string().trim().min(1, "Summary is required").max(300),
    notes: z.string().trim().max(10000).optional(),
    /**
     * Track this cost in the project finance ledger. When true and a cost
     * is supplied, the router creates a paid `bills` row (vendorId=null,
     * status=paid, paidAt=occurredAt) and links it back via `bill_id`.
     */
    trackInFinance: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const hasAmount = val.costAmount !== undefined;
    const hasCurrency = val.costCurrency !== undefined;
    if (hasAmount !== hasCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "costAmount and costCurrency must be set together",
        path: ["costAmount"],
      });
    }
    if (val.trackInFinance && !hasAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Can't track in finance without a cost",
        path: ["trackInFinance"],
      });
    }
  });
export type AssetEventCreateInput = z.infer<typeof assetEventCreateInputSchema>;

export const assetEventListInputSchema = z.object({
  assetId: z.string().uuid(),
});
export type AssetEventListInput = z.infer<typeof assetEventListInputSchema>;

export const assetEventIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type AssetEventIdInput = z.infer<typeof assetEventIdInputSchema>;
