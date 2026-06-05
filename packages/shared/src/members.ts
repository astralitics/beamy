import { z } from "zod";

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
 */

export const inviteRoleSchema = z.enum(["admin", "member"]);
export type InviteRole = z.infer<typeof inviteRoleSchema>;

export const inviteCreateInputSchema = z.object({
  email: z.string().trim().email().max(200),
  role: inviteRoleSchema.default("member"),
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
