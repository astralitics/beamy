import { eq } from "drizzle-orm";
import { getDb, orgs } from "@riffy/db";
import { orgScopedProcedure, publicProcedure, router } from "../init";

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
      },
    };
  }),
});
