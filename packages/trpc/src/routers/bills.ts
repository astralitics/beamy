import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  assetEvents,
  assets,
  auditLog,
  bids,
  bills,
  documents,
  getDb,
  projects,
  vendors,
} from "@beamy/db";
import {
  billCreateInputSchema,
  billIdInputSchema,
  billListInputSchema,
  billMarkPaidInputSchema,
  billUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `bills` router — money we owe vendors.
 *
 * Standard CRUD + a `markPaid` shortcut that flips status + stamps
 * paid_at in one audited operation.
 */
export const billsRouter = router({
  list: orgScopedProcedure
    .input(billListInputSchema)
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
        eq(bills.projectId, input.projectId),
        eq(bills.orgId, ctx.orgId),
      ];
      if (input.vendorId) conditions.push(eq(bills.vendorId, input.vendorId));
      if (input.status) conditions.push(eq(bills.status, input.status));
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(bills.description, p),
          ilike(bills.billNumber, p),
          ilike(bills.notes, p),
        );
        if (clause) conditions.push(clause);
      }

      return await db
        .select({ bill: bills, vendor: vendors })
        .from(bills)
        .leftJoin(vendors, eq(bills.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(bills.dueAt), desc(bills.updatedAt))
        .then((rows) => rows.map((r) => ({ ...r.bill, vendor: r.vendor })));
    }),

  get: orgScopedProcedure
    .input(billIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ bill: bills, vendor: vendors })
        .from(bills)
        .leftJoin(vendors, eq(bills.vendorId, vendors.id))
        .where(and(eq(bills.id, input.id), eq(bills.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      // Back-reference: if this bill was created from an asset event
      // (the "Paid from company account" flow), surface that link so the
      // detail page can show "From asset event" and click back.
      const fromEvent = await db
        .select({
          event: assetEvents,
          asset: assets,
        })
        .from(assetEvents)
        .innerJoin(assets, eq(assetEvents.assetId, assets.id))
        .where(
          and(
            eq(assetEvents.billId, input.id),
            eq(assetEvents.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      const source = fromEvent[0]
        ? { event: fromEvent[0].event, asset: fromEvent[0].asset }
        : null;

      // Back-reference: if this bill was auto-created from an accepted
      // quote, surface the link so the detail page can click back to it.
      const sourceBid = row.bill.bidId
        ? ((
            await db
              .select({
                id: bids.id,
                bidNumber: bids.bidNumber,
                trade: bids.trade,
              })
              .from(bids)
              .where(
                and(eq(bids.id, row.bill.bidId), eq(bids.orgId, ctx.orgId)),
              )
              .limit(1)
          )[0] ?? null)
        : null;

      return { ...row.bill, vendor: row.vendor, source, sourceBid };
    }),

  create: orgScopedProcedure
    .input(billCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          vendorId: input.vendorId,
        });

        const [row] = await tx
          .insert(bills)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            vendorId: input.vendorId ?? null,
            billNumber: input.billNumber ?? null,
            description: input.description ?? null,
            amount: input.amount,
            currency: input.currency,
            issuedAt: input.issuedAt ?? null,
            dueAt: input.dueAt ?? null,
            paidAt: input.paidAt ?? null,
            status: input.status,
            notes: input.notes ?? null,
            externalRef: input.externalRef ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Provenance: link the uploaded source factura PDF to this bill.
        if (input.sourceDocumentId) {
          await tx
            .update(documents)
            .set({
              billId: row.id,
              updatedAt: new Date(),
              updatedBy: ctx.actor,
            })
            .where(
              and(
                eq(documents.id, input.sourceDocumentId),
                eq(documents.orgId, ctx.orgId),
                eq(documents.projectId, input.projectId),
              ),
            );
        }

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bill.created",
          resourceType: "bill",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(billUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(bills)
          .where(and(eq(bills.id, input.id), eq(bills.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          vendorId: input.patch.vendorId ?? undefined,
        });

        const setClause: Partial<typeof bills.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.vendorId !== undefined) setClause.vendorId = p.vendorId;
        if (p.billNumber !== undefined) setClause.billNumber = p.billNumber;
        if (p.description !== undefined) setClause.description = p.description;
        if (p.amount !== undefined) setClause.amount = p.amount;
        if (p.currency !== undefined) setClause.currency = p.currency;
        if (p.issuedAt !== undefined) setClause.issuedAt = p.issuedAt;
        if (p.dueAt !== undefined) setClause.dueAt = p.dueAt;
        if (p.paidAt !== undefined) setClause.paidAt = p.paidAt;
        if (p.status !== undefined) setClause.status = p.status;
        if (p.notes !== undefined) setClause.notes = p.notes;
        if (p.externalRef !== undefined) setClause.externalRef = p.externalRef;

        const [updated] = await tx
          .update(bills)
          .set(setClause)
          .where(eq(bills.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bill.updated",
          resourceType: "bill",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  markPaid: orgScopedProcedure
    .input(billMarkPaidInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(bills)
          .where(and(eq(bills.id, input.id), eq(bills.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const paidAt = input.paidAt ?? todayIso();
        const [updated] = await tx
          .update(bills)
          .set({
            status: "paid",
            paidAt,
            updatedAt: new Date(),
            updatedBy: ctx.actor,
          })
          .where(eq(bills.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bill.paid",
          resourceType: "bill",
          resourceId: input.id,
          payload: { paidAt },
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(billIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(bills)
          .where(and(eq(bills.id, input.id), eq(bills.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(bills).where(eq(bills.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "bill.deleted",
          resourceType: "bill",
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

async function verifyOwnership(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  orgId: string,
  refs: { projectId?: string; vendorId?: string },
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
}
