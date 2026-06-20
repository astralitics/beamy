import { TRPCError } from "@trpc/server";
import { auditLog, getDb, orgMemberships, orgs } from "@beamy/db";
import { createOrgInputSchema } from "@beamy/shared";
import { platformAdminProcedure, router } from "../init";

/**
 * `orgs` router — low-level org provisioning primitive.
 *
 * - `create` runs on `platformAdminProcedure`. Beamy is strictly invite-only:
 *   normal users can NOT self-create workspaces. Workspaces are provisioned by
 *   a platform admin (the console's `admin.access.createWorkspace` is the
 *   higher-level entry that also assigns an owner); this primitive remains for
 *   admin/seed use.
 *
 * Future procedures (update, delete, transfer ownership) will land here
 * as they're needed.
 */
export const orgsRouter = router({
  create: platformAdminProcedure
    .input(createOrgInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Multi-org: a user may own/belong to several workspaces. The unique
      // constraint is on (user_id, org_id), so a brand-new org never clashes.
      return await db.transaction(async (tx) => {
        const [org] = await tx
          .insert(orgs)
          .values({
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            vertical: input.vertical ?? "construction",
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
          payload: { name: input.name, slug: input.slug, vertical: org.vertical },
        });
        return org;
      });
    }),
});
