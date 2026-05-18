import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  assetEvents,
  assets,
  auditLog,
  bills,
  getDb,
  projects,
  rooms,
  vendors,
} from "@beamy/db";
import {
  assetCreateInputSchema,
  assetEventCreateInputSchema,
  assetEventIdInputSchema,
  assetEventListInputSchema,
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
 *
 * Sub-procedures under `events.*` manage the asset's user-facing
 * timeline (`asset_events` table).
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
      if (input.status) conditions.push(eq(assets.status, input.status));
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
            status: input.status,
            name: input.name,
            manufacturer: input.manufacturer ?? null,
            model: input.model ?? null,
            serialNumber: input.serialNumber ?? null,
            installDate: input.installDate ?? null,
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
          action: "asset.created",
          resourceType: "asset",
          resourceId: row.id,
          payload: input,
        });

        // Auto-seed the timeline with an "installed" event when the asset
        // is created with a real installDate. Mirrors the natural moment
        // someone enters an asset they've just installed.
        if (input.installDate && input.status === "installed") {
          await tx.insert(assetEvents).values({
            orgId: ctx.orgId,
            assetId: row.id,
            eventType: "installed",
            occurredAt: input.installDate,
            vendorId: input.vendorId ?? null,
            summary: "Installed",
            createdBy: ctx.actor,
          });
        }
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
        if (p.status !== undefined) setClause.status = p.status;
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
        if (p.productUrl !== undefined) setClause.productUrl = p.productUrl;
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

  // ────────────────────── events ──────────────────────

  events: router({
    list: orgScopedProcedure
      .input(assetEventListInputSchema)
      .query(async ({ ctx, input }) => {
        const db = getDb();
        const ownsAsset = await db
          .select({ id: assets.id })
          .from(assets)
          .where(and(eq(assets.id, input.assetId), eq(assets.orgId, ctx.orgId)))
          .limit(1);
        if (!ownsAsset[0]) throw new TRPCError({ code: "NOT_FOUND" });

        return await db
          .select({ event: assetEvents, vendor: vendors, bill: bills })
          .from(assetEvents)
          .leftJoin(vendors, eq(assetEvents.vendorId, vendors.id))
          .leftJoin(bills, eq(assetEvents.billId, bills.id))
          .where(
            and(
              eq(assetEvents.assetId, input.assetId),
              eq(assetEvents.orgId, ctx.orgId),
            ),
          )
          .orderBy(desc(assetEvents.occurredAt), desc(assetEvents.createdAt))
          .then((rows) =>
            rows.map((r) => ({ ...r.event, vendor: r.vendor, bill: r.bill })),
          );
      }),

    create: orgScopedProcedure
      .input(assetEventCreateInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        return await db.transaction(async (tx) => {
          // Need the parent asset's projectId for the optional bill row.
          const parent = await tx
            .select({ id: assets.id, projectId: assets.projectId })
            .from(assets)
            .where(
              and(eq(assets.id, input.assetId), eq(assets.orgId, ctx.orgId)),
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

          // If the user asked to track this in finance, create a paid
          // bill first (no vendor, paid immediately) and link it via
          // bill_id. Zod already enforced that cost+currency are set.
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
              payload: { from: "asset_event", ...billRow },
            });
          }

          const [row] = await tx
            .insert(assetEvents)
            .values({
              orgId: ctx.orgId,
              assetId: input.assetId,
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
            action: "asset_event.created",
            resourceType: "asset_event",
            resourceId: row.id,
            payload: input,
          });
          return row;
        });
      }),

    remove: orgScopedProcedure
      .input(assetEventIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        return await db.transaction(async (tx) => {
          const existing = await tx
            .select()
            .from(assetEvents)
            .where(
              and(
                eq(assetEvents.id, input.id),
                eq(assetEvents.orgId, ctx.orgId),
              ),
            )
            .limit(1);
          if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

          await tx
            .delete(assetEvents)
            .where(eq(assetEvents.id, input.id));

          // Cascade-remove the linked self-purchase bill. These bills
          // only exist because of this event, so they shouldn't survive
          // it. (Real vendor invoices arrive via /bills directly and
          // never get a bill_id back-reference here, so the cleanup is
          // scoped correctly.)
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
            action: "asset_event.deleted",
            resourceType: "asset_event",
            resourceId: input.id,
            payload: existing[0],
          });
          return { ok: true as const };
        });
      }),
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
