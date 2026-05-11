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
 * spec_items — the planning + procurement layer. Each row captures
 * something the client is committing to install: a fridge, a tile, a
 * paint color. The row owns the pre-install lifecycle (specified →
 * approved → ordered → received → installed) and the price math
 * (trade catalog × markup → client price).
 *
 * Distinct from `assets` and `materials`:
 *   - spec_items = planning + procurement (pre-install audit trail)
 *   - assets = per-instance recall record (post-install, serial-tracked)
 *   - materials = per-batch recall record (post-install, lot-tracked)
 *
 * Once a spec is installed, the corresponding asset or material row is
 * created (manually for v1; via workflow in M5). The spec_item is kept
 * — it's the procurement history for "why did we pick this?".
 *
 * `specType` declares which downstream table the spec is destined for.
 * The actual handoff is manual in v1; this column is the hint.
 *
 * Money pairs follow D-17: both columns set or both null. Zod enforces.
 */
export const specItems = pgTable(
  "spec_items",
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
    /**
     * Tells the dashboard which downstream entity this spec resolves
     * into when installed. UI hides material-specific fields when
     * `asset`, asset-specific when `material`.
     */
    specType: text("spec_type", {
      enum: ["asset", "material"],
    })
      .notNull()
      .default("asset"),
    category: text("category"),
    name: text("name").notNull(),
    description: text("description"),
    state: text("state", {
      enum: [
        "specified",
        "client_approved",
        "ordered",
        "received",
        "installed",
        "cancelled",
      ],
    })
      .notNull()
      .default("specified"),
    catalogPriceAmount: numeric("catalog_price_amount", {
      precision: 14,
      scale: 2,
    }),
    catalogPriceCurrency: text("catalog_price_currency"),
    clientPriceAmount: numeric("client_price_amount", {
      precision: 14,
      scale: 2,
    }),
    clientPriceCurrency: text("client_price_currency"),
    approvedAt: date("approved_at"),
    orderedAt: date("ordered_at"),
    receivedAt: date("received_at"),
    installedAt: date("installed_at"),
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
    byProject: index("spec_items_by_project").on(table.projectId),
    byRoom: index("spec_items_by_room").on(table.roomId),
    byOrgState: index("spec_items_by_org_state").on(table.orgId, table.state),
  }),
);

export type SpecItem = typeof specItems.$inferSelect;
export type NewSpecItem = typeof specItems.$inferInsert;
