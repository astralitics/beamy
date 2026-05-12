import { z } from "zod";

/**
 * proposals — outbound client side. The artifact Beamy generates
 * from accepted bids → work_items + markup rules and sends to the
 * client. One row per version sent.
 *
 * The `generate` mutation does the heavy lifting; CRUD endpoints
 * handle lifecycle (transition: drafted → sent → accepted/rejected)
 * and cleanup.
 */

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const proposalStatusSchema = z.enum([
  "drafted",
  "sent",
  "accepted",
  "rejected",
  "superseded",
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  drafted: "Drafted",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
};

export const PROPOSAL_STATUS_FLOW: ProposalStatus[] = [
  "drafted",
  "sent",
  "accepted",
];

/**
 * Generator input. Server walks the workItemIds, applies the
 * markup, snapshots each line into proposal_lines, renders HTML,
 * uploads to documents bucket, and stamps the proposal with the
 * resulting documentId.
 *
 * `markupPct` is the default applied to every line that doesn't
 * have its own client_unit_price override on the underlying
 * work_item. UI typically reads project-level default and passes
 * it here; per-line overrides are a follow-up edit step.
 */
export const proposalGenerateInputSchema = z.object({
  projectId: z.string().uuid(),
  workItemIds: z
    .array(z.string().uuid())
    .min(1, "Pick at least one work item")
    .max(500),
  title: z.string().trim().min(1, "Title is required").max(200),
  introText: z.string().trim().max(20000).optional(),
  markupPct: z
    .number()
    .min(0, "Markup can't be negative")
    .max(500, "Markup must be reasonable")
    .default(0),
  currency: z.string().length(3, "ISO 4217 3-letter code"),
  expiresAt: isoDate.optional(),
  /**
   * Optional section labels keyed by work_item.trade. Lines whose
   * trade matches a key get that section heading in the rendered
   * artifact; lines with no match group under "Other".
   */
  sectionLabelsByTrade: z.record(z.string(), z.string().max(80)).optional(),
});
export type ProposalGenerateInput = z.infer<typeof proposalGenerateInputSchema>;

export const proposalListInputSchema = z.object({
  projectId: z.string().uuid(),
  status: proposalStatusSchema.optional(),
});
export type ProposalListInput = z.infer<typeof proposalListInputSchema>;

export const proposalIdInputSchema = z.object({ id: z.string().uuid() });
export type ProposalIdInput = z.infer<typeof proposalIdInputSchema>;

export const proposalTransitionInputSchema = z.object({
  id: z.string().uuid(),
  to: proposalStatusSchema,
  at: isoDate.optional(),
});
export type ProposalTransitionInput = z.infer<
  typeof proposalTransitionInputSchema
>;

/**
 * Light update — only the fields it makes sense to edit on a
 * generated proposal without re-running the generator. (Notes,
 * intro text, expiration date.) Body, totals, and line items
 * require a re-generate.
 */
export const proposalPatchInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    introText: z.string().trim().max(20000).nullable().optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
    expiresAt: isoDate.nullable().optional(),
  }),
});
export type ProposalPatchInput = z.infer<typeof proposalPatchInputSchema>;
