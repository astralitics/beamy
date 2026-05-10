import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

/**
 * vendors — subs and suppliers the firm pays. Distinct from `clients`
 * (parties the firm is paid by).
 *
 * `trade` is plain text (not an enum) — different firms use different
 * vocabularies (a residential GC's "framer" is a commercial firm's
 * "structural carpentry sub"). The UI surfaces a suggested-values
 * dropdown (see SUGGESTED_TRADES in @beamy/shared) but firms can override.
 *
 * Money pair (`default_rate_amount`, `default_rate_currency`) follows D-17:
 * both columns set or both null, never one without the other. Enforced at
 * the Zod boundary; the DB allows nulls.
 */
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trade: text("trade").notNull(),
    primaryContact: text("primary_contact"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
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
    paymentTerms: text("payment_terms"),
    ein: text("ein"),
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
    byOrgStatus: index("vendors_by_org_status").on(table.orgId, table.status),
    byOrgTrade: index("vendors_by_org_trade").on(table.orgId, table.trade),
    byOrgName: index("vendors_by_org_name").on(table.orgId, table.name),
  }),
);

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;

/**
 * vendor_contacts — additional contacts beyond `vendors.primary_contact`.
 * Schema lands now alongside vendors; CRUD router + UI rolls in alongside
 * client_contacts in a follow-up PR for shape symmetry.
 */
export const vendorContacts = pgTable(
  "vendor_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
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
    byVendor: index("vendor_contacts_by_vendor").on(table.vendorId),
  }),
);

export type VendorContact = typeof vendorContacts.$inferSelect;
export type NewVendorContact = typeof vendorContacts.$inferInsert;

/**
 * vendor_compliance — W9 / COIs / licenses with effective + expiration
 * dates. Drives the compliance sweep workflow (#21 in §12 of design.md):
 * scheduled monthly run surfaces docs expiring in <30d.
 *
 * `expiration_status` is computed at query time from `expires_at` vs today
 * (active / expiring_soon / expired) — not stored, so it's always current.
 *
 * File attachment via `document_id` lands once the documents table exists
 * (M2/M8). Until then compliance records are metadata-only — that's fine
 * per Beamy's partial-completion ethos (D-22).
 */
export const vendorCompliance = pgTable(
  "vendor_compliance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    docType: text("doc_type", {
      enum: [
        "w9",
        "coi_general",
        "coi_workers_comp",
        "license",
        "business_license",
        "other",
      ],
    }).notNull(),
    effectiveFrom: date("effective_from"),
    expiresAt: date("expires_at"),
    coverageAmount: numeric("coverage_amount", { precision: 14, scale: 2 }),
    coverageCurrency: text("coverage_currency"),
    notes: text("notes"),
    // documentId — added in M2/M8 when documents table exists
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
    byVendor: index("vendor_compliance_by_vendor").on(table.vendorId),
    byOrgExpires: index("vendor_compliance_by_org_expires").on(
      table.orgId,
      table.expiresAt,
    ),
  }),
);

export type VendorCompliance = typeof vendorCompliance.$inferSelect;
export type NewVendorCompliance = typeof vendorCompliance.$inferInsert;
