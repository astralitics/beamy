import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { projects, rooms } from "./projects";
import { vendors } from "./vendors";

/**
 * materials — per-batch identity. Paint, tile, flooring, stone, grout —
 * the things tracked by *lot* rather than by individual instance. Each
 * row captures a single specified batch: product + color + sku + lot, the
 * quantity installed, and the attic stock left over for future repairs.
 *
 * Distinct from `assets` (which are per-instance — fridges, faucets,
 * specific identifiable units with serial numbers).
 *
 * The lot number is the killer recall field. Two years from now when a
 * tile chips, this row tells you the exact product code and lot to match.
 *
 * Coverage is intentionally free-text in v1. A proper room × surface
 * coverage matrix (`material_applications`) is a follow-up.
 */
export const materials = pgTable(
  "materials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * Primary location of the batch — informational. Most batches span
     * multiple rooms; this just points at the one to look in first when
     * recall hits. (Full coverage matrix is a later table.)
     */
    roomId: uuid("room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    category: text("category", {
      enum: [
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
      ],
    })
      .notNull()
      .default("other"),
    name: text("name").notNull(),
    manufacturer: text("manufacturer"),
    productCode: text("product_code"),
    colorName: text("color_name"),
    lotNumber: text("lot_number"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }),
    quantityUnit: text("quantity_unit", {
      enum: [
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
      ],
    }),
    atticStockQuantity: numeric("attic_stock_quantity", {
      precision: 14,
      scale: 3,
    }),
    atticStockLocation: text("attic_stock_location"),
    coverageNotes: text("coverage_notes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => ({
    byProject: index("materials_by_project").on(table.projectId),
    byRoom: index("materials_by_room").on(table.roomId),
    byOrgCategory: index("materials_by_org_category").on(
      table.orgId,
      table.category,
    ),
  }),
);

export type Material = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;
