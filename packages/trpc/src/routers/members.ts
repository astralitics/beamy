import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLog, getDb, invitations, orgMemberships, orgs } from "@beamy/db";
import {
  inviteAcceptInputSchema,
  inviteCreateInputSchema,
  inviteIdInputSchema,
} from "@beamy/shared";
import {
  orgAdminProcedure,
  orgScopedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../init";
import { redeemInvitation } from "../lib/redeem-invitation";

/**
 * `members` router — manage who's in the org.
 *
 * - Reads (`list`, `listInvitations`) are open to any org member.
 * - Writes (`invite`, `revokeInvitation`) require admin/owner role
 *   via `orgAdminProcedure`.
 *
 * `accept` (redeeming an invite token into a real membership) lives on a
 * separate auth-aware path that lands with Supabase Auth wiring — that
 * procedure needs `protectedProcedure` since the caller might not yet be
 * a member of any org.
 */
export const membersRouter = router({
  list: orgScopedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    return await db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.orgId, ctx.orgId))
      .orderBy(asc(orgMemberships.joinedAt));
  }),

  listInvitations: orgScopedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    return await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, ctx.orgId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(invitations.createdAt));
  }),

  invite: orgAdminProcedure
    .input(inviteCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const isWorkspace = input.kind === "workspace";
        const [row] = await tx
          .insert(invitations)
          .values({
            orgId: ctx.orgId,
            email: input.email,
            kind: input.kind,
            // "workspace" invitees always become owner of the new org, so the
            // stored role only matters for "member" invites.
            role: input.role,
            vertical: isWorkspace ? input.vertical! : "construction",
            workspaceName: isWorkspace ? input.workspaceName! : null,
            invitedByUserId: ctx.userId,
            token,
            expiresAt,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "invitation.created",
          resourceType: "invitation",
          resourceId: row.id,
          payload: isWorkspace
            ? {
                email: input.email,
                kind: "workspace",
                vertical: input.vertical,
                workspaceName: input.workspaceName,
              }
            : { email: input.email, kind: "member", role: input.role },
        });
        return row;
      });
    }),

  revokeInvitation: orgAdminProcedure
    .input(inviteIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(invitations)
          .where(
            and(
              eq(invitations.id, input.id),
              eq(invitations.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(invitations).where(eq(invitations.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "invitation.revoked",
          resourceType: "invitation",
          resourceId: input.id,
          payload: { email: existing[0].email, role: existing[0].role },
        });
        return { ok: true as const };
      });
    }),

  /**
   * Preview an invite by token WITHOUT consuming it. Public so the redeem
   * page can show "Join <Org> as <role>" before the invitee has signed in.
   * Returns no secrets — the unguessable token is itself the access grant.
   */
  peekInvitation: publicProcedure
    .input(inviteAcceptInputSchema)
    .query(async ({ input }) => {
      const db = getDb();
      const [inv] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.token, input.token))
        .limit(1);
      if (!inv) return { valid: false as const, reason: "not_found" as const };
      if (inv.acceptedAt)
        return { valid: false as const, reason: "used" as const };
      if (inv.expiresAt.getTime() <= Date.now())
        return { valid: false as const, reason: "expired" as const };

      const [org] = await db
        .select({ name: orgs.name })
        .from(orgs)
        .where(eq(orgs.id, inv.orgId))
        .limit(1);
      return {
        valid: true as const,
        kind: inv.kind,
        // For "workspace" invites this is the NEW org's name; for "member"
        // invites it's the org the invitee is joining.
        orgName: inv.kind === "workspace" ? inv.workspaceName ?? "your workspace" : org?.name ?? "the workspace",
        vertical: inv.vertical,
        role: inv.kind === "workspace" ? "owner" : inv.role,
        email: inv.email,
      };
    }),

  /**
   * Redeem an invite token into a real org membership. On `protectedProcedure`
   * (not org-scoped) because the caller is authenticated but — by definition —
   * not yet a member of any org. Enforces the v1 invariant (1 user → 1 org,
   * D-12) and marks the invitation consumed in the same transaction.
   */
  accept: protectedProcedure
    .input(inviteAcceptInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const [inv] = await tx
          .select()
          .from(invitations)
          .where(eq(invitations.token, input.token))
          .limit(1);
        if (!inv)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "We didn't recognize that invite.",
          });
        if (inv.acceptedAt)
          throw new TRPCError({
            code: "CONFLICT",
            message: "That invite has already been used.",
          });
        if (inv.expiresAt.getTime() <= Date.now())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That invite has expired. Ask your admin for a new one.",
          });

        // Email gate: the invite is bound to the address it was sent to. The
        // verified email (from the JWT, never client input) MUST match —
        // otherwise a signed-in user could open someone else's invite link and
        // absorb the membership into their own account. (Velada's invariant.)
        const inviteEmail = inv.email.toLowerCase();
        if ((ctx.userEmail?.toLowerCase() ?? null) !== inviteEmail) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `This invite is for ${inviteEmail}. Sign in with that account to accept it.`,
          });
        }

        // Multi-org: a user may belong to several workspaces. A "workspace"
        // invite always provisions a new org (no clash). A "member" invite
        // joins inv.orgId — refuse only if they're already in THAT org.
        if (inv.kind === "member") {
          const dup = await tx
            .select({ id: orgMemberships.id })
            .from(orgMemberships)
            .where(
              and(
                eq(orgMemberships.userId, ctx.userId),
                eq(orgMemberships.orgId, inv.orgId),
              ),
            )
            .limit(1);
          if (dup[0])
            throw new TRPCError({
              code: "CONFLICT",
              message: "You're already a member of this workspace.",
            });
        }

        // Branches on inv.kind: "workspace" provisions a new org (invitee =
        // owner), "member" joins inv.orgId. Shared with me.authorize.
        return await redeemInvitation(tx, inv, ctx.userId, ctx.actor, "token");
      });
    }),
});
