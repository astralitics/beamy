import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { projects } from "./projects";
import { workItems } from "./work-items";

/**
 * proposals — outbound client side. What the firm sent the client.
 * One row per version sent. Beamy generates the artifact (HTML in v1,
 * HTML→PDF later) from project + accepted bids + markup rules and
 * stores it in the documents bucket. The `generated_document_id` FK
 * points at that artifact.
 *
 * `number` is the public proposal number — "PROP-2026-0001" auto-
 * assigned, sequential per-org-per-year. `version` lets the firm
 * revise an old proposal without losing the prior version's record;
 * v2 has status "drafted" or "sent" while v1 transitions to
 * "superseded". They share the same `number` only across explicit
 * "revise" operations — for v1 we keep that operation deferred and
 * each generate produces a fresh number.
 *
 * Status flow:
 *   drafted → sent → (accepted | rejected | superseded)
 *
 * `total_amount` is the client-facing bottom line, snapshotted at
 * generation time. The proposal_lines below carry the per-line
 * breakdown.
 */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Public proposal number: "PROP-2026-0001". Unique within an org. */
    number: text("number").notNull(),
    /** Revision counter. v1 always generates 1; revise is deferred. */
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    introText: text("intro_text"),
    status: text("status", {
      enum: ["drafted", "sent", "accepted", "rejected", "superseded"],
    })
      .notNull()
      .default("drafted"),
    sentAt: date("sent_at"),
    decidedAt: date("decided_at"),
    expiresAt: date("expires_at"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }),
    totalCurrency: text("total_currency"),
    notes: text("notes"),
    /**
     * The artifact Beamy produced (HTML, later HTML→PDF). When set,
     * the documents row is the downloadable proposal. Nullable
     * because the row can briefly exist before the upload completes.
     */
    generatedDocumentId: uuid("generated_document_id"),
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
    byProject: index("proposals_by_project").on(table.projectId),
    byOrgStatus: index("proposals_by_org_status").on(
      table.orgId,
      table.status,
    ),
    /** Proposal numbers are unique within an org. */
    uniqOrgNumber: uniqueIndex("proposals_org_number_unique").on(
      table.orgId,
      table.number,
    ),
  }),
);

export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;

/**
 * proposal_lines — what's on the client-facing proposal. Each row
 * references a `work_item` but carries display-time *snapshot*
 * fields. After generation, edits to the underlying work_item don't
 * change the historical proposal — that's the whole point.
 *
 * `work_item_id` is ON DELETE SET NULL: if a work item gets deleted
 * after a proposal was sent, the line stays as a frozen record of
 * what the client saw.
 *
 * `markup_pct_applied` is the markup that was used at generation
 * time. The dashboard money roll-up uses this when computing
 * committed vs. sold deltas.
 *
 * `section_label` groups lines under headings on the printed
 * artifact ("Cancelería", "Domótica"). Optional.
 */
export const proposalLines = pgTable(
  "proposal_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id").references(() => workItems.id, {
      onDelete: "set null",
    }),
    /** Render order; smaller renders first. Ties broken by id. */
    displayOrder: integer("display_order").notNull().default(0),
    sectionLabel: text("section_label"),
    /** Client-facing description; may differ from work_item.description. */
    displayDescription: text("display_description").notNull(),
    displayQty: numeric("display_qty", { precision: 14, scale: 4 }),
    displayUnit: text("display_unit"),
    displayUnitPrice: numeric("display_unit_price", {
      precision: 14,
      scale: 2,
    }),
    displayTotal: numeric("display_total", { precision: 14, scale: 2 }),
    currency: text("currency").notNull(),
    /** Snapshot of the markup % applied to this line at generation time. */
    markupPctApplied: numeric("markup_pct_applied", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byProposal: index("proposal_lines_by_proposal").on(
      table.proposalId,
      table.displayOrder,
    ),
    byWorkItem: index("proposal_lines_by_work_item").on(table.workItemId),
  }),
);

export type ProposalLine = typeof proposalLines.$inferSelect;
export type NewProposalLine = typeof proposalLines.$inferInsert;
