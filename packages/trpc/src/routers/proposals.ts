import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  getDb,
  projects,
  proposals,
  vendors,
  workItems,
} from "@beamy/db";
import {
  proposalCreateInputSchema,
  proposalIdInputSchema,
  proposalListInputSchema,
  proposalUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * proposals — vendor bid container. CRUD only in this PR; the
 * accept/reject UX that propagates to child work_items lives in a
 * follow-up. Same patterns as the other routers: orgScoped, audit
 * trail, parent ownership verified.
 */
export const proposalsRouter = router({
  list: orgScopedProcedure
    .input(proposalListInputSchema)
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
        eq(proposals.projectId, input.projectId),
        eq(proposals.orgId, ctx.orgId),
      ];
      if (input.status) conditions.push(eq(proposals.status, input.status));
      if (input.vendorId) {
        conditions.push(eq(proposals.vendorId, input.vendorId));
      }
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(proposals.quoteNumber, p),
          ilike(proposals.trade, p),
          ilike(proposals.notes, p),
        );
        if (clause) conditions.push(clause);
      }

      return await db
        .select({ proposal: proposals, vendor: vendors })
        .from(proposals)
        .leftJoin(vendors, eq(proposals.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(proposals.updatedAt))
        .then((rows) =>
          rows.map((r) => ({ ...r.proposal, vendor: r.vendor })),
        );
    }),

  get: orgScopedProcedure
    .input(proposalIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ proposal: proposals, vendor: vendors })
        .from(proposals)
        .leftJoin(vendors, eq(proposals.vendorId, vendors.id))
        .where(
          and(eq(proposals.id, input.id), eq(proposals.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...row.proposal, vendor: row.vendor };
    }),

  create: orgScopedProcedure
    .input(proposalCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          vendorId: input.vendorId,
        });

        const [row] = await tx
          .insert(proposals)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            vendorId: input.vendorId ?? null,
            trade: input.trade ?? null,
            quoteNumber: input.quoteNumber ?? null,
            quoteDate: input.quoteDate ?? null,
            validUntil: input.validUntil ?? null,
            subtotalAmount: input.subtotalAmount ?? null,
            ivaAmount: input.ivaAmount ?? null,
            totalAmount: input.totalAmount ?? null,
            currency: input.currency ?? null,
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
          action: "proposal.created",
          resourceType: "proposal",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(proposalUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(proposals)
          .where(
            and(eq(proposals.id, input.id), eq(proposals.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          vendorId: input.patch.vendorId ?? undefined,
        });

        const setClause: Partial<typeof proposals.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.vendorId !== undefined) setClause.vendorId = p.vendorId;
        if (p.trade !== undefined) setClause.trade = p.trade;
        if (p.quoteNumber !== undefined) setClause.quoteNumber = p.quoteNumber;
        if (p.quoteDate !== undefined) setClause.quoteDate = p.quoteDate;
        if (p.validUntil !== undefined) setClause.validUntil = p.validUntil;
        if (p.subtotalAmount !== undefined) {
          setClause.subtotalAmount = p.subtotalAmount;
        }
        if (p.ivaAmount !== undefined) setClause.ivaAmount = p.ivaAmount;
        if (p.totalAmount !== undefined) setClause.totalAmount = p.totalAmount;
        if (p.currency !== undefined) setClause.currency = p.currency;
        if (p.status !== undefined) setClause.status = p.status;
        if (p.decidedAt !== undefined) setClause.decidedAt = p.decidedAt;
        if (p.flags !== undefined) setClause.flags = p.flags;
        if (p.notes !== undefined) setClause.notes = p.notes;

        const [updated] = await tx
          .update(proposals)
          .set(setClause)
          .where(eq(proposals.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "proposal.updated",
          resourceType: "proposal",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(proposalIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(proposals)
          .where(
            and(eq(proposals.id, input.id), eq(proposals.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        // Detach child work_items (set proposal_id = null) before
        // deleting the proposal. The FK is ON DELETE SET NULL so the
        // DB would do this for us; doing it explicitly here keeps
        // the audit trail accurate.
        await tx
          .update(workItems)
          .set({
            proposalId: null,
            updatedAt: new Date(),
            updatedBy: ctx.actor,
          })
          .where(
            and(
              eq(workItems.proposalId, input.id),
              eq(workItems.orgId, ctx.orgId),
            ),
          );

        await tx.delete(proposals).where(eq(proposals.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "proposal.deleted",
          resourceType: "proposal",
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
  refs: { projectId?: string; vendorId?: string | null },
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
