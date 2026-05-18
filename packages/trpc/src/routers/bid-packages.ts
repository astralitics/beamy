import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  bidPackages,
  getDb,
  projects,
} from "@beamy/db";
import {
  bidPackageCreateInputSchema,
  bidPackageIdInputSchema,
  bidPackageListInputSchema,
  bidPackageUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * bid_packages — competing-bids grouping. CRUD + per-row aggregate
 * (bid count). The award flow lives on the bids router (`bids.award`)
 * because the decision originates on a winning bid.
 */
export const bidPackagesRouter = router({
  list: orgScopedProcedure
    .input(bidPackageListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const ownsProject = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      if (!ownsProject[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const conditions = [
        eq(bidPackages.projectId, input.projectId),
        eq(bidPackages.orgId, ctx.orgId),
      ];
      if (input.status) conditions.push(eq(bidPackages.status, input.status));

      // Caller derives bidCount + totals from the bids list it already
      // fetches — avoids a correlated subquery and keeps the two
      // sources of truth (packages, bids) decoupled.
      return await db
        .select()
        .from(bidPackages)
        .where(and(...conditions))
        .orderBy(desc(bidPackages.updatedAt));
    }),

  get: orgScopedProcedure
    .input(bidPackageIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(bidPackages)
        .where(
          and(
            eq(bidPackages.id, input.id),
            eq(bidPackages.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: orgScopedProcedure
    .input(bidPackageCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const ownsProject = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!ownsProject[0]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Project not found in this org",
          });
        }

        const [row] = await tx
          .insert(bidPackages)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            name: input.name,
            scope: input.scope ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bid_package.created",
          resourceType: "bid_package",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(bidPackageUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(bidPackages)
          .where(
            and(
              eq(bidPackages.id, input.id),
              eq(bidPackages.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof bidPackages.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.scope !== undefined) setClause.scope = p.scope;
        if (p.status !== undefined) setClause.status = p.status;
        if (p.notes !== undefined) setClause.notes = p.notes;

        const [updated] = await tx
          .update(bidPackages)
          .set(setClause)
          .where(eq(bidPackages.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bid_package.updated",
          resourceType: "bid_package",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(bidPackageIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(bidPackages)
          .where(
            and(
              eq(bidPackages.id, input.id),
              eq(bidPackages.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        // FK is ON DELETE SET NULL — bids inside this package become
        // loose. That's the right default: deleting a package shouldn't
        // delete the underlying quotes; just dissolve the grouping.
        await tx.delete(bidPackages).where(eq(bidPackages.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bid_package.deleted",
          resourceType: "bid_package",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),
});
