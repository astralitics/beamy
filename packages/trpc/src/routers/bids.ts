import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  bidPackages,
  bids,
  getDb,
  projects,
  vendors,
  workItems,
} from "@beamy/db";
import {
  bidAwardInputSchema,
  bidCreateInputSchema,
  bidIdInputSchema,
  bidListInputSchema,
  bidUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * bids — inbound subcontractor side. CRUD only in this PR; the
 * accept/reject UX that propagates to child work_items lives in a
 * follow-up. Same patterns as the other routers: orgScoped, audit
 * trail, parent ownership verified.
 */
export const bidsRouter = router({
  list: orgScopedProcedure
    .input(bidListInputSchema)
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
        eq(bids.projectId, input.projectId),
        eq(bids.orgId, ctx.orgId),
      ];
      if (input.status) conditions.push(eq(bids.status, input.status));
      if (input.vendorId) {
        conditions.push(eq(bids.vendorId, input.vendorId));
      }
      if (input.packageId) {
        conditions.push(eq(bids.packageId, input.packageId));
      }
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(bids.bidNumber, p),
          ilike(bids.trade, p),
          ilike(bids.notes, p),
        );
        if (clause) conditions.push(clause);
      }

      return await db
        .select({ bid: bids, vendor: vendors, package: bidPackages })
        .from(bids)
        .leftJoin(vendors, eq(bids.vendorId, vendors.id))
        .leftJoin(bidPackages, eq(bids.packageId, bidPackages.id))
        .where(and(...conditions))
        .orderBy(desc(bids.updatedAt))
        .then((rows) =>
          rows.map((r) => ({ ...r.bid, vendor: r.vendor, package: r.package })),
        );
    }),

  get: orgScopedProcedure
    .input(bidIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ bid: bids, vendor: vendors, package: bidPackages })
        .from(bids)
        .leftJoin(vendors, eq(bids.vendorId, vendors.id))
        .leftJoin(bidPackages, eq(bids.packageId, bidPackages.id))
        .where(and(eq(bids.id, input.id), eq(bids.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...row.bid, vendor: row.vendor, package: row.package };
    }),

  create: orgScopedProcedure
    .input(bidCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          vendorId: input.vendorId,
          packageId: input.packageId,
        });

        const [row] = await tx
          .insert(bids)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            vendorId: input.vendorId ?? null,
            packageId: input.packageId ?? null,
            trade: input.trade ?? null,
            bidNumber: input.bidNumber ?? null,
            bidDate: input.bidDate ?? null,
            validUntil: input.validUntil ?? null,
            subtotalAmount: input.subtotalAmount ?? null,
            ivaAmount: input.ivaAmount ?? null,
            totalAmount: input.totalAmount ?? null,
            currency: input.currency ?? null,
            ivaIncluded: input.ivaIncluded,
            status: input.status,
            decidedAt: input.decidedAt ?? null,
            flags: input.flags,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bid.created",
          resourceType: "bid",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(bidUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(bids)
          .where(and(eq(bids.id, input.id), eq(bids.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          vendorId: input.patch.vendorId ?? undefined,
          packageId: input.patch.packageId ?? undefined,
        });

        const setClause: Partial<typeof bids.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.vendorId !== undefined) setClause.vendorId = p.vendorId;
        if (p.packageId !== undefined) setClause.packageId = p.packageId;
        if (p.trade !== undefined) setClause.trade = p.trade;
        if (p.bidNumber !== undefined) setClause.bidNumber = p.bidNumber;
        if (p.bidDate !== undefined) setClause.bidDate = p.bidDate;
        if (p.validUntil !== undefined) setClause.validUntil = p.validUntil;
        if (p.subtotalAmount !== undefined) {
          setClause.subtotalAmount = p.subtotalAmount;
        }
        if (p.ivaAmount !== undefined) setClause.ivaAmount = p.ivaAmount;
        if (p.totalAmount !== undefined) setClause.totalAmount = p.totalAmount;
        if (p.currency !== undefined) setClause.currency = p.currency;
        if (p.ivaIncluded !== undefined) setClause.ivaIncluded = p.ivaIncluded;
        if (p.status !== undefined) setClause.status = p.status;
        if (p.decidedAt !== undefined) setClause.decidedAt = p.decidedAt;
        if (p.flags !== undefined) setClause.flags = p.flags;
        if (p.notes !== undefined) setClause.notes = p.notes;

        const [updated] = await tx
          .update(bids)
          .set(setClause)
          .where(eq(bids.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bid.updated",
          resourceType: "bid",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  /**
   * Award a bid. Three side effects:
   *
   *   1. Winner: bid.status → accepted, decidedAt = today.
   *   2. Linked work_items: all rows where bidId = winner.id flip from
   *      "specified" → "approved" (or stay where they are if already
   *      past approved — scheduled/in_progress/done/accepted/cancelled).
   *      This is what promotes the bid's lines into the live Plan.
   *   3. Package (if any): siblings → rejected, package → awarded.
   */
  award: orgScopedProcedure
    .input(bidAwardInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(bids)
          .where(and(eq(bids.id, input.id), eq(bids.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });
        const winner = existing[0];

        const today = new Date().toISOString().slice(0, 10);

        await tx
          .update(bids)
          .set({
            status: "accepted",
            decidedAt: today,
            updatedAt: new Date(),
            updatedBy: ctx.actor,
          })
          .where(eq(bids.id, winner.id));

        // Promote this bid's still-"specified" work items into the
        // approved Plan. Don't touch items past approved — those have
        // moved on through the lifecycle.
        await tx
          .update(workItems)
          .set({
            status: "approved",
            updatedAt: new Date(),
            updatedBy: ctx.actor,
          })
          .where(
            and(
              eq(workItems.bidId, winner.id),
              eq(workItems.orgId, ctx.orgId),
              eq(workItems.status, "specified"),
            ),
          );

        if (winner.packageId) {
          // Reject siblings inside the same package (skip those already
          // accepted/rejected/expired manually — they get overwritten).
          await tx
            .update(bids)
            .set({
              status: "rejected",
              decidedAt: today,
              updatedAt: new Date(),
              updatedBy: ctx.actor,
            })
            .where(
              and(
                eq(bids.packageId, winner.packageId),
                ne(bids.id, winner.id),
                eq(bids.orgId, ctx.orgId),
              ),
            );

          await tx
            .update(bidPackages)
            .set({
              status: "awarded",
              awardedBidId: winner.id,
              awardedAt: today,
              updatedAt: new Date(),
              updatedBy: ctx.actor,
            })
            .where(eq(bidPackages.id, winner.packageId));
        }

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bid.awarded",
          resourceType: "bid",
          resourceId: winner.id,
          payload: { packageId: winner.packageId ?? null },
        });

        return { ok: true as const };
      });
    }),

  remove: orgScopedProcedure
    .input(bidIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(bids)
          .where(and(eq(bids.id, input.id), eq(bids.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        // Detach child work_items (set bid_id = null) before deleting
        // the bid. The FK is ON DELETE SET NULL so the DB would do
        // this for us; doing it explicitly here keeps the audit trail
        // accurate.
        await tx
          .update(workItems)
          .set({
            bidId: null,
            updatedAt: new Date(),
            updatedBy: ctx.actor,
          })
          .where(
            and(
              eq(workItems.bidId, input.id),
              eq(workItems.orgId, ctx.orgId),
            ),
          );

        await tx.delete(bids).where(eq(bids.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bid.deleted",
          resourceType: "bid",
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
  refs: {
    projectId?: string;
    vendorId?: string | null;
    packageId?: string | null;
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
  if (refs.packageId) {
    const ok = await tx
      .select({ id: bidPackages.id })
      .from(bidPackages)
      .where(
        and(
          eq(bidPackages.id, refs.packageId),
          eq(bidPackages.orgId, orgId),
        ),
      )
      .limit(1);
    if (!ok[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Bid package not found in this org",
      });
    }
  }
}
