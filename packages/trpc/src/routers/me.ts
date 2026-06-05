import { eq } from "drizzle-orm";
import { getDb, orgs } from "@beamy/db";
import {
  orgScopedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../init";
import { resolveOrgMembership } from "../context";

/**
 * `me` router — minimal end-to-end demo for M0:
 *  - public ping that doesn't touch the DB
 *  - org-scoped query that returns the active org (proves the middleware works)
 */
export const meRouter = router({
  ping: publicProcedure.query(() => ({
    ok: true,
    ts: new Date().toISOString(),
  })),

  whoami: orgScopedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, ctx.orgId))
      .limit(1);

    const org = rows[0];
    if (!org) {
      // Should not happen — orgScopedProcedure already verified membership.
      throw new Error(`Org ${ctx.orgId} disappeared mid-request`);
    }

    return {
      userId: ctx.userId,
      role: ctx.role,
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        defaultCurrency: org.defaultCurrency,
        locale: org.locale,
      },
    };
  }),

  /**
   * Non-throwing membership probe — the "am I authorized?" gate for invite-only
   * auth. Unlike `whoami` (which 403s when the user has no org), this returns a
   * status object so the client can route a brand-new user (e.g. a fresh Google
   * sign-in with no invite) to /redeem instead of crashing on a 403.
   */
  membership: protectedProcedure.query(async ({ ctx }) => {
    const m = await resolveOrgMembership(ctx.userId);
    if (!m) {
      return { hasMembership: false as const, role: null, org: null };
    }
    const db = getDb();
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, m.orgId))
      .limit(1);
    return {
      hasMembership: true as const,
      role: m.role,
      org: org
        ? {
            id: org.id,
            name: org.name,
            slug: org.slug,
            defaultCurrency: org.defaultCurrency,
            locale: org.locale,
          }
        : null,
    };
  }),
});
