import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { projects } from "./projects";
import { vendors } from "./vendors";
import { bidPackages } from "./bid-packages";

/**
 * bids — what a subcontractor sent us. One row per quote PDF (or per
 * revision). Carries the bid totals + procurement state + the flag
 * bag that surfaces procurement metadata cleanly.
 *
 * This is the **inbound** side of paper — vendor → firm. The outbound
 * side (firm → client proposals) is a separate entity that aggregates
 * accepted bids into a single client-facing artifact.
 *
 * The source PDF, when uploaded, becomes a `documents` row with its
 * `bid_id` set back here (added in the same migration as the bids
 * table). That FK is bidirectional-discoverable via the documents
 * index.
 *
 * Money pair (subtotal/iva/total share one `currency`). `ivaIncluded`
 * is a hard column rather than just a flag string because the math
 * branch is different and the dashboard money roll-up needs it.
 *
 * The `flags` array stays open-ended for everything else — slugs
 * like "validity-likely-expired" / "freight-not-included" /
 * "deposit-required" are checked in product code, not in the DB.
 */
export const bids = pgTable(
  "bids",
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
    /**
     * When set, this bid is competing inside a `bid_packages` group.
     * Loose (un-packaged) bids leave this null.
     */
    packageId: uuid("package_id").references(() => bidPackages.id, {
      onDelete: "set null",
    }),
    /** Free-form trade tag — "carpintería", "electricidad", "tile". */
    trade: text("trade"),
    /** Vendor's bid / quote number from the PDF. */
    bidNumber: text("bid_number"),
    bidDate: date("bid_date"),
    validUntil: date("valid_until"),
    subtotalAmount: numeric("subtotal_amount", { precision: 14, scale: 2 }),
    ivaAmount: numeric("iva_amount", { precision: 14, scale: 2 }),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    /**
     * Down payment / anticipo (enganche) required to start the work.
     * Common on MX cotizaciones (often 50%). Shares `currency`.
     */
    depositAmount: numeric("deposit_amount", { precision: 14, scale: 2 }),
    /** Shared currency for subtotal / iva / total / deposit. */
    currency: text("currency"),
    /**
     * Whether the vendor's price line already includes IVA. Affects
     * the money roll-up math and how the dashboard surfaces "real
     * commitment" vs. "pre-IVA budget".
     */
    ivaIncluded: boolean("iva_included").notNull().default(false),
    status: text("status", {
      enum: ["received", "comparing", "accepted", "completed", "rejected", "expired"],
    })
      .notNull()
      .default("received"),
    decidedAt: date("decided_at"),
    /**
     * Free-form procurement flags. Common slugs include
     * "validity-likely-expired", "freight-not-included",
     * "deposit-required", "missing-cotizacion-only-credentials".
     * Product code interprets.
     */
    flags: text("flags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes"),
    /**
     * Revision lineage. `version` is 1 for an original quote and bumps
     * each time the user "saves as a new version". `supersedesBidId`
     * points back to the version this one replaced; the replaced bid is
     * retired (status → expired) and rendered read-only. The live quote
     * is the version with no successor.
     */
    version: integer("version").notNull().default(1),
    supersedesBidId: uuid("supersedes_bid_id").references(
      (): AnyPgColumn => bids.id,
      { onDelete: "set null" },
    ),
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
    byProject: index("bids_by_project").on(table.projectId),
    byVendor: index("bids_by_vendor").on(table.vendorId),
    byOrgStatus: index("bids_by_org_status").on(table.orgId, table.status),
    byPackage: index("bids_by_package").on(table.packageId),
    bySupersedes: index("bids_by_supersedes").on(table.supersedesBidId),
  }),
);

export type Bid = typeof bids.$inferSelect;
export type NewBid = typeof bids.$inferInsert;
