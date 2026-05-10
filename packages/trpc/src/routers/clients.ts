import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLog, clients, getDb } from "@beamy/db";
import {
  clientCreateInputSchema,
  clientIdInputSchema,
  clientListInputSchema,
  clientUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `clients` router — first concrete entity in M1.
 *
 * Pattern that all subsequent entity routers follow:
 *   - Every procedure runs on `orgScopedProcedure` (D-10 invariant).
 *   - Reads filter by `org_id`; writes verify the row's `org_id` matches
 *     `ctx.orgId` before mutating.
 *   - Mutations are wrapped in `db.transaction` and append to `audit_log`
 *     in the same transaction (so the row + the audit entry land together
 *     or not at all).
 */
export const clientsRouter = router({
  list: orgScopedProcedure
    .input(clientListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(clients.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(clients.status, input.status));
      if (input.search) {
        const pattern = `%${input.search}%`;
        const searchClause = or(
          ilike(clients.name, pattern),
          ilike(clients.primaryContact, pattern),
        );
        if (searchClause) conditions.push(searchClause);
      }
      return await db
        .select()
        .from(clients)
        .where(and(...conditions))
        .orderBy(desc(clients.updatedAt));
    }),

  get: orgScopedProcedure
    .input(clientIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.id), eq(clients.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: orgScopedProcedure
    .input(clientCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(clients)
          .values({
            orgId: ctx.orgId,
            name: input.name,
            primaryContact: input.primaryContact ?? null,
            address: input.address ?? null,
            notes: input.notes ?? null,
            tags: input.tags ?? [],
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "client.created",
          resourceType: "client",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(clientUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(clients)
          .where(and(eq(clients.id, input.id), eq(clients.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof clients.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        if (input.patch.name !== undefined) setClause.name = input.patch.name;
        if (input.patch.primaryContact !== undefined) {
          setClause.primaryContact = input.patch.primaryContact ?? null;
        }
        if (input.patch.address !== undefined) {
          setClause.address = input.patch.address ?? null;
        }
        if (input.patch.notes !== undefined) {
          setClause.notes = input.patch.notes ?? null;
        }
        if (input.patch.tags !== undefined) setClause.tags = input.patch.tags;

        const [updated] = await tx
          .update(clients)
          .set(setClause)
          .where(eq(clients.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "client.updated",
          resourceType: "client",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  archive: orgScopedProcedure
    .input(clientIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setClientStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "archived",
      );
    }),

  restore: orgScopedProcedure
    .input(clientIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setClientStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "active",
      );
    }),
});

async function setClientStatus(
  ctx: { orgId: string; actor: string },
  id: string,
  status: "active" | "archived",
) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.orgId, ctx.orgId)))
      .limit(1);
    if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await tx
      .update(clients)
      .set({
        status,
        updatedAt: new Date(),
        updatedBy: ctx.actor,
      })
      .where(eq(clients.id, id))
      .returning();
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actor: ctx.actor,
      action: status === "archived" ? "client.archived" : "client.restored",
      resourceType: "client",
      resourceId: id,
    });
    return updated;
  });
}
