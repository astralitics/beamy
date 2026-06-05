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

        const [row] = await tx
          .insert(invitations)
          .values({
            orgId: ctx.orgId,
            email: input.email,
            role: input.role,
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
          payload: { email: input.email, role: input.role },
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
        orgName: org?.name ?? "the workspace",
        role: inv.role,
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

        // v1 invariant (D-12): one user → one org. Refuse a second membership.
        const existing = await tx
          .select({ id: orgMemberships.id })
          .from(orgMemberships)
          .where(eq(orgMemberships.userId, ctx.userId))
          .limit(1);
        if (existing[0])
          throw new TRPCError({
            code: "CONFLICT",
            message: "You already belong to a workspace.",
          });

        const [membership] = await tx
          .insert(orgMemberships)
          .values({
            userId: ctx.userId,
            orgId: inv.orgId,
            role: inv.role,
            invitedByUserId: inv.invitedByUserId,
          })
          .returning();
        if (!membership)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx
          .update(invitations)
          .set({ acceptedAt: new Date(), acceptedByUserId: ctx.userId })
          .where(eq(invitations.id, inv.id));

        await tx.insert(auditLog).values({
          orgId: inv.orgId,
          actor: ctx.actor,
          action: "invitation.accepted",
          resourceType: "org_membership",
          resourceId: membership.id,
          payload: { invitationId: inv.id, email: inv.email, role: inv.role },
        });

        return { orgId: inv.orgId, role: inv.role };
      });
    }),
});
