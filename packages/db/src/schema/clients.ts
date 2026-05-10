import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

/**
 * clients — external parties the firm has projects with (homeowners,
 * commercial owners, brands). Distinct from `vendors` (subs/suppliers).
 *
 * Audit columns mirror Cadenza's pattern: `created_by` / `updated_by` carry
 * the actor string ("user:<uuid>" / "agent:claude" / "webhook:<src>"). The
 * append-only history lives in `audit_log`; these columns are the cheap
 * "who touched this row last" view.
 */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    primaryContact: text("primary_contact"),
    address: text("address"),
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
    byOrgStatus: index("clients_by_org_status").on(table.orgId, table.status),
    byOrgName: index("clients_by_org_name").on(table.orgId, table.name),
  }),
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
