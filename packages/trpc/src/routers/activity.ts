import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assets,
  auditLog,
  bills,
  getDb,
  invoices,
  materials,
  projects,
  rooms,
  specItems,
} from "@beamy/db";
import { orgScopedProcedure, router } from "../init";

/**
 * `activity` router — the read side over `audit_log`. Every business
 * mutation across the app writes an audit row; this router slices the
 * stream by project (and later by resource).
 *
 * Why a separate router instead of folding into projects: activity is
 * its own concept (event stream over the entire data graph). When the
 * workspace-level activity feed lands (an "everything in the org" view),
 * it'll be `activity.list` against the same router. Keeping it apart
 * now avoids carving it back out later.
 *
 * Implementation: `audit_log` has no `project_id` column (the table is
 * generic by design — same shape for workspace-level events too). To
 * scope to a project we collect the child resource IDs for that
 * project (rooms, assets, materials, specs, bills, invoices) and OR
 * them into the audit_log filter. One extra round-trip up front; the
 * main query then scans only the relevant slice via the
 * `audit_log_by_org_ts` index.
 */
export const activityRouter = router({
  listForProject: orgScopedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
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

      // Collect every child resource id for this project. Parallel
      // since they don't depend on each other.
      const [roomIds, assetIds, materialIds, specIds, billIds, invoiceIds] =
        await Promise.all([
          db
            .select({ id: rooms.id })
            .from(rooms)
            .where(eq(rooms.projectId, input.projectId))
            .then((r) => r.map((x) => x.id)),
          db
            .select({ id: assets.id })
            .from(assets)
            .where(eq(assets.projectId, input.projectId))
            .then((r) => r.map((x) => x.id)),
          db
            .select({ id: materials.id })
            .from(materials)
            .where(eq(materials.projectId, input.projectId))
            .then((r) => r.map((x) => x.id)),
          db
            .select({ id: specItems.id })
            .from(specItems)
            .where(eq(specItems.projectId, input.projectId))
            .then((r) => r.map((x) => x.id)),
          db
            .select({ id: bills.id })
            .from(bills)
            .where(eq(bills.projectId, input.projectId))
            .then((r) => r.map((x) => x.id)),
          db
            .select({ id: invoices.id })
            .from(invoices)
            .where(eq(invoices.projectId, input.projectId))
            .then((r) => r.map((x) => x.id)),
        ]);

      // Build OR conditions. Each clause requires resource_type AND
      // resource_id IN (...). Skip empty arrays — Drizzle's inArray
      // chokes on them and they're identity-false anyway.
      const clauses: SQL[] = [
        and(
          eq(auditLog.resourceType, "project"),
          eq(auditLog.resourceId, input.projectId),
        )!,
      ];
      const addLineage = (resourceType: string, ids: string[]) => {
        if (ids.length === 0) return;
        const c = and(
          eq(auditLog.resourceType, resourceType),
          inArray(auditLog.resourceId, ids),
        );
        if (c) clauses.push(c);
      };
      addLineage("room", roomIds);
      addLineage("asset", assetIds);
      addLineage("material", materialIds);
      addLineage("spec_item", specIds);
      addLineage("bill", billIds);
      addLineage("invoice", invoiceIds);

      const lineageClause = or(...clauses);
      if (!lineageClause) return [];

      return await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.orgId, ctx.orgId), lineageClause))
        .orderBy(desc(auditLog.ts))
        .limit(input.limit);
    }),
});
