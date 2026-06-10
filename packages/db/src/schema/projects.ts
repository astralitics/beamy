import { sql } from "drizzle-orm";
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

/**
 * projects — one client engagement. The container under which rooms,
 * assets, materials, drawings, RFIs, change orders, bills, todos all live.
 *
 * v1 keeps it light per design notes:
 *   - No project_members table (per-project ACL deferred — D-3).
 *   - No project_phases (phase is a soft tag, D-41 — comes later).
 *   - substantial_completion_signed_document_id deferred until documents
 *     table exists (M8).
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    address: text("address"),
    projectType: text("project_type", {
      enum: [
        "residential_renovation",
        "residential_new",
        "commercial_fitout",
        "commercial_new",
        "interior_design",
        "tenant_improvement",
        // landscaping (see @beamy/shared projectTypeSchema)
        "residential_landscape",
        "commercial_landscape",
        "hardscape_install",
        "irrigation_install",
        "garden_design",
        "lawn_renovation",
        "landscape_maintenance",
        "other",
      ],
    })
      .notNull()
      .default("residential_renovation"),
    status: text("status", {
      enum: ["lead", "active", "on_hold", "completed", "archived"],
    })
      .notNull()
      .default("active"),
    contractAmount: numeric("contract_amount", { precision: 14, scale: 2 }),
    contractCurrency: text("contract_currency"),
    startedAt: date("started_at"),
    substantialCompletionAt: date("substantial_completion_at"),
    substantialCompletionCertifiedByUserId: uuid(
      "substantial_completion_certified_by_user_id",
    ),
    closedOutAt: date("closed_out_at"),
    ownerUserId: uuid("owner_user_id").notNull(),
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
    byOrgStatus: index("projects_by_org_status").on(table.orgId, table.status),
    byOrgClient: index("projects_by_org_client").on(
      table.orgId,
      table.clientId,
    ),
    byOrgName: index("projects_by_org_name").on(table.orgId, table.name),
  }),
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

/**
 * rooms — spatial container inside a project. Anchors asset.room_id,
 * furniture.room_id, material_applications.room_id.
 *
 * Beyond just name + type, a room captures:
 *   - `description`: what the room is, what's special about it
 *   - `floor`: building level (free-form, e.g. "P6", "Roof", "Ground")
 *   - `floor_area_sqm` + `ceiling_height_m`: metric, since most current
 *     projects are MX-based
 *   - `photo_url`: hero photo for the room detail page
 */
export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    roomType: text("room_type", {
      enum: [
        "kitchen",
        "primary_bath",
        "bath",
        "powder",
        "living",
        "dining",
        "family",
        "bedroom",
        "primary_bedroom",
        "office",
        "mudroom",
        "laundry",
        "garage",
        "basement",
        "attic",
        "mechanical",
        "hallway",
        "stairs",
        "exterior",
        "yard",
        // landscaping areas/zones (see @beamy/shared roomTypeSchema)
        "front_yard",
        "backyard",
        "side_yard",
        "garden_bed",
        "planting_bed",
        "lawn",
        "patio",
        "deck",
        "driveway",
        "walkway",
        "pool_area",
        "irrigation_zone",
        "other",
      ],
    }),
    description: text("description"),
    floor: text("floor"),
    floorAreaSqM: numeric("floor_area_sqm", { precision: 10, scale: 2 }),
    ceilingHeightM: numeric("ceiling_height_m", { precision: 5, scale: 2 }),
    photoUrl: text("photo_url"),
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
    byProject: index("rooms_by_project").on(table.projectId),
  }),
);

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
