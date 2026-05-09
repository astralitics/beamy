import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * orgs — one row per agency. Tenant boundary.
 * See docs/design.md §5 (Identity, tenancy & access).
 */
export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    defaultCurrency: text("default_currency").notNull().default("USD"),
    locale: text("locale").notNull().default("en"),
    ownerUserId: uuid("owner_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("orgs_slug_unique").on(table.slug),
  }),
);

export const orgsRelations = relations(orgs, ({ many }) => ({
  memberships: many(orgMemberships),
  invitations: many(invitations),
}));

/**
 * org_memberships — which users belong to which org, and at what role.
 * v1 invariant: 1 user → 1 org (D-12). Enforced by unique index on user_id.
 */
export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    invitedByUserId: uuid("invited_by_user_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("org_memberships_user_unique").on(table.userId),
    byOrg: index("org_memberships_by_org").on(table.orgId),
  }),
);

export const orgMembershipsRelations = relations(orgMemberships, ({ one }) => ({
  org: one(orgs, { fields: [orgMemberships.orgId], references: [orgs.id] }),
}));

/**
 * invitations — pending invites to join an org.
 * Token is a random secret; expires_at gates redemption.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    invitedByUserId: uuid("invited_by_user_id").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("invitations_token_unique").on(table.token),
    byOrgEmail: index("invitations_by_org_email").on(table.orgId, table.email),
  }),
);

export const invitationsRelations = relations(invitations, ({ one }) => ({
  org: one(orgs, { fields: [invitations.orgId], references: [orgs.id] }),
}));

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type OrgMembership = typeof orgMemberships.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type OrgRole = OrgMembership["role"];
