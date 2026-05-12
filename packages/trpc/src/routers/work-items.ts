import { and, asc, desc, eq, ilike, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  bids,
  getDb,
  projects,
  rooms,
  vendors,
  workItemRooms,
  workItems,
} from "@beamy/db";
import {
  workItemCreateInputSchema,
  workItemIdInputSchema,
  workItemListInputSchema,
  workItemTransitionInputSchema,
  workItemUpdateInputSchema,
  type WorkItemStatus,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * work_items — execution unit. CRUD + a `transition` endpoint that
 * stamps actual_start / actual_end automatically when the row crosses
 * into in_progress / done.
 *
 * The list endpoint returns each item joined with its rooms[],
 * bid (shallow), and vendor (shallow). The Work Plan tab table
 * renders directly from this shape.
 */
export const workItemsRouter = router({
  list: orgScopedProcedure
    .input(workItemListInputSchema)
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
        eq(workItems.projectId, input.projectId),
        eq(workItems.orgId, ctx.orgId),
      ];
      if (input.status) conditions.push(eq(workItems.status, input.status));
      if (input.trade) conditions.push(eq(workItems.trade, input.trade));
      if (input.vendorId) {
        conditions.push(eq(workItems.vendorId, input.vendorId));
      }
      if (input.bidId) {
        conditions.push(eq(workItems.bidId, input.bidId));
      }
      if (input.overdue) {
        const today = new Date().toISOString().slice(0, 10);
        conditions.push(lt(workItems.plannedEnd, today));
      }
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(workItems.description, p),
          ilike(workItems.ref, p),
          ilike(workItems.trade, p),
          ilike(workItems.notes, p),
        );
        if (clause) conditions.push(clause);
      }

      // Room filter narrows to items that have a join row for that room.
      if (input.roomId) {
        const matchingIds = await db
          .select({ workItemId: workItemRooms.workItemId })
          .from(workItemRooms)
          .where(eq(workItemRooms.roomId, input.roomId));
        const ids = matchingIds.map((r) => r.workItemId);
        if (ids.length === 0) return [];
        conditions.push(inArray(workItems.id, ids));
      }

      const items = await db
        .select({ item: workItems, vendor: vendors, bid: bids })
        .from(workItems)
        .leftJoin(vendors, eq(workItems.vendorId, vendors.id))
        .leftJoin(bids, eq(workItems.bidId, bids.id))
        .where(and(...conditions))
        .orderBy(
          asc(workItems.status),
          asc(workItems.plannedEnd),
          desc(workItems.updatedAt),
        );

      if (items.length === 0) return [];

      const itemIds = items.map((r) => r.item.id);
      const roomLinks = await db
        .select({
          workItemId: workItemRooms.workItemId,
          room: rooms,
        })
        .from(workItemRooms)
        .innerJoin(rooms, eq(workItemRooms.roomId, rooms.id))
        .where(inArray(workItemRooms.workItemId, itemIds));

      const roomsByItem = new Map<string, (typeof rooms.$inferSelect)[]>();
      for (const link of roomLinks) {
        const arr = roomsByItem.get(link.workItemId) ?? [];
        arr.push(link.room);
        roomsByItem.set(link.workItemId, arr);
      }

      return items.map((r) => ({
        ...r.item,
        vendor: r.vendor,
        bid: r.bid,
        rooms: roomsByItem.get(r.item.id) ?? [],
      }));
    }),

  get: orgScopedProcedure
    .input(workItemIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ item: workItems, vendor: vendors, bid: bids })
        .from(workItems)
        .leftJoin(vendors, eq(workItems.vendorId, vendors.id))
        .leftJoin(bids, eq(workItems.bidId, bids.id))
        .where(
          and(eq(workItems.id, input.id), eq(workItems.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const roomLinks = await db
        .select({ room: rooms })
        .from(workItemRooms)
        .innerJoin(rooms, eq(workItemRooms.roomId, rooms.id))
        .where(eq(workItemRooms.workItemId, input.id));

      return {
        ...row.item,
        vendor: row.vendor,
        bid: row.bid,
        rooms: roomLinks.map((r) => r.room),
      };
    }),

  /**
   * Trade distinct values, scoped to a project. Powers the trade
   * filter dropdown on the Plan tab.
   */
  listTrades: orgScopedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .selectDistinct({ trade: workItems.trade })
        .from(workItems)
        .where(
          and(
            eq(workItems.projectId, input.projectId),
            eq(workItems.orgId, ctx.orgId),
          ),
        );
      return rows
        .map((r) => r.trade)
        .filter((t): t is string => t != null)
        .sort();
    }),

  create: orgScopedProcedure
    .input(workItemCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          bidId: input.bidId,
          vendorId: input.vendorId,
          roomIds: input.roomIds,
        });

        const [row] = await tx
          .insert(workItems)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            bidId: input.bidId ?? null,
            vendorId: input.vendorId ?? null,
            trade: input.trade ?? null,
            ref: input.ref ?? null,
            description: input.description,
            qty: input.qty ?? null,
            unit: input.unit ?? null,
            unitPriceAmount: input.unitPriceAmount ?? null,
            unitPriceCurrency: input.unitPriceCurrency ?? null,
            totalAmount: input.totalAmount ?? null,
            totalCurrency: input.totalCurrency ?? null,
            status: input.status,
            plannedStart: input.plannedStart ?? null,
            plannedEnd: input.plannedEnd ?? null,
            actualStart: input.actualStart ?? null,
            actualEnd: input.actualEnd ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        if (input.roomIds.length > 0) {
          await tx.insert(workItemRooms).values(
            input.roomIds.map((roomId) => ({
              workItemId: row.id,
              roomId,
            })),
          );
        }

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "work_item.created",
          resourceType: "work_item",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(workItemUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(workItems)
          .where(
            and(eq(workItems.id, input.id), eq(workItems.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          bidId: input.patch.bidId ?? undefined,
          vendorId: input.patch.vendorId ?? undefined,
          roomIds: input.patch.roomIds,
        });

        const setClause: Partial<typeof workItems.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.bidId !== undefined) setClause.bidId = p.bidId;
        if (p.vendorId !== undefined) setClause.vendorId = p.vendorId;
        if (p.trade !== undefined) setClause.trade = p.trade;
        if (p.ref !== undefined) setClause.ref = p.ref;
        if (p.description !== undefined) setClause.description = p.description;
        if (p.qty !== undefined) setClause.qty = p.qty;
        if (p.unit !== undefined) setClause.unit = p.unit;
        if (p.unitPriceAmount !== undefined) {
          setClause.unitPriceAmount = p.unitPriceAmount;
        }
        if (p.unitPriceCurrency !== undefined) {
          setClause.unitPriceCurrency = p.unitPriceCurrency;
        }
        if (p.totalAmount !== undefined) setClause.totalAmount = p.totalAmount;
        if (p.totalCurrency !== undefined) {
          setClause.totalCurrency = p.totalCurrency;
        }
        if (p.clientMarkupPct !== undefined) {
          setClause.clientMarkupPct = p.clientMarkupPct;
        }
        if (p.clientUnitPrice !== undefined) {
          setClause.clientUnitPrice = p.clientUnitPrice;
        }
        if (p.clientTotal !== undefined) setClause.clientTotal = p.clientTotal;
        if (p.clientCurrency !== undefined) {
          setClause.clientCurrency = p.clientCurrency;
        }
        if (p.status !== undefined) setClause.status = p.status;
        if (p.plannedStart !== undefined) {
          setClause.plannedStart = p.plannedStart;
        }
        if (p.plannedEnd !== undefined) setClause.plannedEnd = p.plannedEnd;
        if (p.actualStart !== undefined) setClause.actualStart = p.actualStart;
        if (p.actualEnd !== undefined) setClause.actualEnd = p.actualEnd;
        if (p.notes !== undefined) setClause.notes = p.notes;

        const [updated] = await tx
          .update(workItems)
          .set(setClause)
          .where(eq(workItems.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Replace room set if patch.roomIds was provided.
        if (p.roomIds !== undefined) {
          await tx
            .delete(workItemRooms)
            .where(eq(workItemRooms.workItemId, input.id));
          if (p.roomIds.length > 0) {
            await tx.insert(workItemRooms).values(
              p.roomIds.map((roomId) => ({
                workItemId: input.id,
                roomId,
              })),
            );
          }
        }

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "work_item.updated",
          resourceType: "work_item",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  transition: orgScopedProcedure
    .input(workItemTransitionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(workItems)
          .where(
            and(eq(workItems.id, input.id), eq(workItems.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const stampDate = input.at ?? todayIso();
        const dateCol = dateColumnForStatus(input.to);

        const setClause: Partial<typeof workItems.$inferInsert> = {
          status: input.to,
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        if (dateCol) setClause[dateCol] = stampDate;

        const [updated] = await tx
          .update(workItems)
          .set(setClause)
          .where(eq(workItems.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: `work_item.transitioned.${input.to}`,
          resourceType: "work_item",
          resourceId: input.id,
          payload: { from: existing[0].status, to: input.to, at: stampDate },
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(workItemIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(workItems)
          .where(
            and(eq(workItems.id, input.id), eq(workItems.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(workItems).where(eq(workItems.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "work_item.deleted",
          resourceType: "work_item",
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
 * Stamp actual_start when entering in_progress; actual_end when
 * entering done. Other transitions don't auto-stamp a date — they're
 * tracked through the audit_log instead.
 */
function dateColumnForStatus(
  status: WorkItemStatus,
): "actualStart" | "actualEnd" | null {
  switch (status) {
    case "in_progress":
      return "actualStart";
    case "done":
      return "actualEnd";
    default:
      return null;
  }
}

async function verifyOwnership(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  orgId: string,
  refs: {
    projectId?: string;
    bidId?: string | null;
    vendorId?: string | null;
    roomIds?: string[];
  },
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
  if (refs.bidId) {
    const ok = await tx
      .select({ id: bids.id })
      .from(bids)
      .where(
        and(eq(bids.id, refs.bidId), eq(bids.orgId, orgId)),
      )
      .limit(1);
    if (!ok[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Bid not found in this org",
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
  if (refs.roomIds && refs.roomIds.length > 0) {
    const found = await tx
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(inArray(rooms.id, refs.roomIds), eq(rooms.orgId, orgId)));
    if (found.length !== refs.roomIds.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "One or more rooms not found in this org",
      });
    }
  }
}
