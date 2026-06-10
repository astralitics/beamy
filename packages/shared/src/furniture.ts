import { z } from "zod";

/**
 * Furniture = free-standing, moveable design piece (sofas, tables, lamps,
 * rugs, art). Distinct from `assets` (installed/fixed items like
 * appliances, HVAC, wired lighting fixtures).
 *
 * Rule of thumb: floor lamp → furniture; wall sconce → asset.
 */

export const furnitureCategorySchema = z.enum([
  // construction / interior design
  "seating",
  "tables",
  "storage",
  "beds",
  "lighting",
  "rugs",
  "art",
  "mirrors",
  "decor",
  // landscaping — site furnishings
  "planters",
  "outdoor_seating",
  "fire_features",
  "shade_structures",
  "outdoor_lighting",
  "other",
]);
export type FurnitureCategory = z.infer<typeof furnitureCategorySchema>;

export const FURNITURE_CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  seating: "Seating",
  tables: "Tables",
  storage: "Storage",
  beds: "Beds",
  lighting: "Lighting",
  rugs: "Rugs",
  art: "Art",
  mirrors: "Mirrors",
  decor: "Decor",
  planters: "Planters",
  outdoor_seating: "Outdoor seating",
  fire_features: "Fire features",
  shade_structures: "Shade structures",
  outdoor_lighting: "Outdoor lighting",
  other: "Other",
};

export const furnitureStatusSchema = z.enum([
  "planned",
  "selected",
  "ordered",
  "delivered",
  "placed",
  "returned",
  "retired",
]);
export type FurnitureStatus = z.infer<typeof furnitureStatusSchema>;

export const FURNITURE_STATUS_LABELS: Record<FurnitureStatus, string> = {
  planned: "Planned",
  selected: "Selected",
  ordered: "Ordered",
  delivered: "Delivered",
  placed: "Placed",
  returned: "Returned",
  retired: "Retired",
};

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const httpUrl = z.string().trim().url("must be a URL").max(2000);

export const furnitureCreateInputSchema = z
  .object({
    projectId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    category: furnitureCategorySchema.default("other"),
    status: furnitureStatusSchema.default("planned"),
    name: z.string().trim().min(1, "Name is required").max(200),
    quantity: z.number().int().positive().max(9999).default(1),
    manufacturer: z.string().trim().max(200).optional(),
    model: z.string().trim().max(200).optional(),
    dimensions: z.string().trim().max(200).optional(),
    material: z.string().trim().max(200).optional(),
    finish: z.string().trim().max(200).optional(),
    designer: z.string().trim().max(200).optional(),
    deliveryDate: isoDate.optional(),
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
export type FurnitureCreateInput = z.infer<typeof furnitureCreateInputSchema>;

export const furnitureUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    roomId: z.string().uuid().nullable().optional(),
    vendorId: z.string().uuid().nullable().optional(),
    category: furnitureCategorySchema.optional(),
    status: furnitureStatusSchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    quantity: z.number().int().positive().max(9999).optional(),
    manufacturer: z.string().trim().max(200).nullable().optional(),
    model: z.string().trim().max(200).nullable().optional(),
    dimensions: z.string().trim().max(200).nullable().optional(),
    material: z.string().trim().max(200).nullable().optional(),
    finish: z.string().trim().max(200).nullable().optional(),
    designer: z.string().trim().max(200).nullable().optional(),
    deliveryDate: isoDate.nullable().optional(),
    warrantyExpiresAt: isoDate.nullable().optional(),
    purchasePriceAmount: moneyAmount.nullable().optional(),
    purchasePriceCurrency: currencyCode.nullable().optional(),
    productUrl: httpUrl.nullable().optional(),
    photoUrl: httpUrl.nullable().optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
  }),
});
export type FurnitureUpdateInput = z.infer<typeof furnitureUpdateInputSchema>;

export const furnitureListInputSchema = z.object({
  projectId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  category: furnitureCategorySchema.optional(),
  status: furnitureStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type FurnitureListInput = z.infer<typeof furnitureListInputSchema>;

export const furnitureIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type FurnitureIdInput = z.infer<typeof furnitureIdInputSchema>;

// ────────────────────── furniture events ──────────────────────

export const furnitureEventTypeSchema = z.enum([
  "selected",
  "ordered",
  "delivered",
  "placed",
  "moved",
  "cleaned",
  "reupholstered",
  "repaired",
  "returned",
  "retired",
  "note",
]);
export type FurnitureEventType = z.infer<typeof furnitureEventTypeSchema>;

export const FURNITURE_EVENT_TYPE_LABELS: Record<FurnitureEventType, string> =
  {
    selected: "Selected",
    ordered: "Ordered",
    delivered: "Delivered",
    placed: "Placed",
    moved: "Moved",
    cleaned: "Cleaned",
    reupholstered: "Reupholstered",
    repaired: "Repaired",
    returned: "Returned",
    retired: "Retired",
    note: "Note",
  };

export const furnitureEventCreateInputSchema = z
  .object({
    furnitureId: z.string().uuid(),
    eventType: furnitureEventTypeSchema,
    occurredAt: isoDate,
    vendorId: z.string().uuid().optional(),
    costAmount: moneyAmount.optional(),
    costCurrency: currencyCode.optional(),
    summary: z.string().trim().min(1, "Summary is required").max(300),
    notes: z.string().trim().max(10000).optional(),
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
export type FurnitureEventCreateInput = z.infer<
  typeof furnitureEventCreateInputSchema
>;

export const furnitureEventListInputSchema = z.object({
  furnitureId: z.string().uuid(),
});
export type FurnitureEventListInput = z.infer<
  typeof furnitureEventListInputSchema
>;

export const furnitureEventIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type FurnitureEventIdInput = z.infer<
  typeof furnitureEventIdInputSchema
>;
