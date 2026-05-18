import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  bills,
  furniture,
  furnitureEvents,
  getDb,
  projects,
  rooms,
  vendors,
} from "@beamy/db";
import {
  furnitureCreateInputSchema,
  furnitureEventCreateInputSchema,
  furnitureEventIdInputSchema,
  furnitureEventListInputSchema,
  furnitureIdInputSchema,
  furnitureListInputSchema,
  furnitureUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `furniture` router — free-standing design pieces (sofas, tables, lamps,
 * rugs). Mirrors the assets router exactly: orgScopedProcedure,
 * transactional mutations with audit, ownership-verified parent rows.
 *
 * Sub-router `events.*` manages the per-piece timeline, with the same
 * "Paid from company account" → bill flow as asset_events.
 */
export const furnitureRouter = router({
  list: orgScopedProcedure
    .input(furnitureListInputSchema)
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
        eq(furniture.projectId, input.projectId),
        eq(furniture.orgId, ctx.orgId),
      ];
      if (input.roomId) conditions.push(eq(furniture.roomId, input.roomId));
      if (input.category)
        conditions.push(eq(furniture.category, input.category));
      if (input.status) conditions.push(eq(furniture.status, input.status));
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(furniture.name, p),
          ilike(furniture.manufacturer, p),
          ilike(furniture.model, p),
          ilike(furniture.designer, p),
          ilike(furniture.material, p),
        );
        if (clause) conditions.push(clause);
      }

      return await db
        .select({
          piece: furniture,
          room: rooms,
          vendor: vendors,
        })
        .from(furniture)
        .leftJoin(rooms, eq(furniture.roomId, rooms.id))
        .leftJoin(vendors, eq(furniture.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(furniture.updatedAt))
        .then((rows) =>
          rows.map((r) => ({ ...r.piece, room: r.room, vendor: r.vendor })),
        );
    }),

  get: orgScopedProcedure
    .input(furnitureIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ piece: furniture, room: rooms, vendor: vendors })
        .from(furniture)
        .leftJoin(rooms, eq(furniture.roomId, rooms.id))
        .leftJoin(vendors, eq(furniture.vendorId, vendors.id))
        .where(and(eq(furniture.id, input.id), eq(furniture.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...row.piece, room: row.room, vendor: row.vendor };
    }),

  create: orgScopedProcedure
    .input(furnitureCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          roomId: input.roomId,
          vendorId: input.vendorId,
        });

        const [row] = await tx
          .insert(furniture)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            roomId: input.roomId ?? null,
            vendorId: input.vendorId ?? null,
            category: input.category,
            status: input.status,
            name: input.name,
            quantity: input.quantity,
            manufacturer: input.manufacturer ?? null,
            model: input.model ?? null,
            dimensions: input.dimensions ?? null,
            material: input.material ?? null,
            finish: input.finish ?? null,
            designer: input.designer ?? null,
            deliveryDate: input.deliveryDate ?? null,
            warrantyExpiresAt: input.warrantyExpiresAt ?? null,
            purchasePriceAmount: input.purchasePriceAmount ?? null,
            purchasePriceCurrency: input.purchasePriceCurrency ?? null,
            productUrl: input.productUrl ?? null,
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
          action: "furniture.created",
          resourceType: "furniture",
          resourceId: row.id,
          payload: input,
        });

        // Auto-seed timeline event when piece arrives delivered/placed
        // with a real delivery date.
        if (
          input.deliveryDate &&
          (input.status === "delivered" || input.status === "placed")
        ) {
          await tx.insert(furnitureEvents).values({
            orgId: ctx.orgId,
            furnitureId: row.id,
            eventType: input.status === "placed" ? "placed" : "delivered",
            occurredAt: input.deliveryDate,
            vendorId: input.vendorId ?? null,
            summary: input.status === "placed" ? "Placed" : "Delivered",
            createdBy: ctx.actor,
          });
        }

        return row;
      });
    }),

  update: orgScopedProcedure
    .input(furnitureUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(furniture)
          .where(
            and(eq(furniture.id, input.id), eq(furniture.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          roomId: input.patch.roomId ?? undefined,
          vendorId: input.patch.vendorId ?? undefined,
        });

        const setClause: Partial<typeof furniture.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.roomId !== undefined) setClause.roomId = p.roomId;
        if (p.vendorId !== undefined) setClause.vendorId = p.vendorId;
        if (p.category !== undefined) setClause.category = p.category;
        if (p.status !== undefined) setClause.status = p.status;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.quantity !== undefined) setClause.quantity = p.quantity;
        if (p.manufacturer !== undefined)
          setClause.manufacturer = p.manufacturer;
        if (p.model !== undefined) setClause.model = p.model;
        if (p.dimensions !== undefined) setClause.dimensions = p.dimensions;
        if (p.material !== undefined) setClause.material = p.material;
        if (p.finish !== undefined) setClause.finish = p.finish;
        if (p.designer !== undefined) setClause.designer = p.designer;
        if (p.deliveryDate !== undefined)
          setClause.deliveryDate = p.deliveryDate;
        if (p.warrantyExpiresAt !== undefined) {
          setClause.warrantyExpiresAt = p.warrantyExpiresAt;
        }
        if (p.purchasePriceAmount !== undefined) {
          setClause.purchasePriceAmount = p.purchasePriceAmount;
        }
        if (p.purchasePriceCurrency !== undefined) {
          setClause.purchasePriceCurrency = p.purchasePriceCurrency;
        }
        if (p.productUrl !== undefined) setClause.productUrl = p.productUrl;
        if (p.photoUrl !== undefined) setClause.photoUrl = p.photoUrl;
        if (p.notes !== undefined) setClause.notes = p.notes;

        const [updated] = await tx
          .update(furniture)
          .set(setClause)
          .where(eq(furniture.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "furniture.updated",
          resourceType: "furniture",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(furnitureIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(furniture)
          .where(
            and(eq(furniture.id, input.id), eq(furniture.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(furniture).where(eq(furniture.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "furniture.deleted",
          resourceType: "furniture",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),

  // ────────────────────── events ──────────────────────

  events: router({
    list: orgScopedProcedure
      .input(furnitureEventListInputSchema)
      .query(async ({ ctx, input }) => {
        const db = getDb();
        const ownsPiece = await db
          .select({ id: furniture.id })
          .from(furniture)
          .where(
            and(
              eq(furniture.id, input.furnitureId),
              eq(furniture.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!ownsPiece[0]) throw new TRPCError({ code: "NOT_FOUND" });

        return await db
          .select({ event: furnitureEvents, vendor: vendors, bill: bills })
          .from(furnitureEvents)
          .leftJoin(vendors, eq(furnitureEvents.vendorId, vendors.id))
          .leftJoin(bills, eq(furnitureEvents.billId, bills.id))
          .where(
            and(
              eq(furnitureEvents.furnitureId, input.furnitureId),
              eq(furnitureEvents.orgId, ctx.orgId),
            ),
          )
          .orderBy(
            desc(furnitureEvents.occurredAt),
            desc(furnitureEvents.createdAt),
          )
          .then((rows) =>
            rows.map((r) => ({ ...r.event, vendor: r.vendor, bill: r.bill })),
          );
      }),

    create: orgScopedProcedure
      .input(furnitureEventCreateInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        return await db.transaction(async (tx) => {
          const parent = await tx
            .select({ id: furniture.id, projectId: furniture.projectId })
            .from(furniture)
            .where(
              and(
                eq(furniture.id, input.furnitureId),
                eq(furniture.orgId, ctx.orgId),
              ),
            )
            .limit(1);
          if (!parent[0]) throw new TRPCError({ code: "NOT_FOUND" });

          if (input.vendorId) {
            const ok = await tx
              .select({ id: vendors.id })
              .from(vendors)
              .where(
                and(eq(vendors.id, input.vendorId), eq(vendors.orgId, ctx.orgId)),
              )
              .limit(1);
            if (!ok[0]) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Vendor not found in this org",
              });
            }
          }

          let billId: string | null = null;
          if (input.trackInFinance && input.costAmount && input.costCurrency) {
            const [billRow] = await tx
              .insert(bills)
              .values({
                orgId: ctx.orgId,
                projectId: parent[0].projectId,
                vendorId: input.vendorId ?? null,
                description: input.summary,
                amount: input.costAmount,
                currency: input.costCurrency,
                issuedAt: input.occurredAt,
                paidAt: input.occurredAt,
                status: "paid",
                notes: input.notes ?? null,
                createdBy: ctx.actor,
                updatedBy: ctx.actor,
              })
              .returning();
            if (!billRow) {
              throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
            }
            billId = billRow.id;
            await tx.insert(auditLog).values({
              orgId: ctx.orgId,
              actor: ctx.actor,
              action: "bill.created",
              resourceType: "bill",
              resourceId: billRow.id,
              payload: { from: "furniture_event", ...billRow },
            });
          }

          const [row] = await tx
            .insert(furnitureEvents)
            .values({
              orgId: ctx.orgId,
              furnitureId: input.furnitureId,
              eventType: input.eventType,
              occurredAt: input.occurredAt,
              vendorId: input.vendorId ?? null,
              costAmount: input.costAmount ?? null,
              costCurrency: input.costCurrency ?? null,
              billId,
              summary: input.summary,
              notes: input.notes ?? null,
              createdBy: ctx.actor,
            })
            .returning();
          if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

          await tx.insert(auditLog).values({
            orgId: ctx.orgId,
            actor: ctx.actor,
            action: "furniture_event.created",
            resourceType: "furniture_event",
            resourceId: row.id,
            payload: input,
          });
          return row;
        });
      }),

    remove: orgScopedProcedure
      .input(furnitureEventIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        return await db.transaction(async (tx) => {
          const existing = await tx
            .select()
            .from(furnitureEvents)
            .where(
              and(
                eq(furnitureEvents.id, input.id),
                eq(furnitureEvents.orgId, ctx.orgId),
              ),
            )
            .limit(1);
          if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

          await tx
            .delete(furnitureEvents)
            .where(eq(furnitureEvents.id, input.id));

          // Cascade-remove linked self-purchase bill.
          if (existing[0].billId) {
            await tx
              .delete(bills)
              .where(
                and(
                  eq(bills.id, existing[0].billId),
                  eq(bills.orgId, ctx.orgId),
                ),
              );
          }

          await tx.insert(auditLog).values({
            orgId: ctx.orgId,
            actor: ctx.actor,
            action: "furniture_event.deleted",
            resourceType: "furniture_event",
            resourceId: input.id,
            payload: existing[0],
          });
          return { ok: true as const };
        });
      }),
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
    if (!ok[0])
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Project not found in this org",
      });
  }
  if (refs.roomId) {
    const ok = await tx
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.id, refs.roomId), eq(rooms.orgId, orgId)))
      .limit(1);
    if (!ok[0])
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Room not found in this org",
      });
  }
  if (refs.vendorId) {
    const ok = await tx
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, refs.vendorId), eq(vendors.orgId, orgId)))
      .limit(1);
    if (!ok[0])
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Vendor not found in this org",
      });
  }
}
