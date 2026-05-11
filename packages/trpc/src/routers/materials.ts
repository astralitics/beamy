import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  getDb,
  materials,
  projects,
  rooms,
  vendors,
} from "@beamy/db";
import {
  materialCreateInputSchema,
  materialIdInputSchema,
  materialListInputSchema,
  materialUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `materials` router — per-batch identity for things tracked by lot
 * (paint, tile, flooring). Mirrors the assets router shape; differs in
 * what's stored (lot numbers, quantity + unit, attic stock).
 */
export const materialsRouter = router({
  list: orgScopedProcedure
    .input(materialListInputSchema)
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
        eq(materials.projectId, input.projectId),
        eq(materials.orgId, ctx.orgId),
      ];
      if (input.roomId) conditions.push(eq(materials.roomId, input.roomId));
      if (input.category) {
        conditions.push(eq(materials.category, input.category));
      }
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(materials.name, p),
          ilike(materials.manufacturer, p),
          ilike(materials.productCode, p),
          ilike(materials.colorName, p),
          ilike(materials.lotNumber, p),
        );
        if (clause) conditions.push(clause);
      }

      return await db
        .select({
          material: materials,
          room: rooms,
          vendor: vendors,
        })
        .from(materials)
        .leftJoin(rooms, eq(materials.roomId, rooms.id))
        .leftJoin(vendors, eq(materials.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(materials.updatedAt))
        .then((rows) =>
          rows.map((r) => ({ ...r.material, room: r.room, vendor: r.vendor })),
        );
    }),

  get: orgScopedProcedure
    .input(materialIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ material: materials, room: rooms, vendor: vendors })
        .from(materials)
        .leftJoin(rooms, eq(materials.roomId, rooms.id))
        .leftJoin(vendors, eq(materials.vendorId, vendors.id))
        .where(and(eq(materials.id, input.id), eq(materials.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...row.material, room: row.room, vendor: row.vendor };
    }),

  create: orgScopedProcedure
    .input(materialCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          roomId: input.roomId,
          vendorId: input.vendorId,
        });

        const [row] = await tx
          .insert(materials)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            roomId: input.roomId ?? null,
            vendorId: input.vendorId ?? null,
            category: input.category,
            name: input.name,
            manufacturer: input.manufacturer ?? null,
            productCode: input.productCode ?? null,
            colorName: input.colorName ?? null,
            lotNumber: input.lotNumber ?? null,
            quantity: input.quantity ?? null,
            quantityUnit: input.quantityUnit ?? null,
            atticStockQuantity: input.atticStockQuantity ?? null,
            atticStockLocation: input.atticStockLocation ?? null,
            coverageNotes: input.coverageNotes ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "material.created",
          resourceType: "material",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(materialUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(materials)
          .where(
            and(eq(materials.id, input.id), eq(materials.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          roomId: input.patch.roomId ?? undefined,
          vendorId: input.patch.vendorId ?? undefined,
        });

        const setClause: Partial<typeof materials.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.roomId !== undefined) setClause.roomId = p.roomId;
        if (p.vendorId !== undefined) setClause.vendorId = p.vendorId;
        if (p.category !== undefined) setClause.category = p.category;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.manufacturer !== undefined) setClause.manufacturer = p.manufacturer;
        if (p.productCode !== undefined) setClause.productCode = p.productCode;
        if (p.colorName !== undefined) setClause.colorName = p.colorName;
        if (p.lotNumber !== undefined) setClause.lotNumber = p.lotNumber;
        if (p.quantity !== undefined) setClause.quantity = p.quantity;
        if (p.quantityUnit !== undefined) setClause.quantityUnit = p.quantityUnit;
        if (p.atticStockQuantity !== undefined) {
          setClause.atticStockQuantity = p.atticStockQuantity;
        }
        if (p.atticStockLocation !== undefined) {
          setClause.atticStockLocation = p.atticStockLocation;
        }
        if (p.coverageNotes !== undefined) {
          setClause.coverageNotes = p.coverageNotes;
        }
        if (p.notes !== undefined) setClause.notes = p.notes;

        const [updated] = await tx
          .update(materials)
          .set(setClause)
          .where(eq(materials.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "material.updated",
          resourceType: "material",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(materialIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(materials)
          .where(
            and(eq(materials.id, input.id), eq(materials.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(materials).where(eq(materials.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "material.deleted",
          resourceType: "material",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),
});

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
