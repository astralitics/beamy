import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assets } from "./assets";
import { bids } from "./bids";
import { changeOrders } from "./change-orders";
import { materials } from "./materials";
import { orgs } from "./orgs";
import { projects, rooms } from "./projects";
import { proposals } from "./proposals";

/**
 * documents — project-scoped file library. Contracts, warranties,
 * manufacturer spec sheets, photos. Backed by Supabase Storage; this
 * table holds the metadata + the storage path.
 *
 * Storage path convention (recorded in `storage_path`):
 *   `{orgId}/{projectId}/{documentId}.{ext}`
 *
 * Path is set once at creation and never changes — renames touch only
 * `name`. The blob lives in the `documents` Supabase Storage bucket
 * (created by the migration that adds this table).
 *
 * Tags: project_id (required) plus optional room_id, asset_id,
 * material_id pointers for the common "what's the warranty PDF for
 * THIS fridge?" queries. Skipped spec/bill/invoice tags for v1 — the
 * pattern is established and easy to add later.
 *
 * "Missing blob" handling: if a row exists but the storage object
 * doesn't (failed upload after create), the download endpoint returns
 * an error rather than a signed URL. UI surfaces it.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    assetId: uuid("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    materialId: uuid("material_id").references(() => materials.id, {
      onDelete: "set null",
    }),
    bidId: uuid("bid_id").references(() => bids.id, {
      onDelete: "set null",
    }),
    proposalId: uuid("proposal_id").references(() => proposals.id, {
      onDelete: "set null",
    }),
    changeOrderId: uuid("change_order_id").references(() => changeOrders.id, {
      onDelete: "set null",
    }),
    /** User-facing display name (with extension). Defaults to upload filename. */
    name: text("name").notNull(),
    description: text("description"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Path inside the `documents` bucket. Never null after row creation. */
    storagePath: text("storage_path").notNull(),
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
    byProject: index("documents_by_project").on(
      table.projectId,
      table.createdAt,
    ),
    byRoom: index("documents_by_room").on(table.roomId),
    byAsset: index("documents_by_asset").on(table.assetId),
    byMaterial: index("documents_by_material").on(table.materialId),
    byBid: index("documents_by_bid").on(table.bidId),
    byProposal: index("documents_by_proposal").on(table.proposalId),
    byChangeOrder: index("documents_by_change_order").on(table.changeOrderId),
  }),
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
