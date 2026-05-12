import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bids } from "./bids";
import { orgs } from "./orgs";
import { projects, rooms } from "./projects";
import { vendors } from "./vendors";

/**
 * work_items — the unit of execution. One row per Propuesta-style
 * line item: a description, a quantity, a unit, a unit price, a
 * status, and a planned + actual schedule window.
 *
 * Multi-room work attaches via `work_item_rooms` (M2M). A single
 * `room_id` field would force splitting "cambio de empaques de
 * policarbonato en baños 1/2/3" into three rows — wrong shape for
 * how vendors actually price the work.
 *
 * `bid_id` is nullable because work_items can be drafted by the firm
 * before any vendor quotes (a planning skeleton); once a bid lands
 * they get linked back. `vendor_id` is nullable until the bid is
 * accepted — keeps the bid-leveling story open without forcing fake
 * assignments.
 *
 * Money pair: (`unitPriceAmount`, `unitPriceCurrency`) and
 * (`totalAmount`, `totalCurrency`). `total` is stored, not derived,
 * because vendors sometimes round irregularly and we want to
 * preserve their math verbatim. UI shows a warning if the two
 * disagree by more than rounding noise.
 */
export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    bidId: uuid("bid_id").references(() => bids.id, {
      onDelete: "set null",
    }),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Free-form trade — mirrors bids.trade. */
    trade: text("trade"),
    /**
     * Vendor's internal code (V01, S1-01) or our own. Nullable; not
     * auto-assigned in v1 — the seed script populates it from source
     * data, manual rows leave it null until needed.
     */
    ref: text("ref"),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 14, scale: 4 }),
    /** Free-form unit string — "ea", "m2", "ml", "lote", "yd". */
    unit: text("unit"),
    unitPriceAmount: numeric("unit_price_amount", { precision: 14, scale: 2 }),
    unitPriceCurrency: text("unit_price_currency"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    totalCurrency: text("total_currency"),
    /**
     * Client-facing price overrides. Populated when this work item
     * rolls into a client proposal — either via the generator's
     * project-level markup default, or per-line override.
     * `clientUnitPrice` set takes precedence over markup math.
     * `clientTotal` is the snapshot at last proposal generation.
     */
    clientMarkupPct: numeric("client_markup_pct", { precision: 6, scale: 2 }),
    clientUnitPrice: numeric("client_unit_price", { precision: 14, scale: 2 }),
    clientTotal: numeric("client_total", { precision: 14, scale: 2 }),
    clientCurrency: text("client_currency"),
    status: text("status", {
      enum: [
        "specified",
        "approved",
        "scheduled",
        "in_progress",
        "done",
        "accepted",
        "cancelled",
      ],
    })
      .notNull()
      .default("specified"),
    plannedStart: date("planned_start"),
    plannedEnd: date("planned_end"),
    actualStart: date("actual_start"),
    actualEnd: date("actual_end"),
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
    byProject: index("work_items_by_project").on(table.projectId),
    byBid: index("work_items_by_bid").on(table.bidId),
    byVendor: index("work_items_by_vendor").on(table.vendorId),
    byOrgStatus: index("work_items_by_org_status").on(
      table.orgId,
      table.status,
    ),
    byOrgPlannedEnd: index("work_items_by_org_planned_end").on(
      table.orgId,
      table.plannedEnd,
    ),
  }),
);

export type WorkItem = typeof workItems.$inferSelect;
export type NewWorkItem = typeof workItems.$inferInsert;

/**
 * work_item_rooms — M2M between work_items and rooms. A line item
 * applied to "bano-1, bano-2, bano-3" lands as three rows here. The
 * "rooms" field on a work_item read returns the joined room rows.
 */
export const workItemRooms = pgTable(
  "work_item_rooms",
  {
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workItemId, table.roomId] }),
    byRoom: index("work_item_rooms_by_room").on(table.roomId),
  }),
);

export type WorkItemRoom = typeof workItemRooms.$inferSelect;
export type NewWorkItemRoom = typeof workItemRooms.$inferInsert;

/**
 * work_item_dependencies — directed edges between work_items.
 * `work_item_id` depends on `depends_on_id`.
 *
 * `kind` semantics:
 *   - finish_to_start (default): predecessor must finish before
 *     this one starts. The textbook construction dep.
 *   - start_to_start: predecessor must start before this one starts.
 *   - finish_to_finish: predecessor must finish before this one
 *     finishes. (Rare; useful for concurrent-but-coordinated work.)
 *
 * One edge per ordered pair — Postgres uniqueness on
 * (work_item_id, depends_on_id). Multiple kinds for the same pair
 * would be contradictory, not useful. To change kind, delete +
 * re-add.
 *
 * Self-references prevented by a CHECK constraint. Cycle detection
 * (A→B→A and longer) happens at insert time in the router via a
 * recursive CTE — the DB doesn't enforce it because graph traversal
 * in CHECK constraints is impractical.
 */
export const workItemDependencies = pgTable(
  "work_item_dependencies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["finish_to_start", "start_to_start", "finish_to_finish"],
    })
      .notNull()
      .default("finish_to_start"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (table) => ({
    byWorkItem: index("work_item_dependencies_by_work_item").on(
      table.workItemId,
    ),
    byDependsOn: index("work_item_dependencies_by_depends_on").on(
      table.dependsOnId,
    ),
    uniqPair: uniqueIndex("work_item_dependencies_unique_pair").on(
      table.workItemId,
      table.dependsOnId,
    ),
    noSelfRef: check(
      "work_item_dependencies_no_self_ref",
      sql`${table.workItemId} <> ${table.dependsOnId}`,
    ),
  }),
);

export type WorkItemDependency = typeof workItemDependencies.$inferSelect;
export type NewWorkItemDependency = typeof workItemDependencies.$inferInsert;
