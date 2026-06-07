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
import { projects } from "./projects";
import { vendors } from "./vendors";
import { bids } from "./bids";

/**
 * bills — money we owe vendors. One row per vendor invoice we receive.
 *
 * v1 scope (per D-22 — partial completion is fine):
 *   - Money pair (amount, currency) per D-17.
 *   - `paid_at` records payment without a separate payments table; a
 *     proper line-item ledger lands at M3-proper.
 *   - "Overdue" is a UI concept computed from (status=open && due_at <
 *     today) — not a stored status. Cleaner than transitioning rows on
 *     a cron.
 *   - QuickBooks sync is deferred; `external_ref` reserved for it (M4).
 *   - `bid_id` links the payable back to the accepted quote that
 *     spawned it. Approving a bid auto-creates an open bill here (one
 *     per bid — idempotent); ON DELETE SET NULL so deleting the quote
 *     leaves the payable standing as a manual entry.
 */
export const bills = pgTable(
  "bills",
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
    /** The accepted quote this payable was created from, if any. */
    bidId: uuid("bid_id").references(() => bids.id, {
      onDelete: "set null",
    }),
    /** Vendor's bill / invoice number on the PDF they sent. */
    billNumber: text("bill_number"),
    description: text("description"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    issuedAt: date("issued_at"),
    dueAt: date("due_at"),
    paidAt: date("paid_at"),
    status: text("status", {
      enum: ["open", "paid", "void"],
    })
      .notNull()
      .default("open"),
    notes: text("notes"),
    /** Reserved for QuickBooks (or other accounting system) sync. */
    externalRef: text("external_ref"),
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
    byProject: index("bills_by_project").on(table.projectId),
    byVendor: index("bills_by_vendor").on(table.vendorId),
    byBid: index("bills_by_bid").on(table.bidId),
    byOrgStatus: index("bills_by_org_status").on(table.orgId, table.status),
    byOrgDue: index("bills_by_org_due").on(table.orgId, table.dueAt),
  }),
);

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
