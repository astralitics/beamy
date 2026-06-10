import { z } from "zod";
import { verticalSchema } from "./verticals";

/**
 * Members + invitations — managing who's in the agency.
 *
 * v1 invariant: 1 user → 1 org (D-12). The schema enforces this via a unique
 * index on `org_memberships.user_id`. Invitations get redeemed into a
 * membership on a separate auth-aware path (lands in the Supabase Auth PR).
 *
 * Roles are `owner` / `admin` / `member`. `owner` is reserved for the
 * sign-up flow (the user creating an org becomes its owner); invites can
 * only create `admin` or `member` rows.
 *
 * Invites come in two kinds:
 *  - "workspace": provision a brand-new org for the invitee (they become its
 *    `owner`), seeded with the chosen `vertical` + `workspaceName`. This is how
 *    a new construction OR landscaping customer is onboarded.
 *  - "member": add the invitee to the inviter's existing org at `role`.
 */

export const inviteRoleSchema = z.enum(["admin", "member"]);
export type InviteRole = z.infer<typeof inviteRoleSchema>;

export const inviteKindSchema = z.enum(["workspace", "member"]);
export type InviteKind = z.infer<typeof inviteKindSchema>;

export const inviteCreateInputSchema = z
  .object({
    email: z.string().trim().email().max(200),
    kind: inviteKindSchema.default("member"),
    // "member" invites use `role`; "workspace" invites ignore it (the invitee
    // always lands as `owner` of the new org).
    role: inviteRoleSchema.default("member"),
    // Required for "workspace" invites; ignored for "member" invites.
    vertical: verticalSchema.optional(),
    workspaceName: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "workspace") {
      if (!val.vertical) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "vertical is required for a workspace invite",
          path: ["vertical"],
        });
      }
      if (!val.workspaceName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "workspaceName is required for a workspace invite",
          path: ["workspaceName"],
        });
      }
    }
  });
export type InviteCreateInput = z.infer<typeof inviteCreateInputSchema>;

export const inviteIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type InviteIdInput = z.infer<typeof inviteIdInputSchema>;

/**
 * Redeeming / previewing an invite by its token. The token is the random
 * secret minted in `members.invite`; possession is the authorization (the
 * caller may not be a member of any org yet). Used by the invite-redeem page.
 */
export const inviteAcceptInputSchema = z.object({
  token: z.string().trim().min(1).max(500),
});
export type InviteAcceptInput = z.infer<typeof inviteAcceptInputSchema>;
