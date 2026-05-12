import { sql } from "drizzle-orm";
import {
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { projects, rooms } from "./projects";
import { vendors } from "./vendors";

/**
 * proposals — vendor bid container. One row per vendor's quote PDF
 * (or per quote revision). Carries the bid totals + procurement state
 * + the flag bag that surfaces "iva-not-included" / "validity-likely-
 * expired" kind of metadata cleanly.
 *
 * The source PDF, when uploaded, becomes a `documents` row with its
 * `proposal_id` set back here (added in the same migration). That FK
 * is bidirectional-discoverable via the documents index.
 *
 * Money pair (subtotal/iva/total share one `currency`). The `flags`
 * array is open-ended on purpose — slugs like "iva-not-included" are
 * checked in product code, not in the DB.
 */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Free-form trade tag — "carpintería", "electricidad", "tile". */
    trade: text("trade"),
    /** Vendor's quote number from the PDF. */
    quoteNumber: text("quote_number"),
    quoteDate: date("quote_date"),
    validUntil: date("valid_until"),
    subtotalAmount: numeric("subtotal_amount", { precision: 14, scale: 2 }),
    ivaAmount: numeric("iva_amount", { precision: 14, scale: 2 }),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    /** Shared currency for subtotal / iva / total. */
    currency: text("currency"),
    status: text("status", {
      enum: ["received", "comparing", "accepted", "rejected", "expired"],
    })
      .notNull()
      .default("received"),
    decidedAt: date("decided_at"),
    /**
     * Free-form procurement flags. Common slugs include
     * "iva-not-included", "validity-likely-expired", "freight-not-
     * included", "deposit-required". Product code interprets.
     */
    flags: text("flags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
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
    byProject: index("proposals_by_project").on(table.projectId),
    byVendor: index("proposals_by_vendor").on(table.vendorId),
    byOrgStatus: index("proposals_by_org_status").on(
      table.orgId,
      table.status,
    ),
  }),
);

export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;

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
 * `proposal_id` is nullable because work_items can be drafted by the
 * firm before any vendor quotes (a planning skeleton); once a
 * proposal lands they get linked back. `vendor_id` is nullable until
 * the proposal is accepted — keeps the bid-leveling story open
 * without forcing fake assignments.
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
    proposalId: uuid("proposal_id").references(() => proposals.id, {
      onDelete: "set null",
    }),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Free-form trade — mirrors proposals.trade. */
    trade: text("trade"),
    /**
     * Vendor's internal code (V01, S1-01) or our own. Nullable; not
     * auto-assigned in v1 — the importer populates it from source
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
    byProposal: index("work_items_by_proposal").on(table.proposalId),
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
