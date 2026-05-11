import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  clients,
  getDb,
  projects,
  rooms,
} from "@beamy/db";
import {
  projectCreateInputSchema,
  projectIdInputSchema,
  projectListInputSchema,
  projectUpdateInputSchema,
  roomCreateInputSchema,
  roomIdInputSchema,
  roomListInputSchema,
  roomUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `projects` router — M2 anchor. Projects contain rooms; rooms anchor
 * the recall layer (assets, materials, finishes — landing in subsequent
 * PRs).
 *
 * Same pattern as the M1 entity routers: orgScopedProcedure, transactional
 * mutations with audit_log writes, sub-row org ownership verified before
 * mutating.
 */
export const projectsRouter = router({
  // ─────────────────── projects CRUD ───────────────────

  list: orgScopedProcedure
    .input(projectListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(projects.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(projects.status, input.status));
      if (input.projectType) {
        conditions.push(eq(projects.projectType, input.projectType));
      }
      if (input.clientId) {
        conditions.push(eq(projects.clientId, input.clientId));
      }
      if (input.search) {
        const pattern = `%${input.search}%`;
        const searchClause = or(
          ilike(projects.name, pattern),
          ilike(projects.address, pattern),
        );
        if (searchClause) conditions.push(searchClause);
      }
      return await db
        .select()
        .from(projects)
        .where(and(...conditions))
        .orderBy(desc(projects.updatedAt));
    }),

  get: orgScopedProcedure
    .input(projectIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({
          project: projects,
          client: clients,
        })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(
          and(eq(projects.id, input.id), eq(projects.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...row.project,
        client: row.client,
      };
    }),

  create: orgScopedProcedure
    .input(projectCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // If clientId is set, verify it belongs to this org.
      if (input.clientId) {
        const owns = await db
          .select({ id: clients.id })
          .from(clients)
          .where(
            and(eq(clients.id, input.clientId), eq(clients.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!owns[0]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Client not found in this org",
          });
        }
      }

      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(projects)
          .values({
            orgId: ctx.orgId,
            clientId: input.clientId ?? null,
            name: input.name,
            address: input.address ?? null,
            projectType: input.projectType,
            contractAmount: input.contractAmount ?? null,
            contractCurrency: input.contractCurrency ?? null,
            startedAt: input.startedAt ?? null,
            ownerUserId: ctx.userId,
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
          action: "project.created",
          resourceType: "project",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(projectUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(projects)
          .where(
            and(eq(projects.id, input.id), eq(projects.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        // Verify clientId if changing.
        if (input.patch.clientId !== undefined && input.patch.clientId !== null) {
          const owns = await tx
            .select({ id: clients.id })
            .from(clients)
            .where(
              and(
                eq(clients.id, input.patch.clientId),
                eq(clients.orgId, ctx.orgId),
              ),
            )
            .limit(1);
          if (!owns[0]) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Client not found in this org",
            });
          }
        }

        const setClause: Partial<typeof projects.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.clientId !== undefined) setClause.clientId = p.clientId;
        if (p.address !== undefined) setClause.address = p.address ?? null;
        if (p.projectType !== undefined) setClause.projectType = p.projectType;
        if (p.contractAmount !== undefined) {
          setClause.contractAmount = p.contractAmount;
        }
        if (p.contractCurrency !== undefined) {
          setClause.contractCurrency = p.contractCurrency;
        }
        if (p.startedAt !== undefined) setClause.startedAt = p.startedAt;
        if (p.substantialCompletionAt !== undefined) {
          setClause.substantialCompletionAt = p.substantialCompletionAt;
        }
        if (p.closedOutAt !== undefined) setClause.closedOutAt = p.closedOutAt;
        if (p.notes !== undefined) setClause.notes = p.notes ?? null;
        if (p.tags !== undefined) setClause.tags = p.tags;

        const [updated] = await tx
          .update(projects)
          .set(setClause)
          .where(eq(projects.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "project.updated",
          resourceType: "project",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  archive: orgScopedProcedure
    .input(projectIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setProjectStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "archived",
      );
    }),

  restore: orgScopedProcedure
    .input(projectIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setProjectStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "active",
      );
    }),

  // ─────────────────── rooms sub-entity ───────────────────

  listRooms: orgScopedProcedure
    .input(roomListInputSchema)
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

      return await db
        .select()
        .from(rooms)
        .where(
          and(eq(rooms.projectId, input.projectId), eq(rooms.orgId, ctx.orgId)),
        )
        .orderBy(asc(rooms.name));
    }),

  addRoom: orgScopedProcedure
    .input(roomCreateInputSchema)
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
        if (!ownsProject[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const [row] = await tx
          .insert(rooms)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            name: input.name,
            roomType: input.roomType ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "room.created",
          resourceType: "room",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  updateRoom: orgScopedProcedure
    .input(roomUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(rooms)
          .where(and(eq(rooms.id, input.id), eq(rooms.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof rooms.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.roomType !== undefined) setClause.roomType = p.roomType;
        if (p.notes !== undefined) setClause.notes = p.notes ?? null;

        const [updated] = await tx
          .update(rooms)
          .set(setClause)
          .where(eq(rooms.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "room.updated",
          resourceType: "room",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  removeRoom: orgScopedProcedure
    .input(roomIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(rooms)
          .where(and(eq(rooms.id, input.id), eq(rooms.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(rooms).where(eq(rooms.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "room.deleted",
          resourceType: "room",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),
});

async function setProjectStatus(
  ctx: { orgId: string; actor: string },
  id: string,
  status: "active" | "archived",
) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.orgId, ctx.orgId)))
      .limit(1);
    if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await tx
      .update(projects)
      .set({
        status,
        updatedAt: new Date(),
        updatedBy: ctx.actor,
      })
      .where(eq(projects.id, id))
      .returning();
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actor: ctx.actor,
      action: status === "archived" ? "project.archived" : "project.restored",
      resourceType: "project",
      resourceId: id,
    });
    return updated;
  });
}
