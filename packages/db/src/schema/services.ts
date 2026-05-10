import { sql } from "drizzle-orm";
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

/**
 * services — the firm's standard offerings catalog. Reusable building
 * blocks that proposals/bids draw from later (workflow #1).
 *
 * Money pair (`default_rate_amount`, `default_rate_currency`) follows D-17.
 */
export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    defaultRateAmount: numeric("default_rate_amount", {
      precision: 14,
      scale: 2,
    }),
    defaultRateCurrency: text("default_rate_currency"),
    billingUnit: text("billing_unit", {
      enum: ["hour", "day", "project", "retainer", "unit"],
    })
      .notNull()
      .default("hour"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    notes: text("notes"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
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
    byOrgStatus: index("services_by_org_status").on(table.orgId, table.status),
    byOrgName: index("services_by_org_name").on(table.orgId, table.name),
  }),
);

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
