import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { projects } from "./projects";

/**
 * bid_packages — the "RFQ" / competing-bids grouping. A package gathers
 * multiple `bids` rows that are competing for the same scope of work
 * ("Paint primary bedroom + bath" → 3 painters' quotes). One package =
 * one decision to make.
 *
 * Status:
 *   - open      — receiving / comparing quotes
 *   - awarded   — a winning bid was chosen; `awarded_bid_id` points at it
 *   - cancelled — package abandoned (scope removed, budget cut, etc.)
 *
 * A bid without a `package_id` is a "loose" bid — a one-off quote not
 * being competed. Most one-vendor scopes will stay loose; only when
 * you're actively shopping a scope do you create a package.
 *
 * The `awarded_bid_id` self-references back to bids; declared without a
 * Drizzle FK to avoid a circular-table-reference at codegen time. The
 * application enforces it via the `bidPackages.award` mutation.
 */
export const bidPackages = pgTable(
  "bid_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Free-form description of the scope being competed. */
    scope: text("scope"),
    status: text("status", {
      enum: ["open", "awarded", "cancelled"],
    })
      .notNull()
      .default("open"),
    /** Set by the award mutation — soft FK to bids.id. */
    awardedBidId: uuid("awarded_bid_id"),
    awardedAt: date("awarded_at"),
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
    byProject: index("bid_packages_by_project").on(table.projectId),
    byOrgStatus: index("bid_packages_by_org_status").on(
      table.orgId,
      table.status,
    ),
  }),
);

export type BidPackage = typeof bidPackages.$inferSelect;
export type NewBidPackage = typeof bidPackages.$inferInsert;
