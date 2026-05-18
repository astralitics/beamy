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
import { bills } from "./bills";

/**
 * assets — per-instance physical items installed on a project. One row =
 * one identifiable thing with a manufacturer, model, and (usually) a
 * serial number. Distinct from `materials` (per-batch — paint, tile,
 * flooring tracked by lot rather than instance).
 *
 * `status` is the lifecycle of THIS physical instance on this project:
 *   - planned     — committed to install but not yet placed
 *   - installed   — placed and live in the building (default once installDate is set)
 *   - under_repair — currently being serviced
 *   - removed     — taken out (could be returned/disposed); kept for recall
 *   - retired     — past useful life; kept for recall
 *
 * `productUrl` is the manufacturer / vendor catalog URL so a future owner
 * can pull up specs and reorder filters/parts.
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
    status: text("status", {
      enum: ["planned", "installed", "under_repair", "removed", "retired"],
    })
      .notNull()
      .default("installed"),
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
    byProject: index("assets_by_project").on(table.projectId),
    byRoom: index("assets_by_room").on(table.roomId),
    byOrgCategory: index("assets_by_org_category").on(
      table.orgId,
      table.category,
    ),
    byOrgStatus: index("assets_by_org_status").on(table.orgId, table.status),
  }),
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

/**
 * asset_events — append-only history for an asset. Captures user-facing
 * events you'd want to see in the asset's "life so far" timeline:
 * installation, service calls, repairs, inspections, photo additions,
 * status changes. Distinct from `audit_log` (which records every CRUD
 * write at the row level and is not user-facing).
 *
 * Events are immutable from the UI in v1: you add new ones rather than
 * editing old ones. A delete affordance exists for slip-ups but is rare.
 *
 * `eventType` is intentionally broad-but-bounded — a closed enum keeps
 * the timeline rendering simple (icon + verb) without devolving into
 * free-text notes only.
 */
export const assetEvents = pgTable(
  "asset_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: [
        "installed",
        "serviced",
        "repaired",
        "inspected",
        "warranty_claimed",
        "removed",
        "reinstalled",
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
    /**
     * If the cost was charged to a company account and tracked in the
     * project ledger, this points at the corresponding `bills` row
     * (vendorId=null, status=paid). Lets the asset timeline and the
     * project Money tab stay consistent without dual entry.
     */
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
    byAsset: index("asset_events_by_asset").on(table.assetId, table.occurredAt),
    byOrg: index("asset_events_by_org").on(table.orgId),
  }),
);

export type AssetEvent = typeof assetEvents.$inferSelect;
export type NewAssetEvent = typeof assetEvents.$inferInsert;
