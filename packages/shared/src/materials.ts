import { z } from "zod";

/**
 * Material = a per-batch identity. Paint, tile, flooring, stone, grout —
 * the things tracked by *lot* rather than by individual instance. The
 * killer recall field is `lotNumber`: two years from now when a tile
 * chips, this row tells you the exact product + lot to match.
 *
 * Distinct from assets (which are per-instance with serial numbers).
 */

export const materialCategorySchema = z.enum([
  "paint",
  "tile",
  "flooring",
  "stone",
  "wood",
  "drywall",
  "insulation",
  "cabinetry",
  "countertop",
  "grout",
  "sealant",
  "adhesive",
  "fastener",
  "other",
]);
export type MaterialCategory = z.infer<typeof materialCategorySchema>;

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  paint: "Paint",
  tile: "Tile",
  flooring: "Flooring",
  stone: "Stone",
  wood: "Wood",
  drywall: "Drywall",
  insulation: "Insulation",
  cabinetry: "Cabinetry",
  countertop: "Countertop",
  grout: "Grout",
  sealant: "Sealant",
  adhesive: "Adhesive",
  fastener: "Fastener",
  other: "Other",
};

export const materialUnitSchema = z.enum([
  "gallon",
  "quart",
  "sq_ft",
  "sq_m",
  "linear_ft",
  "linear_m",
  "each",
  "lb",
  "kg",
  "box",
  "pallet",
  "other",
]);
export type MaterialUnit = z.infer<typeof materialUnitSchema>;

export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = {
  gallon: "gal",
  quart: "qt",
  sq_ft: "sq ft",
  sq_m: "sq m",
  linear_ft: "lin ft",
  linear_m: "lin m",
  each: "ea",
  lb: "lb",
  kg: "kg",
  box: "box",
  pallet: "pallet",
  other: "unit",
};

const quantity = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, "decimal with up to 3 decimal places");

export const materialCreateInputSchema = z
  .object({
    projectId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    category: materialCategorySchema.default("other"),
    name: z.string().trim().min(1, "Name is required").max(200),
    manufacturer: z.string().trim().max(200).optional(),
    productCode: z.string().trim().max(200).optional(),
    colorName: z.string().trim().max(200).optional(),
    lotNumber: z.string().trim().max(200).optional(),
    quantity: quantity.optional(),
    quantityUnit: materialUnitSchema.optional(),
    atticStockQuantity: quantity.optional(),
    atticStockLocation: z.string().trim().max(500).optional(),
    coverageNotes: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(10000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.quantity !== undefined && val.quantityUnit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "quantityUnit is required when quantity is set",
        path: ["quantityUnit"],
      });
    }
    if (
      val.atticStockQuantity !== undefined &&
      val.quantityUnit === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "quantityUnit is required when atticStockQuantity is set",
        path: ["quantityUnit"],
      });
    }
  });
export type MaterialCreateInput = z.infer<typeof materialCreateInputSchema>;

export const materialUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    roomId: z.string().uuid().nullable().optional(),
    vendorId: z.string().uuid().nullable().optional(),
    category: materialCategorySchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    manufacturer: z.string().trim().max(200).nullable().optional(),
    productCode: z.string().trim().max(200).nullable().optional(),
    colorName: z.string().trim().max(200).nullable().optional(),
    lotNumber: z.string().trim().max(200).nullable().optional(),
    quantity: quantity.nullable().optional(),
    quantityUnit: materialUnitSchema.nullable().optional(),
    atticStockQuantity: quantity.nullable().optional(),
    atticStockLocation: z.string().trim().max(500).nullable().optional(),
    coverageNotes: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
  }),
});
export type MaterialUpdateInput = z.infer<typeof materialUpdateInputSchema>;

export const materialListInputSchema = z.object({
  projectId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  category: materialCategorySchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type MaterialListInput = z.infer<typeof materialListInputSchema>;

export const materialIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type MaterialIdInput = z.infer<typeof materialIdInputSchema>;
