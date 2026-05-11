import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { orgs } from "./orgs";
import { projects } from "./projects";

/**
 * invoices — money clients owe us. One row per invoice we issue.
 *
 * State machine: draft → sent → paid (void at any time). "Overdue" is a
 * UI concept computed from (status=sent && due_at < today) — not a
 * stored status. Same approach as bills.
 *
 * Money pair (amount, currency) per D-17. QuickBooks sync deferred —
 * `external_ref` reserved for it.
 *
 * Note `client_id` is nullable: most projects have a client, but a
 * direct retainer invoice with no project-client link is also OK.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    /** Our invoice number (manual in v1; auto-numbering lands at M3). */
    invoiceNumber: text("invoice_number"),
    description: text("description"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    issuedAt: date("issued_at"),
    sentAt: date("sent_at"),
    dueAt: date("due_at"),
    paidAt: date("paid_at"),
    status: text("status", {
      enum: ["draft", "sent", "paid", "void"],
    })
      .notNull()
      .default("draft"),
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
    byProject: index("invoices_by_project").on(table.projectId),
    byClient: index("invoices_by_client").on(table.clientId),
    byOrgStatus: index("invoices_by_org_status").on(
      table.orgId,
      table.status,
    ),
    byOrgDue: index("invoices_by_org_due").on(table.orgId, table.dueAt),
  }),
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
