import { initTRPC, TRPCError } from "@trpc/server";
import {
  type BaseContext,
  type AuthedContext,
  type OrgScopedContext,
  resolveOrgMembership,
} from "./context";

const t = initTRPC.context<BaseContext>().create();

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * Requires an authenticated user. Anonymous calls fail with 401.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: ctx as AuthedContext });
});

/**
 * Requires an authenticated user with an active org membership.
 * Resolves and injects `orgId` + `role` into context. Every procedure built
 * on this base is implicitly tenant-scoped — it cannot see other orgs' data
 * unless the caller writes raw SQL that bypasses `ctx.orgId`.
 *
 * This is the workhorse for ~all of the app's procedures. Mirrors Cadenza's
 * `orgScopedProcedure` pattern (D-10).
 */
export const orgScopedProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    // Honor the client's requested active org (x-active-org), validated against
    // the user's real memberships; falls back to their default org otherwise.
    const membership = await resolveOrgMembership(
      ctx.userId,
      ctx.activeOrgId,
      ctx.isPlatformAdmin,
    );
    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User has no org membership",
      });
    }
    return next({
      ctx: {
        ...ctx,
        orgId: membership.orgId,
        role: membership.role,
      } satisfies OrgScopedContext,
    });
  },
);

/**
 * Narrows `orgScopedProcedure` to org owners and admins. Use for procedures
 * that mutate org-level configuration — inviting members, revoking
 * invitations, changing roles, eventually billing.
 *
 * Members (the third role) can read org-shared data but cannot mutate
 * settings.
 */
export const orgAdminProcedure = orgScopedProcedure.use(({ ctx, next }) => {
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required",
    });
  }
  return next({ ctx });
});

/**
 * Cross-tenant platform-admin tier. Requires an authenticated user whose
 * verified email is on the `PLATFORM_ADMIN_EMAILS` allowlist (computed in
 * context, never client input). Intentionally NOT org-scoped — procedures on
 * this tier operate across every tenant (see `routers/admin`). The
 * membership-required path (orgScopedProcedure) is untouched for normal users.
 */
export const platformAdminProcedure = protectedProcedure.use(
  ({ ctx, next }) => {
    if (!ctx.isPlatformAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Platform admin required",
      });
    }
    return next({ ctx });
  },
);
