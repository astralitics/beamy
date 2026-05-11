import {
  date,
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
 * assets — per-instance physical items installed on a project. The "what
 * fridge in the kitchen?" record. One row = one identifiable thing with
 * a manufacturer, model, and (usually) a serial number.
 *
 * Distinct from `materials` (which are per-batch — paint, tile, flooring
 * tracked by lot rather than instance).
 *
 * `photo_url` is a placeholder until the documents/storage layer lands at
 * M8. For now it's a plain text URL; later it becomes a FK to documents.
 *
 * Money pair (`purchase_price_amount`, `purchase_price_currency`) follows
 * D-17: both columns set or both null. Zod enforces at the boundary.
 */
export const assets = pgTable(
  "assets",
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
        "other",
      ],
    })
      .notNull()
      .default("other"),
    name: text("name").notNull(),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),
    installDate: date("install_date"),
    warrantyExpiresAt: date("warranty_expires_at"),
    purchasePriceAmount: numeric("purchase_price_amount", {
      precision: 14,
      scale: 2,
    }),
    purchasePriceCurrency: text("purchase_price_currency"),
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
    byProject: index("assets_by_project").on(table.projectId),
    byRoom: index("assets_by_room").on(table.roomId),
    byOrgCategory: index("assets_by_org_category").on(
      table.orgId,
      table.category,
    ),
  }),
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
