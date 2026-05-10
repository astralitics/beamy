import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLog, getDb, services } from "@beamy/db";
import {
  serviceCreateInputSchema,
  serviceIdInputSchema,
  serviceListInputSchema,
  serviceUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `services` router — the firm's standard offerings catalog. Same shape as
 * `clientsRouter` (PR #4) and `vendorsRouter` (PR #5): all on
 * orgScopedProcedure, all mutations transactional with audit_log writes.
 */
export const servicesRouter = router({
  list: orgScopedProcedure
    .input(serviceListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(services.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(services.status, input.status));
      if (input.search) {
        const pattern = `%${input.search}%`;
        const searchClause = or(
          ilike(services.name, pattern),
          ilike(services.description, pattern),
        );
        if (searchClause) conditions.push(searchClause);
      }
      return await db
        .select()
        .from(services)
        .where(and(...conditions))
        .orderBy(desc(services.updatedAt));
    }),

  get: orgScopedProcedure
    .input(serviceIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(services)
        .where(and(eq(services.id, input.id), eq(services.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: orgScopedProcedure
    .input(serviceCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(services)
          .values({
            orgId: ctx.orgId,
            name: input.name,
            description: input.description ?? null,
            defaultRateAmount: input.defaultRateAmount ?? null,
            defaultRateCurrency: input.defaultRateCurrency ?? null,
            billingUnit: input.billingUnit ?? "hour",
            notes: input.notes ?? null,
            tags: input.tags ?? [],
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "service.created",
          resourceType: "service",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(serviceUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(services)
          .where(and(eq(services.id, input.id), eq(services.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof services.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.description !== undefined) {
          setClause.description = p.description ?? null;
        }
        if (p.defaultRateAmount !== undefined) {
          setClause.defaultRateAmount = p.defaultRateAmount ?? null;
        }
        if (p.defaultRateCurrency !== undefined) {
          setClause.defaultRateCurrency = p.defaultRateCurrency ?? null;
        }
        if (p.billingUnit !== undefined) setClause.billingUnit = p.billingUnit;
        if (p.notes !== undefined) setClause.notes = p.notes ?? null;
        if (p.tags !== undefined) setClause.tags = p.tags;

        const [updated] = await tx
          .update(services)
          .set(setClause)
          .where(eq(services.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "service.updated",
          resourceType: "service",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  archive: orgScopedProcedure
    .input(serviceIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setServiceStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "archived",
      );
    }),

  restore: orgScopedProcedure
    .input(serviceIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setServiceStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "active",
      );
    }),
});

async function setServiceStatus(
  ctx: { orgId: string; actor: string },
  id: string,
  status: "active" | "archived",
) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(services)
      .where(and(eq(services.id, id), eq(services.orgId, ctx.orgId)))
      .limit(1);
    if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await tx
      .update(services)
      .set({
        status,
        updatedAt: new Date(),
        updatedBy: ctx.actor,
      })
      .where(eq(services.id, id))
      .returning();
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actor: ctx.actor,
      action: status === "archived" ? "service.archived" : "service.restored",
      resourceType: "service",
      resourceId: id,
    });
    return updated;
  });
}
