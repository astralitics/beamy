import { jsonb, pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

/**
 * audit_log — append-only attribution log.
 * `actor` follows Cadenza's pattern: "user:<uuid>" / "agent:claude" / "webhook:<src>".
 * Every business write should land a row here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    payload: jsonb("payload"),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byOrgTs: index("audit_log_by_org_ts").on(table.orgId, table.ts),
    byResource: index("audit_log_by_resource").on(
      table.orgId,
      table.resourceType,
      table.resourceId,
    ),
  }),
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
