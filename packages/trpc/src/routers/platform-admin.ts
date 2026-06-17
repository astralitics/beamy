import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { auditLog, getDb, orgMemberships, orgs, projects } from "@beamy/db";
import { platformAdminProcedure, router } from "../init";
import { resolveOrgMembership } from "../context";

/**
 * Platform-admin router — CROSS-TENANT operations for the small set of operators in the
 * PLATFORM_ADMIN_EMAILS allowlist (see context.ts / platformAdminProcedure). These are the
 * only procedures in the app that read/act across orgs; everything else is org-scoped.
 *
 * Entering a workspace is just setting `x-active-org` to it (the orgScoped seam grants a
 * platform admin owner access to any org) — `enterWorkspace` exists to AUDIT that deliberate
 * cross-tenant entry. `deleteWorkspace` hard-deletes an org (every org_id FK is ON DELETE
 * CASCADE, so one delete tears down the whole tenant), gated by a type-the-name confirmation.
 */
export const platformAdminRouter = router({
  /** Every workspace (tenant) with its size + owner — the admin "Workspaces" table. */
  listWorkspaces: platformAdminProcedure.query(async () => {
    const db = getDb();
    const all = await db
      .select({
        id: orgs.id,
        name: orgs.name,
        slug: orgs.slug,
        vertical: orgs.vertical,
        createdAt: orgs.createdAt,
        ownerUserId: orgs.ownerUserId,
      })
      .from(orgs)
      .orderBy(desc(orgs.createdAt));
    if (all.length === 0) return [];

    // Counts via grouped aggregates (correlated subqueries don't render reliably here),
    // merged in JS. Owner emails come straight from auth.users.
    const memberRows = await db
      .select({ orgId: orgMemberships.orgId, n: sql<number>`count(*)::int` })
      .from(orgMemberships)
      .groupBy(orgMemberships.orgId);
    const projectRows = await db
      .select({ orgId: projects.orgId, n: sql<number>`count(*)::int` })
      .from(projects)
      .groupBy(projects.orgId);
    const memberBy = new Map(memberRows.map((r) => [r.orgId, Number(r.n)]));
    const projectBy = new Map(projectRows.map((r) => [r.orgId, Number(r.n)]));

    const ownerIds = [...new Set(all.map((o) => o.ownerUserId))];
    const emailRows = (await db.execute(
      sql`select id::text as id, email from auth.users where id in (${sql.join(ownerIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
    )) as unknown as Array<{ id: string; email: string | null }>;
    const emailBy = new Map([...emailRows].map((r) => [r.id, r.email]));

    return all.map((o) => ({
      ...o,
      members: memberBy.get(o.id) ?? 0,
      projects: projectBy.get(o.id) ?? 0,
      ownerEmail: emailBy.get(o.ownerUserId) ?? null,
    }));
  }),

  /** Record a deliberate cross-tenant entry (the UI calls this before switching active org). */
  enterWorkspace: platformAdminProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [org] = await db
        .select({ id: orgs.id, name: orgs.name })
        .from(orgs)
        .where(eq(orgs.id, input.orgId))
        .limit(1);
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found." });
      // Audit to the admin's OWN org so the trail survives even if the target is later deleted.
      const home = await resolveOrgMembership(ctx.userId);
      await db.insert(auditLog).values({
        orgId: home?.orgId ?? input.orgId,
        actor: ctx.actor,
        action: "platform_admin.enter_workspace",
        resourceType: "org",
        resourceId: input.orgId,
        payload: { targetName: org.name },
      });
      return { ok: true as const };
    }),

  /** Hard-delete a workspace and everything in it (cascade). Guardrails: must type the exact
   *  name, and you can't delete the workspace you're currently operating in. Audited durably. */
  deleteWorkspace: platformAdminProcedure
    .input(z.object({ orgId: z.string().uuid(), confirmName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.orgId === ctx.activeOrgId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't delete the workspace you're currently in — switch out of it first.",
        });
      }
      const [org] = await db
        .select()
        .from(orgs)
        .where(eq(orgs.id, input.orgId))
        .limit(1);
      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found." });
      if (input.confirmName.trim() !== org.name.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Type the workspace name exactly ("${org.name}") to confirm.`,
        });
      }

      const [mc] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(orgMemberships)
        .where(eq(orgMemberships.orgId, input.orgId));
      const [pc] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(projects)
        .where(eq(projects.orgId, input.orgId));

      // Anchor the audit to an org that SURVIVES this delete — NEVER the target, whose audit_log
      // rows cascade away with it (which would erase the very record of the deletion). Prefer the
      // admin's own membership, else the org they're operating in. If neither exists, REFUSE:
      // a destructive cross-tenant action must always leave a durable, non-cascading trace.
      const home = await resolveOrgMembership(ctx.userId);
      const auditOrgId = [home?.orgId, ctx.activeOrgId].find(
        (id): id is string => !!id && id !== input.orgId,
      );
      if (!auditOrgId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "To delete a workspace you must belong to (or be active in) another workspace, so the deletion can be recorded.",
        });
      }

      // Audit + delete ATOMICALLY: the audit lands in a surviving org, and the ON DELETE CASCADE
      // (every org_id FK) tears down the whole tenant — both commit together or not at all.
      await db.transaction(async (tx) => {
        await tx.insert(auditLog).values({
          orgId: auditOrgId,
          actor: ctx.actor,
          action: "platform_admin.delete_workspace",
          resourceType: "org",
          resourceId: input.orgId,
          payload: {
            targetName: org.name,
            targetSlug: org.slug,
            ownerUserId: org.ownerUserId,
            members: Number(mc?.n ?? 0),
            projects: Number(pc?.n ?? 0),
          },
        });
        await tx.delete(orgs).where(eq(orgs.id, input.orgId));
      });
      return { ok: true as const, deleted: org.name };
    }),
});
