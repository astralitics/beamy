import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { projects, rooms } from "./projects";
import { vendors } from "./vendors";
import { bills } from "./bills";

/**
 * furniture — free-standing, moveable design pieces that ship through a
 * design-trade workflow (selection → approval → order → delivery). Distinct
 * from `assets`, which covers installed/fixed items (appliances, HVAC,
 * built-in cabinetry, plumbing fixtures, wired lighting).
 *
 * Rule of thumb: floor lamp → furniture; wall sconce → asset.
 *
 * `quantity` is meaningful here (a set of 6 dining chairs is one row, not
 * six). For pieces sold individually, qty defaults to 1.
 *
 * Status flow:
 *   planned    — on the program list, not yet specified
 *   selected   — chosen, awaiting client approval
 *   ordered    — POed to vendor, awaiting delivery
 *   delivered  — received but not yet placed
 *   placed     — in the room and live
 *   returned   — sent back; kept for recall
 *   retired    — past useful life or removed; kept for recall
 */
export const furniture = pgTable(
  "furniture",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    category: text("category", {
      enum: [
        "seating",
        "tables",
        "storage",
        "beds",
        "lighting",
        "rugs",
        "art",
        "mirrors",
        "decor",
        // landscaping — site furnishings (see @beamy/shared)
        "planters",
        "outdoor_seating",
        "fire_features",
        "shade_structures",
        "outdoor_lighting",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    status: text("status", {
      enum: [
        "planned",
        "selected",
        "ordered",
        "delivered",
        "placed",
        "returned",
        "retired",
      ],
    })
      .notNull()
      .default("planned"),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    manufacturer: text("manufacturer"),
    model: text("model"),
    /** Free-form dimensions; e.g. `84"W × 36"D × 32"H`. */
    dimensions: text("dimensions"),
    /** Primary material — linen, walnut, brass, etc. Free text in v1. */
    material: text("material"),
    /** Finish or color — matte black, white oak, polished nickel. */
    finish: text("finish"),
    /** Attributable designer or maker name. */
    designer: text("designer"),
    deliveryDate: date("delivery_date"),
    warrantyExpiresAt: date("warranty_expires_at"),
    purchasePriceAmount: numeric("purchase_price_amount", {
      precision: 14,
      scale: 2,
    }),
    purchasePriceCurrency: text("purchase_price_currency"),
    productUrl: text("product_url"),
    photoUrl: text("photo_url"),
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
    byProject: index("furniture_by_project").on(table.projectId),
    byRoom: index("furniture_by_room").on(table.roomId),
    byOrgCategory: index("furniture_by_org_category").on(
      table.orgId,
      table.category,
    ),
    byOrgStatus: index("furniture_by_org_status").on(
      table.orgId,
      table.status,
    ),
  }),
);

export type Furniture = typeof furniture.$inferSelect;
export type NewFurniture = typeof furniture.$inferInsert;

/**
 * furniture_events — append-only history for a furniture piece. Same
 * pattern as asset_events: append-only timeline, optional cost, optional
 * vendor, optional link to a `bills` row when the cost was charged to a
 * company account.
 *
 * Distinct verbs from asset events (delivered vs installed, reupholstered
 * vs repaired) — design pieces have their own lifecycle.
 */
export const furnitureEvents = pgTable(
  "furniture_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    furnitureId: uuid("furniture_id")
      .notNull()
      .references(() => furniture.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: [
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
      ],
    }).notNull(),
    occurredAt: date("occurred_at").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    costAmount: numeric("cost_amount", { precision: 14, scale: 2 }),
    costCurrency: text("cost_currency"),
    billId: uuid("bill_id").references(() => bills.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (table) => ({
    byFurniture: index("furniture_events_by_furniture").on(
      table.furnitureId,
      table.occurredAt,
    ),
    byOrg: index("furniture_events_by_org").on(table.orgId),
  }),
);

export type FurnitureEvent = typeof furnitureEvents.$inferSelect;
export type NewFurnitureEvent = typeof furnitureEvents.$inferInsert;
