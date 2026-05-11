import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  getDb,
  projects,
  rooms,
  specItems,
  vendors,
} from "@beamy/db";
import {
  specCreateInputSchema,
  specIdInputSchema,
  specListInputSchema,
  specTransitionInputSchema,
  specUpdateInputSchema,
  type SpecState,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `specs` router — planning + procurement layer. Standard CRUD plus a
 * `transition` endpoint that moves a spec through its lifecycle and
 * stamps the appropriate date column automatically.
 *
 * Same multi-tenancy pattern as the other entity routers:
 * orgScopedProcedure, transactional mutations with audit_log writes,
 * parent ownership (project / room / vendor) verified.
 */
export const specsRouter = router({
  list: orgScopedProcedure
    .input(specListInputSchema)
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
        eq(specItems.projectId, input.projectId),
        eq(specItems.orgId, ctx.orgId),
      ];
      if (input.roomId) conditions.push(eq(specItems.roomId, input.roomId));
      if (input.state) conditions.push(eq(specItems.state, input.state));
      if (input.specType) {
        conditions.push(eq(specItems.specType, input.specType));
      }
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(specItems.name, p),
          ilike(specItems.description, p),
          ilike(specItems.category, p),
        );
        if (clause) conditions.push(clause);
      }

      return await db
        .select({ spec: specItems, room: rooms, vendor: vendors })
        .from(specItems)
        .leftJoin(rooms, eq(specItems.roomId, rooms.id))
        .leftJoin(vendors, eq(specItems.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(specItems.updatedAt))
        .then((rows) =>
          rows.map((r) => ({ ...r.spec, room: r.room, vendor: r.vendor })),
        );
    }),

  get: orgScopedProcedure
    .input(specIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ spec: specItems, room: rooms, vendor: vendors })
        .from(specItems)
        .leftJoin(rooms, eq(specItems.roomId, rooms.id))
        .leftJoin(vendors, eq(specItems.vendorId, vendors.id))
        .where(
          and(eq(specItems.id, input.id), eq(specItems.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...row.spec, room: row.room, vendor: row.vendor };
    }),

  create: orgScopedProcedure
    .input(specCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          roomId: input.roomId,
          vendorId: input.vendorId,
        });

        const [row] = await tx
          .insert(specItems)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            roomId: input.roomId ?? null,
            vendorId: input.vendorId ?? null,
            specType: input.specType,
            category: input.category ?? null,
            name: input.name,
            description: input.description ?? null,
            state: input.state,
            catalogPriceAmount: input.catalogPriceAmount ?? null,
            catalogPriceCurrency: input.catalogPriceCurrency ?? null,
            clientPriceAmount: input.clientPriceAmount ?? null,
            clientPriceCurrency: input.clientPriceCurrency ?? null,
            approvedAt: input.approvedAt ?? null,
            orderedAt: input.orderedAt ?? null,
            receivedAt: input.receivedAt ?? null,
            installedAt: input.installedAt ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "spec.created",
          resourceType: "spec_item",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(specUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(specItems)
          .where(
            and(eq(specItems.id, input.id), eq(specItems.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          roomId: input.patch.roomId ?? undefined,
          vendorId: input.patch.vendorId ?? undefined,
        });

        const setClause: Partial<typeof specItems.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.roomId !== undefined) setClause.roomId = p.roomId;
        if (p.vendorId !== undefined) setClause.vendorId = p.vendorId;
        if (p.specType !== undefined) setClause.specType = p.specType;
        if (p.category !== undefined) setClause.category = p.category;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.description !== undefined) setClause.description = p.description;
        if (p.state !== undefined) setClause.state = p.state;
        if (p.catalogPriceAmount !== undefined) {
          setClause.catalogPriceAmount = p.catalogPriceAmount;
        }
        if (p.catalogPriceCurrency !== undefined) {
          setClause.catalogPriceCurrency = p.catalogPriceCurrency;
        }
        if (p.clientPriceAmount !== undefined) {
          setClause.clientPriceAmount = p.clientPriceAmount;
        }
        if (p.clientPriceCurrency !== undefined) {
          setClause.clientPriceCurrency = p.clientPriceCurrency;
        }
        if (p.approvedAt !== undefined) setClause.approvedAt = p.approvedAt;
        if (p.orderedAt !== undefined) setClause.orderedAt = p.orderedAt;
        if (p.receivedAt !== undefined) setClause.receivedAt = p.receivedAt;
        if (p.installedAt !== undefined) setClause.installedAt = p.installedAt;
        if (p.notes !== undefined) setClause.notes = p.notes;

        const [updated] = await tx
          .update(specItems)
          .set(setClause)
          .where(eq(specItems.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "spec.updated",
          resourceType: "spec_item",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  /**
   * Move a spec through its lifecycle. The corresponding date column is
   * stamped automatically (today by default; caller can override with
   * `at`). No state-machine guard here — any state→any state allowed in
   * v1, matching the freeform nature of small-firm procurement. The
   * audit_log row makes the trail.
   */
  transition: orgScopedProcedure
    .input(specTransitionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(specItems)
          .where(
            and(eq(specItems.id, input.id), eq(specItems.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const stampDate = input.at ?? todayIso();
        const dateCol = dateColumnForState(input.to);

        const setClause: Partial<typeof specItems.$inferInsert> = {
          state: input.to,
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        if (dateCol) setClause[dateCol] = stampDate;

        const [updated] = await tx
          .update(specItems)
          .set(setClause)
          .where(eq(specItems.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: `spec.transitioned.${input.to}`,
          resourceType: "spec_item",
          resourceId: input.id,
          payload: { from: existing[0].state, to: input.to, at: stampDate },
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(specIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(specItems)
          .where(
            and(eq(specItems.id, input.id), eq(specItems.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(specItems).where(eq(specItems.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "spec.deleted",
          resourceType: "spec_item",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Map a target state to the column that records when it was reached.
 * `specified` has no date (creation timestamp covers it); `cancelled`
 * also has no dedicated column.
 */
function dateColumnForState(
  state: SpecState,
): "approvedAt" | "orderedAt" | "receivedAt" | "installedAt" | null {
  switch (state) {
    case "client_approved":
      return "approvedAt";
    case "ordered":
      return "orderedAt";
    case "received":
      return "receivedAt";
    case "installed":
      return "installedAt";
    default:
      return null;
  }
}

async function verifyOwnership(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  orgId: string,
  refs: { projectId?: string; roomId?: string; vendorId?: string },
) {
  if (refs.projectId) {
    const ok = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, refs.projectId), eq(projects.orgId, orgId)))
      .limit(1);
    if (!ok[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Project not found in this org",
      });
    }
  }
  if (refs.roomId) {
    const ok = await tx
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.id, refs.roomId), eq(rooms.orgId, orgId)))
      .limit(1);
    if (!ok[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Room not found in this org",
      });
    }
  }
  if (refs.vendorId) {
    const ok = await tx
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, refs.vendorId), eq(vendors.orgId, orgId)))
      .limit(1);
    if (!ok[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Vendor not found in this org",
      });
    }
  }
}
