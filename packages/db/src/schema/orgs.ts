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
    // Product vertical this workspace runs as. Drives terminology, nav, and
    // which enum options the UI offers (shared schema, config-discriminated).
    // Existing orgs default to "construction" — the original Beamy domain.
    vertical: text("vertical", { enum: ["construction", "landscaping"] })
      .notNull()
      .default("construction"),
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
 * A user may belong to multiple orgs; the active org is selected per-request
 * (see resolveOrgMembership + the x-active-org header). The unique constraint
 * is on (user_id, org_id) — no duplicate membership in the same org, but N
 * distinct orgs are allowed. (Supersedes the v1 1-user→1-org rule, D-12.)
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
    userOrgUnique: uniqueIndex("org_memberships_user_org_unique").on(
      table.userId,
      table.orgId,
    ),
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
    // The inviter's org — used for "invited by" attribution + audit context.
    // For "workspace" invites the redeemed membership lands in a NEW org, not
    // this one; for "member" invites the invitee joins this org directly.
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    // What accepting this invite does:
    //  - "workspace": provision a brand-new org (invitee becomes owner),
    //    seeded with `vertical` + `workspaceName`. Multi-customer onboarding.
    //  - "member": join the inviter's `orgId` at `role`. Team onboarding.
    kind: text("kind", { enum: ["workspace", "member"] })
      .notNull()
      .default("member"),
    // Set for "workspace" invites: the vertical + display name of the org to
    // provision on acceptance. Null for "member" invites.
    vertical: text("vertical", { enum: ["construction", "landscaping"] })
      .notNull()
      .default("construction"),
    workspaceName: text("workspace_name"),
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
