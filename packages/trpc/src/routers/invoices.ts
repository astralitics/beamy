import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  clients,
  getDb,
  invoices,
  projects,
} from "@beamy/db";
import {
  invoiceCreateInputSchema,
  invoiceIdInputSchema,
  invoiceListInputSchema,
  invoiceMarkPaidInputSchema,
  invoiceMarkSentInputSchema,
  invoiceUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `invoices` router — money clients owe us.
 *
 * Standard CRUD + `markSent` and `markPaid` shortcuts that flip status
 * and stamp the corresponding date in one audited operation.
 */
export const invoicesRouter = router({
  list: orgScopedProcedure
    .input(invoiceListInputSchema)
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
        eq(invoices.projectId, input.projectId),
        eq(invoices.orgId, ctx.orgId),
      ];
      if (input.clientId) {
        conditions.push(eq(invoices.clientId, input.clientId));
      }
      if (input.status) conditions.push(eq(invoices.status, input.status));
      if (input.search) {
        const p = `%${input.search}%`;
        const clause = or(
          ilike(invoices.description, p),
          ilike(invoices.invoiceNumber, p),
          ilike(invoices.notes, p),
        );
        if (clause) conditions.push(clause);
      }

      return await db
        .select({ invoice: invoices, client: clients })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .where(and(...conditions))
        .orderBy(desc(invoices.dueAt), desc(invoices.updatedAt))
        .then((rows) =>
          rows.map((r) => ({ ...r.invoice, client: r.client })),
        );
    }),

  get: orgScopedProcedure
    .input(invoiceIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ invoice: invoices, client: clients })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .where(
          and(eq(invoices.id, input.id), eq(invoices.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { ...row.invoice, client: row.client };
    }),

  create: orgScopedProcedure
    .input(invoiceCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        await verifyOwnership(tx, ctx.orgId, {
          projectId: input.projectId,
          clientId: input.clientId,
        });

        const [row] = await tx
          .insert(invoices)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            clientId: input.clientId ?? null,
            invoiceNumber: input.invoiceNumber ?? null,
            description: input.description ?? null,
            amount: input.amount,
            currency: input.currency,
            issuedAt: input.issuedAt ?? null,
            sentAt: input.sentAt ?? null,
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

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "invoice.created",
          resourceType: "invoice",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(invoiceUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(invoices)
          .where(
            and(eq(invoices.id, input.id), eq(invoices.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await verifyOwnership(tx, ctx.orgId, {
          clientId: input.patch.clientId ?? undefined,
        });

        const setClause: Partial<typeof invoices.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.clientId !== undefined) setClause.clientId = p.clientId;
        if (p.invoiceNumber !== undefined) {
          setClause.invoiceNumber = p.invoiceNumber;
        }
        if (p.description !== undefined) setClause.description = p.description;
        if (p.amount !== undefined) setClause.amount = p.amount;
        if (p.currency !== undefined) setClause.currency = p.currency;
        if (p.issuedAt !== undefined) setClause.issuedAt = p.issuedAt;
        if (p.sentAt !== undefined) setClause.sentAt = p.sentAt;
        if (p.dueAt !== undefined) setClause.dueAt = p.dueAt;
        if (p.paidAt !== undefined) setClause.paidAt = p.paidAt;
        if (p.status !== undefined) setClause.status = p.status;
        if (p.notes !== undefined) setClause.notes = p.notes;
        if (p.externalRef !== undefined) setClause.externalRef = p.externalRef;

        const [updated] = await tx
          .update(invoices)
          .set(setClause)
          .where(eq(invoices.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "invoice.updated",
          resourceType: "invoice",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  markSent: orgScopedProcedure
    .input(invoiceMarkSentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(invoices)
          .where(
            and(eq(invoices.id, input.id), eq(invoices.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const sentAt = input.sentAt ?? todayIso();
        const [updated] = await tx
          .update(invoices)
          .set({
            status: "sent",
            sentAt,
            updatedAt: new Date(),
            updatedBy: ctx.actor,
          })
          .where(eq(invoices.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "invoice.sent",
          resourceType: "invoice",
          resourceId: input.id,
          payload: { sentAt },
        });
        return updated;
      });
    }),

  markPaid: orgScopedProcedure
    .input(invoiceMarkPaidInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(invoices)
          .where(
            and(eq(invoices.id, input.id), eq(invoices.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const paidAt = input.paidAt ?? todayIso();
        const [updated] = await tx
          .update(invoices)
          .set({
            status: "paid",
            paidAt,
            updatedAt: new Date(),
            updatedBy: ctx.actor,
          })
          .where(eq(invoices.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "invoice.paid",
          resourceType: "invoice",
          resourceId: input.id,
          payload: { paidAt },
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(invoiceIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(invoices)
          .where(
            and(eq(invoices.id, input.id), eq(invoices.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(invoices).where(eq(invoices.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "invoice.deleted",
          resourceType: "invoice",
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
  refs: { projectId?: string; clientId?: string },
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
  if (refs.clientId) {
    const ok = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, refs.clientId), eq(clients.orgId, orgId)))
      .limit(1);
    if (!ok[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Client not found in this org",
      });
    }
  }
}
