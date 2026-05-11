import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  assets,
  auditLog,
  getDb,
  projects,
  rooms,
  vendors,
} from "@beamy/db";
import {
  assetCreateInputSchema,
  assetIdInputSchema,
  assetListInputSchema,
  assetUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `assets` router — per-instance physical items installed on a project.
 *
 * Same pattern as projects: orgScopedProcedure, transactional mutations
 * with audit_log writes, parent ownership (project / room / vendor)
 * verified inside the org before mutating.
 */
export const assetsRouter = router({
  list: orgScopedProcedure
    .input(assetListInputSchema)
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
        eq(assets.projectId, input.projectId),
        eq(assets.orgId, ctx.orgId),
      ];
      if (input.roomId) conditions.push(eq(assets.roomId, input.roomId));
      if (input.category) conditions.push(eq(assets.category, input.category));
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(assets.name, p),
          ilike(assets.manufacturer, p),
          ilike(assets.model, p),
          ilike(assets.serialNumber, p),
        );
        if (clause) conditions.push(clause);
      }

      return await db
        .select({
          asset: assets,
          room: rooms,
          vendor: vendors,
        })
        .from(assets)
        .leftJoin(rooms, eq(assets.roomId, rooms.id))
        .leftJoin(vendors, eq(assets.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(assets.updatedAt))
        .then((rows) =>
          rows.map((r) => ({ ...r.asset, room: r.room, vendor: r.vendor })),
        );
    }),

  get: orgScopedProcedure
    .input(assetIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ asset: assets, room: rooms, vendor: vendors })
        .from(assets)
        .leftJoin(rooms, eq(assets.roomId, rooms.id))
        .leftJoin(vendors, eq(assets.vendorId, vendors.id))
        .where(and(eq(assets.id, input.id), eq(assets.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...row.asset, room: row.room, vendor: row.vendor };
    }),

  create: orgScopedProcedure
    .input(assetCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          roomId: input.roomId,
          vendorId: input.vendorId,
        });

        const [row] = await tx
          .insert(assets)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            roomId: input.roomId ?? null,
            vendorId: input.vendorId ?? null,
            category: input.category,
            name: input.name,
            manufacturer: input.manufacturer ?? null,
            model: input.model ?? null,
            serialNumber: input.serialNumber ?? null,
            installDate: input.installDate ?? null,
            warrantyExpiresAt: input.warrantyExpiresAt ?? null,
            purchasePriceAmount: input.purchasePriceAmount ?? null,
            purchasePriceCurrency: input.purchasePriceCurrency ?? null,
            photoUrl: input.photoUrl ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "asset.created",
          resourceType: "asset",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(assetUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(assets)
          .where(and(eq(assets.id, input.id), eq(assets.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          roomId: input.patch.roomId ?? undefined,
          vendorId: input.patch.vendorId ?? undefined,
        });

        const setClause: Partial<typeof assets.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.roomId !== undefined) setClause.roomId = p.roomId;
        if (p.vendorId !== undefined) setClause.vendorId = p.vendorId;
        if (p.category !== undefined) setClause.category = p.category;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.manufacturer !== undefined) setClause.manufacturer = p.manufacturer;
        if (p.model !== undefined) setClause.model = p.model;
        if (p.serialNumber !== undefined) setClause.serialNumber = p.serialNumber;
        if (p.installDate !== undefined) setClause.installDate = p.installDate;
        if (p.warrantyExpiresAt !== undefined) {
          setClause.warrantyExpiresAt = p.warrantyExpiresAt;
        }
        if (p.purchasePriceAmount !== undefined) {
          setClause.purchasePriceAmount = p.purchasePriceAmount;
        }
        if (p.purchasePriceCurrency !== undefined) {
          setClause.purchasePriceCurrency = p.purchasePriceCurrency;
        }
        if (p.photoUrl !== undefined) setClause.photoUrl = p.photoUrl;
        if (p.notes !== undefined) setClause.notes = p.notes;

        const [updated] = await tx
          .update(assets)
          .set(setClause)
          .where(eq(assets.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "asset.updated",
          resourceType: "asset",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(assetIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(assets)
          .where(and(eq(assets.id, input.id), eq(assets.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(assets).where(eq(assets.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "asset.deleted",
          resourceType: "asset",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),
});

// Verify each referenced parent row (project / room / vendor) belongs to
// this org. Defensive — RLS doesn't exist yet, so this is the guard.
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

