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
    const membership = await resolveOrgMembership(ctx.userId);
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
