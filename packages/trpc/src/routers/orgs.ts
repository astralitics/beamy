import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLog, getDb, orgMemberships, orgs } from "@beamy/db";
import { createOrgInputSchema } from "@beamy/shared";
import { protectedProcedure, router } from "../init";

/**
 * `orgs` router — minimal org provisioning surface.
 *
 * - `create` runs on `protectedProcedure` (auth required, but no existing
 *   org membership required). Called from the sign-up flow right after
 *   the Supabase user is created. Provisions the `orgs` row + an
 *   `org_memberships(role: "owner")` row in one transaction.
 *
 * Future procedures (update, delete, transfer ownership) will land here
 * as they're needed.
 */
export const orgsRouter = router({
  create: protectedProcedure
    .input(createOrgInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // v1 invariant (D-12): one user belongs to one org. Refuse if the
      // caller already has a membership — they should accept an invite
      // or create a second account.
      const existing = await db
        .select({ id: orgMemberships.id })
        .from(orgMemberships)
        .where(eq(orgMemberships.userId, ctx.userId))
        .limit(1);
      if (existing[0]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already belongs to an org",
        });
      }

      return await db.transaction(async (tx) => {
        const [org] = await tx
          .insert(orgs)
          .values({
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            defaultCurrency: input.defaultCurrency,
            locale: input.locale,
            ownerUserId: ctx.userId,
          })
          .returning();
        if (!org) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(orgMemberships).values({
          userId: ctx.userId,
          orgId: org.id,
          role: "owner",
        });

        await tx.insert(auditLog).values({
          orgId: org.id,
          actor: ctx.actor,
          action: "org.created",
          resourceType: "org",
          resourceId: org.id,
          payload: { name: input.name, slug: input.slug },
        });
        return org;
      });
    }),
});
