import { and, asc, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  bids,
  bills,
  clients,
  getDb,
  invoices,
  projects,
  proposals,
  rooms,
  workItems,
} from "@beamy/db";
import {
  projectCreateInputSchema,
  projectIdInputSchema,
  projectListInputSchema,
  projectOverviewStatsInputSchema,
  projectUpdateInputSchema,
  roomCreateInputSchema,
  roomIdInputSchema,
  roomListInputSchema,
  roomUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `projects` router — M2 anchor. Projects contain rooms; rooms anchor
 * the recall layer (assets, materials, finishes — landing in subsequent
 * PRs).
 *
 * Same pattern as the M1 entity routers: orgScopedProcedure, transactional
 * mutations with audit_log writes, sub-row org ownership verified before
 * mutating.
 */
export const projectsRouter = router({
  // ─────────────────── projects CRUD ───────────────────

  list: orgScopedProcedure
    .input(projectListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(projects.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(projects.status, input.status));
      if (input.projectType) {
        conditions.push(eq(projects.projectType, input.projectType));
      }
      if (input.clientId) {
        conditions.push(eq(projects.clientId, input.clientId));
      }
      if (input.search) {
        const pattern = `%${input.search}%`;
        const searchClause = or(
          ilike(projects.name, pattern),
          ilike(projects.address, pattern),
        );
        if (searchClause) conditions.push(searchClause);
      }
      return await db
        .select()
        .from(projects)
        .where(and(...conditions))
        .orderBy(desc(projects.updatedAt));
    }),

  get: orgScopedProcedure
    .input(projectIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({
          project: projects,
          client: clients,
        })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(
          and(eq(projects.id, input.id), eq(projects.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...row.project,
        client: row.client,
      };
    }),

  /**
   * Overview-tab dashboard. Returns all the cross-entity pulses the
   * landing page surfaces, in one round-trip.
   *
   * Multi-currency: rolled up per-currency rather than collapsing to
   * a single number — the firm sometimes books vendors in USD and
   * the client in MXN. UI renders one chip per currency. FX
   * conversion is a Tier 2 design discipline item (roadmap §6).
   *
   * "Overdue" / "this week" are computed against today's date at
   * server time; UI doesn't need to know the cutoff.
   */
  overviewStats: orgScopedProcedure
    .input(projectOverviewStatsInputSchema)
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

      const today = new Date().toISOString().slice(0, 10);
      const inSevenDays = new Date(Date.now() + 7 * 86400_000)
        .toISOString()
        .slice(0, 10);

      const projectScope = and(
        eq(workItems.projectId, input.projectId),
        eq(workItems.orgId, ctx.orgId),
      );
      const bidScope = and(
        eq(bids.projectId, input.projectId),
        eq(bids.orgId, ctx.orgId),
      );
      const proposalScope = and(
        eq(proposals.projectId, input.projectId),
        eq(proposals.orgId, ctx.orgId),
      );
      const billScope = and(
        eq(bills.projectId, input.projectId),
        eq(bills.orgId, ctx.orgId),
      );
      const invoiceScope = and(
        eq(invoices.projectId, input.projectId),
        eq(invoices.orgId, ctx.orgId),
      );

      const [
        workItemOverdue,
        workItemScheduledSoon,
        workItemTotals,
        bidsExpiring,
        bidsComparing,
        bidsCommittedByCurrency,
        proposalsRecent,
        proposalsSoldByCurrency,
        invoicesBilledByCurrency,
        invoicesPaidByCurrency,
        billsOverdue,
        invoicesOverdue,
      ] = await Promise.all([
        // Overdue work items: planned_end < today AND not done/accepted/cancelled.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(workItems)
          .where(
            and(
              projectScope,
              lt(workItems.plannedEnd, today),
              sql`${workItems.status} NOT IN ('done', 'accepted', 'cancelled')`,
            ),
          ),
        // Scheduled within the next 7 days.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(workItems)
          .where(
            and(
              projectScope,
              sql`${workItems.plannedStart} >= ${today} AND ${workItems.plannedStart} < ${inSevenDays}`,
            ),
          ),
        // Totals by status — used for the "in flight" tile.
        db
          .select({
            status: workItems.status,
            count: sql<number>`count(*)::int`,
          })
          .from(workItems)
          .where(projectScope)
          .groupBy(workItems.status),
        // Bids past valid_until that aren't already decided.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(bids)
          .where(
            and(
              bidScope,
              lt(bids.validUntil, today),
              sql`${bids.status} NOT IN ('accepted', 'rejected', 'expired')`,
            ),
          ),
        // Bids in 'comparing' state — waiting on a decision.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(bids)
          .where(and(bidScope, eq(bids.status, "comparing"))),
        // Committed = sum of accepted bid totals, per currency.
        db
          .select({
            currency: bids.currency,
            total: sql<string>`coalesce(sum(${bids.totalAmount}), 0)::text`,
          })
          .from(bids)
          .where(and(bidScope, eq(bids.status, "accepted")))
          .groupBy(bids.currency),
        // Three most recent proposals.
        db
          .select()
          .from(proposals)
          .where(proposalScope)
          .orderBy(desc(proposals.createdAt))
          .limit(3),
        // Sold = sum of accepted proposal totals.
        db
          .select({
            currency: proposals.totalCurrency,
            total: sql<string>`coalesce(sum(${proposals.totalAmount}), 0)::text`,
          })
          .from(proposals)
          .where(and(proposalScope, eq(proposals.status, "accepted")))
          .groupBy(proposals.totalCurrency),
        // Billed = invoices in sent or paid status.
        db
          .select({
            currency: invoices.currency,
            total: sql<string>`coalesce(sum(${invoices.amount}), 0)::text`,
          })
          .from(invoices)
          .where(
            and(
              invoiceScope,
              inArray(invoices.status, ["sent", "paid"]),
            ),
          )
          .groupBy(invoices.currency),
        // Paid = invoices marked paid.
        db
          .select({
            currency: invoices.currency,
            total: sql<string>`coalesce(sum(${invoices.amount}), 0)::text`,
          })
          .from(invoices)
          .where(and(invoiceScope, eq(invoices.status, "paid")))
          .groupBy(invoices.currency),
        // Overdue vendor bills: open + due_at < today.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(bills)
          .where(
            and(billScope, eq(bills.status, "open"), lt(bills.dueAt, today)),
          ),
        // Overdue client invoices: sent + due_at < today.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(invoices)
          .where(
            and(
              invoiceScope,
              eq(invoices.status, "sent"),
              lt(invoices.dueAt, today),
            ),
          ),
      ]);

      const wiByStatus: Record<string, number> = {};
      let workItemsTotal = 0;
      for (const r of workItemTotals) {
        wiByStatus[r.status] = r.count;
        workItemsTotal += r.count;
      }
      const inFlightCount =
        (wiByStatus["in_progress"] ?? 0) + (wiByStatus["scheduled"] ?? 0);

      return {
        workItems: {
          overdueCount: workItemOverdue[0]?.count ?? 0,
          scheduledSoonCount: workItemScheduledSoon[0]?.count ?? 0,
          inFlightCount,
          totalCount: workItemsTotal,
          byStatus: wiByStatus,
        },
        bids: {
          expiringCount: bidsExpiring[0]?.count ?? 0,
          comparingCount: bidsComparing[0]?.count ?? 0,
          committedByCurrency: bidsCommittedByCurrency
            .filter((r) => r.currency != null)
            .map((r) => ({ currency: r.currency!, amount: r.total })),
        },
        proposals: {
          recent: proposalsRecent,
          soldByCurrency: proposalsSoldByCurrency
            .filter((r) => r.currency != null)
            .map((r) => ({ currency: r.currency!, amount: r.total })),
        },
        money: {
          billedByCurrency: invoicesBilledByCurrency
            .filter((r) => r.currency != null)
            .map((r) => ({ currency: r.currency!, amount: r.total })),
          paidByCurrency: invoicesPaidByCurrency
            .filter((r) => r.currency != null)
            .map((r) => ({ currency: r.currency!, amount: r.total })),
        },
        billsInvoices: {
          overdueBillsCount: billsOverdue[0]?.count ?? 0,
          overdueInvoicesCount: invoicesOverdue[0]?.count ?? 0,
        },
        asOf: new Date().toISOString(),
      };
    }),

  create: orgScopedProcedure
    .input(projectCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // If clientId is set, verify it belongs to this org.
      if (input.clientId) {
        const owns = await db
          .select({ id: clients.id })
          .from(clients)
          .where(
            and(eq(clients.id, input.clientId), eq(clients.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!owns[0]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Client not found in this org",
          });
        }
      }

      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(projects)
          .values({
            orgId: ctx.orgId,
            clientId: input.clientId ?? null,
            name: input.name,
            address: input.address ?? null,
            projectType: input.projectType,
            contractAmount: input.contractAmount ?? null,
            contractCurrency: input.contractCurrency ?? null,
            startedAt: input.startedAt ?? null,
            ownerUserId: ctx.userId,
            notes: input.notes ?? null,
            tags: input.tags ?? [],
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "project.created",
          resourceType: "project",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(projectUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(projects)
          .where(
            and(eq(projects.id, input.id), eq(projects.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        // Verify clientId if changing.
        if (input.patch.clientId !== undefined && input.patch.clientId !== null) {
          const owns = await tx
            .select({ id: clients.id })
            .from(clients)
            .where(
              and(
                eq(clients.id, input.patch.clientId),
                eq(clients.orgId, ctx.orgId),
              ),
            )
            .limit(1);
          if (!owns[0]) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Client not found in this org",
            });
          }
        }

        const setClause: Partial<typeof projects.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.clientId !== undefined) setClause.clientId = p.clientId;
        if (p.address !== undefined) setClause.address = p.address ?? null;
        if (p.projectType !== undefined) setClause.projectType = p.projectType;
        if (p.contractAmount !== undefined) {
          setClause.contractAmount = p.contractAmount;
        }
        if (p.contractCurrency !== undefined) {
          setClause.contractCurrency = p.contractCurrency;
        }
        if (p.startedAt !== undefined) setClause.startedAt = p.startedAt;
        if (p.substantialCompletionAt !== undefined) {
          setClause.substantialCompletionAt = p.substantialCompletionAt;
        }
        if (p.closedOutAt !== undefined) setClause.closedOutAt = p.closedOutAt;
        if (p.notes !== undefined) setClause.notes = p.notes ?? null;
        if (p.tags !== undefined) setClause.tags = p.tags;

        const [updated] = await tx
          .update(projects)
          .set(setClause)
          .where(eq(projects.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "project.updated",
          resourceType: "project",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  archive: orgScopedProcedure
    .input(projectIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setProjectStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "archived",
      );
    }),

  restore: orgScopedProcedure
    .input(projectIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setProjectStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "active",
      );
    }),

  // ─────────────────── rooms sub-entity ───────────────────

  listRooms: orgScopedProcedure
    .input(roomListInputSchema)
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

      return await db
        .select()
        .from(rooms)
        .where(
          and(eq(rooms.projectId, input.projectId), eq(rooms.orgId, ctx.orgId)),
        )
        .orderBy(asc(rooms.name));
    }),

  addRoom: orgScopedProcedure
    .input(roomCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const ownsProject = await tx
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

        const [row] = await tx
          .insert(rooms)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            name: input.name,
            roomType: input.roomType ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "room.created",
          resourceType: "room",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  updateRoom: orgScopedProcedure
    .input(roomUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(rooms)
          .where(and(eq(rooms.id, input.id), eq(rooms.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof rooms.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.roomType !== undefined) setClause.roomType = p.roomType;
        if (p.notes !== undefined) setClause.notes = p.notes ?? null;

        const [updated] = await tx
          .update(rooms)
          .set(setClause)
          .where(eq(rooms.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "room.updated",
          resourceType: "room",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  removeRoom: orgScopedProcedure
    .input(roomIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(rooms)
          .where(and(eq(rooms.id, input.id), eq(rooms.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx.delete(rooms).where(eq(rooms.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "room.deleted",
          resourceType: "room",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),
});

async function setProjectStatus(
  ctx: { orgId: string; actor: string },
  id: string,
  status: "active" | "archived",
) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.orgId, ctx.orgId)))
      .limit(1);
    if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await tx
      .update(projects)
      .set({
        status,
        updatedAt: new Date(),
        updatedBy: ctx.actor,
      })
      .where(eq(projects.id, id))
      .returning();
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actor: ctx.actor,
      action: status === "archived" ? "project.archived" : "project.restored",
      resourceType: "project",
      resourceId: id,
    });
    return updated;
  });
}
