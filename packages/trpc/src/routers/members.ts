import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLog, getDb, invitations, orgMemberships } from "@beamy/db";
import {
  inviteCreateInputSchema,
  inviteIdInputSchema,
} from "@beamy/shared";
import { orgAdminProcedure, orgScopedProcedure, router } from "../init";

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
});
