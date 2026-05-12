import { and, asc, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  changeOrderLines,
  changeOrders,
  getDb,
  projects,
  workItems,
} from "@beamy/db";
import {
  changeOrderCreateInputSchema,
  changeOrderIdInputSchema,
  changeOrderListInputSchema,
  changeOrderPatchInputSchema,
  changeOrderTransitionInputSchema,
  type ChangeOrderStatus,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * change_orders router — CRUD plus a `transition` mutation that
 * handles the approval side effect (applying line deltas to
 * work_items transactionally).
 *
 * Lifecycle rules enforced here:
 *   - drafted → sent → approved | rejected
 *   - any state → void (documentation only — does NOT unwind an
 *     approved CO; reversal happens via a corrective CO)
 *   - approved is terminal except for void
 *   - rejected is terminal except for void
 */
export const changeOrdersRouter = router({
  list: orgScopedProcedure
    .input(changeOrderListInputSchema)
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
        eq(changeOrders.projectId, input.projectId),
        eq(changeOrders.orgId, ctx.orgId),
      ];
      if (input.status) {
        conditions.push(eq(changeOrders.status, input.status));
      }

      return await db
        .select()
        .from(changeOrders)
        .where(and(...conditions))
        .orderBy(desc(changeOrders.createdAt));
    }),

  get: orgScopedProcedure
    .input(changeOrderIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(changeOrders)
        .where(
          and(
            eq(changeOrders.id, input.id),
            eq(changeOrders.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      const co = rows[0];
      if (!co) throw new TRPCError({ code: "NOT_FOUND" });

      const lines = await db
        .select()
        .from(changeOrderLines)
        .where(eq(changeOrderLines.changeOrderId, co.id))
        .orderBy(asc(changeOrderLines.displayOrder), asc(changeOrderLines.id));

      return { ...co, lines };
    }),

  create: orgScopedProcedure
    .input(changeOrderCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const proj = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!proj[0]) throw new TRPCError({ code: "NOT_FOUND" });

        // For modify/remove lines, verify the referenced work_items
        // belong to this project. Fail fast rather than silently
        // creating dangling references.
        const referencedIds = input.lines
          .filter((l) => l.workItemId != null)
          .map((l) => l.workItemId!) as string[];
        if (referencedIds.length > 0) {
          const found = await tx
            .select({ id: workItems.id })
            .from(workItems)
            .where(
              and(
                eq(workItems.projectId, input.projectId),
                eq(workItems.orgId, ctx.orgId),
                sql`${workItems.id} = ANY(${sql.raw(`ARRAY[${referencedIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`,
              ),
            );
          if (found.length !== referencedIds.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "One or more referenced work items don't belong to this project.",
            });
          }
        }

        // Mint the next CO number.
        const year = new Date().getFullYear();
        const numberPrefix = `CO-${year}-`;
        const existing = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(changeOrders)
          .where(
            and(
              eq(changeOrders.orgId, ctx.orgId),
              sql`${changeOrders.number} LIKE ${`${numberPrefix}%`}`,
            ),
          );
        const seq = (existing[0]?.count ?? 0) + 1;
        const number = `${numberPrefix}${String(seq).padStart(4, "0")}`;

        // Compute total delta from lines as a sanity-check + persist.
        const total = input.lines.reduce(
          (acc, l) => acc + parseFloat(l.totalDeltaAmount),
          0,
        );

        const [co] = await tx
          .insert(changeOrders)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            number,
            title: input.title,
            description: input.description ?? null,
            totalDeltaAmount: total.toFixed(2),
            totalDeltaCurrency: input.totalDeltaCurrency,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!co) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(changeOrderLines).values(
          input.lines.map((l, i) => ({
            changeOrderId: co.id,
            kind: l.kind,
            workItemId: l.workItemId ?? null,
            displayOrder: l.displayOrder ?? i,
            description: l.description ?? null,
            qty: l.qty ?? null,
            unit: l.unit ?? null,
            unitPriceAmount: l.unitPriceAmount ?? null,
            unitPriceCurrency: l.unitPriceCurrency ?? null,
            totalDeltaAmount: l.totalDeltaAmount,
            notes: l.notes ?? null,
          })),
        );

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "change_order.created",
          resourceType: "change_order",
          resourceId: co.id,
          payload: {
            number,
            totalDelta: total.toFixed(2),
            currency: input.totalDeltaCurrency,
            lineCount: input.lines.length,
          },
        });

        return co;
      });
    }),

  update: orgScopedProcedure
    .input(changeOrderPatchInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(changeOrders)
          .where(
            and(
              eq(changeOrders.id, input.id),
              eq(changeOrders.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof changeOrders.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.title !== undefined) setClause.title = p.title;
        if (p.description !== undefined) setClause.description = p.description;
        if (p.notes !== undefined) setClause.notes = p.notes;
        if (p.decidedBy !== undefined) setClause.decidedBy = p.decidedBy;

        const [updated] = await tx
          .update(changeOrders)
          .set(setClause)
          .where(eq(changeOrders.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "change_order.updated",
          resourceType: "change_order",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  /**
   * Transition the CO. The interesting case is `approved`, which
   * applies the line deltas to work_items in the same transaction:
   *
   *   - add lines: insert new work_items, stamp createdWorkItemId
   *   - modify lines: apply after-state fields to the work_item
   *   - remove lines: set work_item.status = "cancelled"
   *
   * Status guards:
   *   - drafted → sent
   *   - sent → approved | rejected
   *   - any → void (no work_item side effects)
   *   - approved / rejected are otherwise terminal
   */
  transition: orgScopedProcedure
    .input(changeOrderTransitionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(changeOrders)
          .where(
            and(
              eq(changeOrders.id, input.id),
              eq(changeOrders.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        const co = existing[0];
        if (!co) throw new TRPCError({ code: "NOT_FOUND" });

        if (!isValidTransition(co.status, input.to)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot move ${co.number} from ${co.status} to ${input.to}.`,
          });
        }

        const stampDate = input.at ?? todayIso();
        const setClause: Partial<typeof changeOrders.$inferInsert> = {
          status: input.to,
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        if (input.to === "sent") setClause.sentAt = stampDate;
        if (input.to === "approved" || input.to === "rejected") {
          setClause.decidedAt = stampDate;
          if (input.decidedBy !== undefined) {
            setClause.decidedBy = input.decidedBy;
          }
        }

        // Apply line deltas FIRST if approving — if any of them fail,
        // the whole transition aborts.
        if (input.to === "approved") {
          await applyApprovedDeltas(tx, ctx, co.id);
        }

        const [updated] = await tx
          .update(changeOrders)
          .set(setClause)
          .where(eq(changeOrders.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: `change_order.transitioned.${input.to}`,
          resourceType: "change_order",
          resourceId: input.id,
          payload: {
            from: co.status,
            to: input.to,
            at: stampDate,
            decidedBy: input.decidedBy,
          },
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(changeOrderIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(changeOrders)
          .where(
            and(
              eq(changeOrders.id, input.id),
              eq(changeOrders.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        const co = existing[0];
        if (!co) throw new TRPCError({ code: "NOT_FOUND" });

        // Approved COs have already mutated work_items; deleting them
        // would lose the audit trail without unwinding the effects.
        // Disallow.
        if (co.status === "approved") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Approved change orders can't be deleted — mark them void instead, then create a corrective CO if needed.",
          });
        }

        // change_order_lines cascade via FK.
        await tx.delete(changeOrders).where(eq(changeOrders.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "change_order.deleted",
          resourceType: "change_order",
          resourceId: input.id,
          payload: { number: co.number, status: co.status },
        });
        return { ok: true as const };
      });
    }),
});

// ─────────────────────────────────────── helpers ────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Allowed status transitions. Approval applies line deltas; void
 * is documentation-only and reachable from any state but the
 * deltas don't unwind. Approved and rejected are terminal
 * (except for void).
 */
function isValidTransition(
  from: ChangeOrderStatus,
  to: ChangeOrderStatus,
): boolean {
  if (from === to) return false;
  if (to === "void") return from !== "void";
  switch (from) {
    case "drafted":
      return to === "sent";
    case "sent":
      return to === "approved" || to === "rejected";
    case "approved":
    case "rejected":
    case "void":
      return false;
  }
}

async function applyApprovedDeltas(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  ctx: { orgId: string; actor: string },
  changeOrderId: string,
) {
  // Load the CO so we can stamp the projectId on new work_items.
  const coRows = await tx
    .select()
    .from(changeOrders)
    .where(eq(changeOrders.id, changeOrderId))
    .limit(1);
  const co = coRows[0];
  if (!co) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const lines = await tx
    .select()
    .from(changeOrderLines)
    .where(eq(changeOrderLines.changeOrderId, changeOrderId));

  for (const line of lines) {
    if (line.kind === "add") {
      const [newItem] = await tx
        .insert(workItems)
        .values({
          orgId: ctx.orgId,
          projectId: co.projectId,
          description: line.description ?? "(no description)",
          qty: line.qty ?? null,
          unit: line.unit ?? null,
          unitPriceAmount: line.unitPriceAmount ?? null,
          unitPriceCurrency: line.unitPriceCurrency ?? null,
          totalAmount: line.totalDeltaAmount,
          totalCurrency: co.totalDeltaCurrency,
          status: "approved",
          notes:
            (line.notes ?? "") +
            (line.notes ? "\n" : "") +
            `Added by ${co.number}`,
          createdBy: ctx.actor,
          updatedBy: ctx.actor,
        })
        .returning();
      if (!newItem) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      await tx
        .update(changeOrderLines)
        .set({ createdWorkItemId: newItem.id })
        .where(eq(changeOrderLines.id, line.id));
    } else if (line.kind === "modify") {
      if (!line.workItemId) continue;
      const setClause: Partial<typeof workItems.$inferInsert> = {
        updatedAt: new Date(),
        updatedBy: ctx.actor,
      };
      if (line.description != null) setClause.description = line.description;
      if (line.qty != null) setClause.qty = line.qty;
      if (line.unit != null) setClause.unit = line.unit;
      if (line.unitPriceAmount != null) {
        setClause.unitPriceAmount = line.unitPriceAmount;
      }
      if (line.unitPriceCurrency != null) {
        setClause.unitPriceCurrency = line.unitPriceCurrency;
      }
      // Recompute the work_item's total from qty * unit_price when
      // both end up set; otherwise leave it alone.
      const newQty = line.qty;
      const newUnit = line.unitPriceAmount;
      if (newQty != null && newUnit != null) {
        const t = parseFloat(newQty) * parseFloat(newUnit);
        setClause.totalAmount = t.toFixed(2);
        if (line.unitPriceCurrency != null) {
          setClause.totalCurrency = line.unitPriceCurrency;
        }
      }
      await tx
        .update(workItems)
        .set(setClause)
        .where(
          and(
            eq(workItems.id, line.workItemId),
            eq(workItems.orgId, ctx.orgId),
          ),
        );
    } else if (line.kind === "remove") {
      if (!line.workItemId) continue;
      await tx
        .update(workItems)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        })
        .where(
          and(
            eq(workItems.id, line.workItemId),
            eq(workItems.orgId, ctx.orgId),
          ),
        );
    }
  }

  // One consolidated audit row per CO application (per-line trail
  // is reconstructable from change_order_lines).
  await tx.insert(auditLog).values({
    orgId: ctx.orgId,
    actor: ctx.actor,
    action: "change_order.applied",
    resourceType: "change_order",
    resourceId: changeOrderId,
    payload: {
      number: co.number,
      lineCount: lines.length,
      kinds: lines.reduce<Record<string, number>>((acc, l) => {
        acc[l.kind] = (acc[l.kind] ?? 0) + 1;
        return acc;
      }, {}),
    },
  });
}

