import { and, asc, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  assets,
  auditLog,
  bids,
  bills,
  changeOrders,
  clientContacts,
  clients,
  documents,
  getDb,
  invoices,
  materials,
  projects,
  proposals,
  rooms,
  specItems,
  workItemDependencies,
  workItems,
} from "@beamy/db";
import {
  projectCreateInputSchema,
  projectIdInputSchema,
  projectListInputSchema,
  projectOverviewStatsInputSchema,
  projectPhaseAndCompletenessInputSchema,
  projectUpdateInputSchema,
  roomCreateInputSchema,
  roomIdInputSchema,
  roomListInputSchema,
  roomUpdateInputSchema,
  type ProjectPhase,
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
      const changeOrderScope = and(
        eq(changeOrders.projectId, input.projectId),
        eq(changeOrders.orgId, ctx.orgId),
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
        coAwaitingDecision,
        coApprovedDeltaByCurrency,
        blockedWorkItems,
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
              sql`${bids.status} NOT IN ('accepted', 'completed', 'rejected', 'expired')`,
            ),
          ),
        // Bids in 'comparing' state — waiting on a decision.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(bids)
          .where(and(bidScope, eq(bids.status, "comparing"))),
        // Committed = sum of accepted + completed bid totals, per
        // currency. Completing a quote keeps it counted — the money's
        // still committed once work is done.
        db
          .select({
            currency: bids.currency,
            total: sql<string>`coalesce(sum(${bids.totalAmount}), 0)::text`,
          })
          .from(bids)
          .where(and(bidScope, inArray(bids.status, ["accepted", "completed"])))
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
        // Change orders awaiting client decision (status = sent).
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(changeOrders)
          .where(and(changeOrderScope, eq(changeOrders.status, "sent"))),
        // Approved CO net delta — per currency. Negative deductive
        // COs subtract, additive add. Pairs with the Money tile.
        db
          .select({
            currency: changeOrders.totalDeltaCurrency,
            total: sql<string>`coalesce(sum(${changeOrders.totalDeltaAmount}), 0)::text`,
          })
          .from(changeOrders)
          .where(and(changeOrderScope, eq(changeOrders.status, "approved")))
          .groupBy(changeOrders.totalDeltaCurrency),
        // Blocked work items: live items (not done/accepted/cancelled)
        // that have at least one predecessor still in flight
        // (not done or accepted). Whatever the dep `kind` is, an
        // unfinished predecessor counts as a block — the UI
        // distinguishes kind at render time.
        db
          .select({
            count: sql<number>`count(distinct ${workItems.id})::int`,
          })
          .from(workItems)
          .innerJoin(
            workItemDependencies,
            eq(workItemDependencies.workItemId, workItems.id),
          )
          .innerJoin(
            sql`${workItems} AS predecessors`,
            sql`predecessors.id = ${workItemDependencies.dependsOnId}`,
          )
          .where(
            and(
              projectScope,
              sql`${workItems.status} NOT IN ('done', 'accepted', 'cancelled')`,
              sql`predecessors.status NOT IN ('done', 'accepted')`,
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
          blockedCount: blockedWorkItems[0]?.count ?? 0,
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
        changeOrders: {
          awaitingDecisionCount: coAwaitingDecision[0]?.count ?? 0,
          approvedDeltaByCurrency: coApprovedDeltaByCurrency
            .filter((r) => r.currency != null)
            .map((r) => ({ currency: r.currency!, amount: r.total })),
        },
        asOf: new Date().toISOString(),
      };
    }),

  /**
   * Project phase + per-section completeness checklist. Phase is
   * derived from data state (picks the most-advanced state reached);
   * each section's checklist drives the Overview completeness cards
   * and the deep-link "what's missing" tooltips.
   *
   * Single round-trip — all the small existence/count queries fire
   * via Promise.all. Cheap relative to dashboard latency.
   */
  phaseAndCompleteness: orgScopedProcedure
    .input(projectPhaseAndCompletenessInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const projRows = await db
        .select({ project: projects, client: clients })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      const proj = projRows[0]?.project;
      const client = projRows[0]?.client ?? null;
      if (!proj) throw new TRPCError({ code: "NOT_FOUND" });

      const projectScope = and(
        eq(projects.id, input.projectId),
        eq(projects.orgId, ctx.orgId),
      );
      const wiScope = and(
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
      const coScope = and(
        eq(changeOrders.projectId, input.projectId),
        eq(changeOrders.orgId, ctx.orgId),
      );
      const today = new Date().toISOString().slice(0, 10);

      const [
        roomCount,
        documentCount,
        assetCount,
        materialCount,
        clientContactCount,
        bidCount,
        bidsWithoutVendor,
        workItemRows,
        specCount,
        workItemsBidLinkedCount,
        proposalRows,
        latestSentProposal,
        coOpenSent,
        billsOverdue,
        invoicesOverdue,
      ] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(rooms)
          .where(
            and(
              eq(rooms.projectId, input.projectId),
              eq(rooms.orgId, ctx.orgId),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(documents)
          .where(
            and(
              eq(documents.projectId, input.projectId),
              eq(documents.orgId, ctx.orgId),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(assets)
          .where(
            and(
              eq(assets.projectId, input.projectId),
              eq(assets.orgId, ctx.orgId),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(materials)
          .where(
            and(
              eq(materials.projectId, input.projectId),
              eq(materials.orgId, ctx.orgId),
            ),
          ),
        // Client contacts count — only meaningful if a client is linked.
        proj.clientId
          ? db
              .select({ count: sql<number>`count(*)::int` })
              .from(clientContacts)
              .where(eq(clientContacts.clientId, proj.clientId))
          : Promise.resolve([{ count: 0 }]),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(bids)
          .where(bidScope),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(bids)
          .where(and(bidScope, sql`${bids.vendorId} IS NULL`)),
        db
          .select({
            id: workItems.id,
            status: workItems.status,
            vendorId: workItems.vendorId,
            plannedStart: workItems.plannedStart,
            plannedEnd: workItems.plannedEnd,
            bidId: workItems.bidId,
          })
          .from(workItems)
          .where(wiScope),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(specItems)
          .where(
            and(
              eq(specItems.projectId, input.projectId),
              eq(specItems.orgId, ctx.orgId),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(workItems)
          .where(and(wiScope, sql`${workItems.bidId} IS NOT NULL`)),
        db
          .select({
            id: proposals.id,
            number: proposals.number,
            version: proposals.version,
            status: proposals.status,
          })
          .from(proposals)
          .where(proposalScope),
        db
          .select({
            number: proposals.number,
            version: proposals.version,
            status: proposals.status,
            sentAt: proposals.sentAt,
          })
          .from(proposals)
          .where(and(proposalScope, eq(proposals.status, "sent")))
          .orderBy(desc(proposals.version), desc(proposals.sentAt))
          .limit(1),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(changeOrders)
          .where(and(coScope, eq(changeOrders.status, "sent"))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(bills)
          .where(
            and(
              eq(bills.projectId, input.projectId),
              eq(bills.orgId, ctx.orgId),
              eq(bills.status, "open"),
              lt(bills.dueAt, today),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(invoices)
          .where(
            and(
              eq(invoices.projectId, input.projectId),
              eq(invoices.orgId, ctx.orgId),
              eq(invoices.status, "sent"),
              lt(invoices.dueAt, today),
            ),
          ),
      ]);

      // ── derive phase ────────────────────────────────────────
      const liveWi = workItemRows.filter((w) => w.status !== "cancelled");
      const anyInProgress = liveWi.some((w) => w.status === "in_progress");
      const allDoneOrAccepted =
        liveWi.length > 0 &&
        liveWi.every((w) => w.status === "done" || w.status === "accepted");
      const anyAcceptedProposal = proposalRows.some(
        (p) => p.status === "accepted",
      );
      const anySentProposal = proposalRows.some((p) => p.status === "sent");
      const anyActivity =
        bidCount[0]!.count > 0 ||
        workItemRows.length > 0 ||
        specCount[0]!.count > 0;

      let phase: ProjectPhase = "onboarding";
      if (proj.closedOutAt) phase = "completed";
      else if (allDoneOrAccepted && anyAcceptedProposal) phase = "work_in_review";
      else if (anyInProgress) phase = "work_ongoing";
      else if (anyAcceptedProposal) phase = "proposal_approved";
      else if (anySentProposal) phase = "proposal_sent";
      else if (anyActivity) phase = "preparing_proposal";

      const phaseLabel =
        phase === "proposal_sent" && latestSentProposal[0]
          ? `Proposal sent — v${latestSentProposal[0].version}`
          : undefined;

      // ── per-section completeness ────────────────────────────
      type Check = { id: string; label: string; passed: boolean; deepLink?: string };
      const url = `/projects/${input.projectId}`;

      const propertyChecks: Check[] = [
        {
          id: "address",
          label: "Project address set",
          passed: !!proj.address && proj.address.trim().length > 0,
          deepLink: url,
        },
        {
          id: "client",
          label: "Client linked",
          passed: !!proj.clientId && !!client,
          deepLink: url,
        },
        {
          id: "client_contact",
          label: "Client has at least one contact",
          passed: !!proj.clientId && clientContactCount[0]!.count > 0,
          deepLink: proj.clientId
            ? `/clients/${proj.clientId}`
            : "/clients",
        },
        {
          id: "rooms",
          label: "At least 1 room defined",
          passed: roomCount[0]!.count > 0,
          deepLink: `${url}/plan`,
        },
        {
          id: "notes",
          label: "Project notes filled (intent / constraints / HOA quirks)",
          passed: !!proj.notes && proj.notes.trim().length > 0,
          deepLink: url,
        },
        {
          id: "documents",
          label: "At least 1 document uploaded (plans, drawings)",
          passed: documentCount[0]!.count > 0,
          deepLink: `${url}/documents`,
        },
        {
          id: "recall",
          label: "At least 1 asset OR material logged",
          passed: assetCount[0]!.count > 0 || materialCount[0]!.count > 0,
          deepLink: `${url}/assets`,
        },
      ];

      const workProposalChecks: Check[] = [
        {
          id: "bids",
          label: "At least 1 bid received",
          passed: bidCount[0]!.count > 0,
          deepLink: `${url}/bids`,
        },
        {
          id: "bids_vendor",
          label: "All bids have a vendor assigned",
          passed:
            bidCount[0]!.count > 0 && bidsWithoutVendor[0]!.count === 0,
          deepLink: `${url}/bids`,
        },
        {
          id: "work_items",
          label: "At least 1 work item drafted",
          passed: workItemRows.length > 0,
          deepLink: `${url}/plan?phase=proposal`,
        },
        {
          id: "bid_linked",
          label: "Bid scope broken down into work items (bid_id linked)",
          passed: workItemsBidLinkedCount[0]!.count > 0,
          deepLink: `${url}/plan?phase=proposal`,
        },
        {
          id: "specs",
          label: "Specs recorded for major finishes",
          passed: specCount[0]!.count > 0,
          deepLink: `${url}/specs`,
        },
        {
          id: "proposal_generated",
          label: "At least 1 proposal generated",
          passed: proposalRows.length > 0,
          deepLink: `${url}/proposals`,
        },
        {
          id: "proposal_sent",
          label: "Latest proposal sent to client",
          passed: anySentProposal || anyAcceptedProposal,
          deepLink: `${url}/proposals`,
        },
      ];

      const executionChecks: Check[] = [
        {
          id: "proposal_accepted",
          label: "A proposal is accepted (gates execution)",
          passed: anyAcceptedProposal,
          deepLink: `${url}/proposals`,
        },
        {
          id: "scheduled",
          label: "Every live work item has planned start + end",
          passed:
            liveWi.length > 0 &&
            liveWi.every((w) => w.plannedStart && w.plannedEnd),
          deepLink: `${url}/plan?view=timeline`,
        },
        {
          id: "vendor_assigned",
          label: "Every non-specified work item has a vendor",
          passed:
            liveWi.length > 0 &&
            liveWi.every(
              (w) => w.status === "specified" || w.vendorId !== null,
            ),
          deepLink: `${url}/plan?phase=execution`,
        },
        {
          id: "co_decided",
          label: "All change orders decided (no `sent` stragglers)",
          passed: coOpenSent[0]!.count === 0,
          deepLink: `${url}/change-orders`,
        },
        {
          id: "no_overdue_bills",
          label: "No overdue bills",
          passed: billsOverdue[0]!.count === 0,
          deepLink: `${url}/money`,
        },
        {
          id: "no_overdue_invoices",
          label: "No overdue invoices",
          passed: invoicesOverdue[0]!.count === 0,
          deepLink: `${url}/money`,
        },
        {
          id: "execution_started",
          label: "Any work item in progress",
          passed: anyInProgress,
          deepLink: `${url}/plan?phase=execution`,
        },
        {
          id: "substantial_completion",
          label: "Substantial completion certified",
          passed: !!proj.substantialCompletionAt,
          deepLink: url,
        },
        {
          id: "closed_out",
          label: "Project closed out",
          passed: !!proj.closedOutAt,
          deepLink: url,
        },
      ];

      function summarize(checks: Check[]) {
        const filled = checks.filter((c) => c.passed).length;
        return {
          total: checks.length,
          filled,
          ratio: checks.length === 0 ? 0 : filled / checks.length,
          checks,
        };
      }

      return {
        phase,
        phaseLabel,
        // Orthogonal flags rendered next to the phase bar.
        onHold: proj.status === "on_hold",
        archived: proj.status === "archived",
        sections: {
          property: summarize(propertyChecks),
          work_proposal: summarize(workProposalChecks),
          execution: summarize(executionChecks),
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

  getRoom: orgScopedProcedure
    .input(roomIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rowsRes = await db
        .select()
        .from(rooms)
        .where(and(eq(rooms.id, input.id), eq(rooms.orgId, ctx.orgId)))
        .limit(1);
      const row = rowsRes[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
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
            description: input.description ?? null,
            floor: input.floor ?? null,
            floorAreaSqM: input.floorAreaSqM ?? null,
            ceilingHeightM: input.ceilingHeightM ?? null,
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
        if (p.description !== undefined) setClause.description = p.description;
        if (p.floor !== undefined) setClause.floor = p.floor;
        if (p.floorAreaSqM !== undefined) setClause.floorAreaSqM = p.floorAreaSqM;
        if (p.ceilingHeightM !== undefined) {
          setClause.ceilingHeightM = p.ceilingHeightM;
        }
        if (p.photoUrl !== undefined) setClause.photoUrl = p.photoUrl;
        if (p.notes !== undefined) setClause.notes = p.notes;

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
