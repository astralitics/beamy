import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  clients,
  documents,
  getDb,
  orgs,
  projects,
  proposalLines,
  proposals,
  rooms,
  workItemRooms,
  workItems,
} from "@beamy/db";
import {
  proposalGenerateInputSchema,
  proposalIdInputSchema,
  proposalListInputSchema,
  proposalPatchInputSchema,
  proposalTransitionInputSchema,
  type ProposalStatus,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";
import {
  renderProposalHtml,
  type ProposalRenderLine,
} from "../lib/proposal-html";

const BUCKET = "documents";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 10; // 10 minutes

/**
 * proposals — outbound client side. CRUD plus the `generate`
 * mutation that snapshots work_items into proposal_lines, renders
 * the HTML artifact, uploads it to the documents bucket, and ties
 * the proposal row to the resulting document.
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

      return await db
        .select()
        .from(proposals)
        .where(and(...conditions))
        .orderBy(desc(proposals.createdAt));
    }),

  get: orgScopedProcedure
    .input(proposalIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(proposals)
        .where(
          and(eq(proposals.id, input.id), eq(proposals.orgId, ctx.orgId)),
        )
        .limit(1);
      const proposal = rows[0];
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND" });

      const lines = await db
        .select()
        .from(proposalLines)
        .where(eq(proposalLines.proposalId, proposal.id))
        .orderBy(asc(proposalLines.displayOrder), asc(proposalLines.id));

      return { ...proposal, lines };
    }),

  /**
   * Get a short-lived signed URL to download the generated artifact.
   * Returns null if the proposal has no document yet (mid-generate
   * crash, or status transitioned without generating).
   */
  getDownloadUrl: orgScopedProcedure
    .input(proposalIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ proposal: proposals, document: documents })
        .from(proposals)
        .leftJoin(documents, eq(proposals.generatedDocumentId, documents.id))
        .where(
          and(eq(proposals.id, input.id), eq(proposals.orgId, ctx.orgId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (!row.document) return { url: null as string | null };

      const storage = getStorageClient();
      const { data, error } = await storage.storage
        .from(BUCKET)
        .createSignedUrl(row.document.storagePath, SIGNED_URL_EXPIRY_SECONDS);
      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Storage error: ${error?.message ?? "no signed URL"}`,
        });
      }
      return { url: data.signedUrl };
    }),

  generate: orgScopedProcedure
    .input(proposalGenerateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const storage = getStorageClient();

      // 1. Verify project ownership + load supporting data.
      const proj = await db
        .select({ project: projects, client: clients, org: orgs })
        .from(projects)
        .leftJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(orgs, eq(projects.orgId, orgs.id))
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      if (!proj[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const { project, client, org } = proj[0];

      // 2. Load the requested work_items + their rooms. Reject if any
      // item is missing or belongs to a different org/project.
      const items = await db
        .select()
        .from(workItems)
        .where(
          and(
            inArray(workItems.id, input.workItemIds),
            eq(workItems.orgId, ctx.orgId),
            eq(workItems.projectId, input.projectId),
          ),
        );
      if (items.length !== input.workItemIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "One or more work items not found in this project. Refresh and try again.",
        });
      }

      const roomLinks = await db
        .select({
          workItemId: workItemRooms.workItemId,
          room: rooms,
        })
        .from(workItemRooms)
        .innerJoin(rooms, eq(workItemRooms.roomId, rooms.id))
        .where(inArray(workItemRooms.workItemId, input.workItemIds));
      const roomsByItem = new Map<string, string[]>();
      for (const link of roomLinks) {
        const arr = roomsByItem.get(link.workItemId) ?? [];
        arr.push(link.room.name);
        roomsByItem.set(link.workItemId, arr);
      }

      // 3. Compute per-line client totals from markup or per-item
      // override. Snapshot into proposal_lines.
      const orderedItems = input.workItemIds
        .map((id) => items.find((w) => w.id === id))
        .filter((w): w is NonNullable<typeof w> => w != null);

      let runningTotal = 0;
      const lineRows: typeof proposalLines.$inferInsert[] = [];
      const renderLines: ProposalRenderLine[] = [];
      // Project-level fallback when a work_item has no per-row markup.
      // Each line still resolves its own markup independently — the
      // Plan is the editing surface for that.
      const fallbackMarkup = input.markupPct;

      for (let i = 0; i < orderedItems.length; i++) {
        const w = orderedItems[i]!;
        const qty = w.qty ? parseFloat(w.qty) : null;
        const internalUnit = w.unitPriceAmount
          ? parseFloat(w.unitPriceAmount)
          : null;

        // Precedence: per-item override → per-item markup → fallback
        // markup. `clientMarkupPct` lives on the work_item so the Plan
        // is the single editing surface for pricing.
        const itemMarkup =
          w.clientMarkupPct != null
            ? parseFloat(w.clientMarkupPct)
            : fallbackMarkup;
        let clientUnit: number | null = null;
        if (w.clientUnitPrice != null) {
          clientUnit = parseFloat(w.clientUnitPrice);
        } else if (internalUnit != null) {
          clientUnit = internalUnit * (1 + itemMarkup / 100);
        }
        const clientTotal =
          qty != null && clientUnit != null ? qty * clientUnit : null;
        if (clientTotal != null) runningTotal += clientTotal;

        const sectionLabel =
          w.trade && input.sectionLabelsByTrade?.[w.trade]
            ? input.sectionLabelsByTrade[w.trade]!
            : w.trade
              ? cap(w.trade)
              : null;

        lineRows.push({
          proposalId: "", // patched after we have the proposal id
          workItemId: w.id,
          displayOrder: i,
          sectionLabel,
          displayDescription: w.description,
          displayQty: qty != null ? qty.toString() : null,
          displayUnit: w.unit,
          displayUnitPrice: clientUnit != null ? clientUnit.toFixed(2) : null,
          displayTotal: clientTotal != null ? clientTotal.toFixed(2) : null,
          currency: input.currency,
          markupPctApplied: itemMarkup.toFixed(2),
        });

        renderLines.push({
          sectionLabel,
          ref: w.ref,
          description: w.description,
          qty: qty != null ? trimQty(qty) : null,
          unit: w.unit,
          unitPrice:
            clientUnit != null ? fmtMoney(clientUnit, input.currency) : null,
          total:
            clientTotal != null ? fmtMoney(clientTotal, input.currency) : null,
          rooms: roomsByItem.get(w.id) ?? [],
        });
      }

      // 4. Mint the next public number (PROP-YYYY-NNNN). Per-org-per-
      // year, sequential. Naive on concurrency; for v1's user volume
      // this is fine (one PM clicking Generate at a time).
      const year = new Date().getFullYear();
      const numberPrefix = `PROP-${year}-`;
      const existing = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(proposals)
        .where(
          and(
            eq(proposals.orgId, ctx.orgId),
            sql`${proposals.number} LIKE ${`${numberPrefix}%`}`,
          ),
        );
      const seq = (existing[0]?.count ?? 0) + 1;
      const number = `${numberPrefix}${String(seq).padStart(4, "0")}`;

      // 5. Render HTML.
      const issuedOn = new Date().toISOString().slice(0, 10);
      const html = renderProposalHtml({
        number,
        projectName: project.name,
        projectAddress: project.address,
        clientName: client?.name ?? null,
        title: input.title,
        introText: input.introText ?? null,
        expiresAt: input.expiresAt ?? null,
        currency: input.currency,
        issuedOn,
        lines: renderLines,
        totalFormatted: fmtMoney(runningTotal, input.currency),
        orgName: org?.name ?? "the firm",
      });

      // 6. Upload to storage. We pre-mint the document id so the
      // storage path is stable and we never orphan a row before the
      // blob lands.
      const docId = crypto.randomUUID();
      const storagePath = `${ctx.orgId}/${input.projectId}/${docId}.html`;
      const { error: uploadErr } = await storage.storage
        .from(BUCKET)
        .upload(storagePath, html, {
          contentType: "text/html; charset=utf-8",
          upsert: false,
        });
      if (uploadErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Storage error: ${uploadErr.message}`,
        });
      }

      // 7. Persist the document, proposal, and lines transactionally.
      const result = await db.transaction(async (tx) => {
        const filename = `${number} — ${input.title}.html`.slice(0, 200);
        const [doc] = await tx
          .insert(documents)
          .values({
            id: docId,
            orgId: ctx.orgId,
            projectId: input.projectId,
            name: filename,
            mimeType: "text/html; charset=utf-8",
            sizeBytes: Buffer.byteLength(html, "utf8"),
            storagePath,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!doc) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [proposal] = await tx
          .insert(proposals)
          .values({
            orgId: ctx.orgId,
            projectId: input.projectId,
            number,
            version: 1,
            title: input.title,
            introText: input.introText ?? null,
            status: "drafted",
            expiresAt: input.expiresAt ?? null,
            totalAmount: runningTotal.toFixed(2),
            totalCurrency: input.currency,
            generatedDocumentId: doc.id,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!proposal) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Stamp the proposal id on the documents row so the FK works
        // bidirectionally (documents list shows it under this proposal).
        await tx
          .update(documents)
          .set({ proposalId: proposal.id })
          .where(eq(documents.id, doc.id));

        if (lineRows.length > 0) {
          await tx
            .insert(proposalLines)
            .values(lineRows.map((l) => ({ ...l, proposalId: proposal.id })));
        }

        // Snapshot the client_* fields back onto the work_items for
        // dashboard math + future regenerations. Each item keeps its
        // own markup (from the Plan), not a single value.
        for (let i = 0; i < orderedItems.length; i++) {
          const w = orderedItems[i]!;
          const computed = lineRows[i]!;
          await tx
            .update(workItems)
            .set({
              clientMarkupPct: computed.markupPctApplied,
              clientUnitPrice: computed.displayUnitPrice ?? null,
              clientTotal: computed.displayTotal ?? null,
              clientCurrency: input.currency,
              updatedAt: new Date(),
              updatedBy: ctx.actor,
            })
            .where(eq(workItems.id, w.id));
        }

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "proposal.generated",
          resourceType: "proposal",
          resourceId: proposal.id,
          payload: {
            number,
            workItemIds: input.workItemIds,
            markupPct: input.markupPct,
            total: runningTotal.toFixed(2),
            currency: input.currency,
          },
        });

        return proposal;
      });

      return result;
    }),

  update: orgScopedProcedure
    .input(proposalPatchInputSchema)
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

        const setClause: Partial<typeof proposals.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.title !== undefined) setClause.title = p.title;
        if (p.introText !== undefined) setClause.introText = p.introText;
        if (p.notes !== undefined) setClause.notes = p.notes;
        if (p.expiresAt !== undefined) setClause.expiresAt = p.expiresAt;

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

  transition: orgScopedProcedure
    .input(proposalTransitionInputSchema)
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

        const stampDate = input.at ?? todayIso();
        const dateCol = dateColumnForStatus(input.to);

        const setClause: Partial<typeof proposals.$inferInsert> = {
          status: input.to,
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        if (dateCol) setClause[dateCol] = stampDate;

        const [updated] = await tx
          .update(proposals)
          .set(setClause)
          .where(eq(proposals.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: `proposal.transitioned.${input.to}`,
          resourceType: "proposal",
          resourceId: input.id,
          payload: { from: existing[0].status, to: input.to, at: stampDate },
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(proposalIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const storage = getStorageClient();

      return await db.transaction(async (tx) => {
        const rows = await tx
          .select({ proposal: proposals, document: documents })
          .from(proposals)
          .leftJoin(documents, eq(proposals.generatedDocumentId, documents.id))
          .where(
            and(eq(proposals.id, input.id), eq(proposals.orgId, ctx.orgId)),
          )
          .limit(1);
        const row = rows[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });

        // proposal_lines cascade via FK; documents.proposal_id sets null.
        await tx.delete(proposals).where(eq(proposals.id, input.id));

        // Also remove the generated artifact + its documents row so we
        // don't leak storage objects.
        if (row.document) {
          await tx.delete(documents).where(eq(documents.id, row.document.id));
          await storage.storage.from(BUCKET).remove([row.document.storagePath]);
        }

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "proposal.deleted",
          resourceType: "proposal",
          resourceId: input.id,
          payload: { number: row.proposal.number },
        });
        return { ok: true as const };
      });
    }),
});

// ─────────────────────────────────────── helpers ────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateColumnForStatus(
  status: ProposalStatus,
): "sentAt" | "decidedAt" | null {
  switch (status) {
    case "sent":
      return "sentAt";
    case "accepted":
    case "rejected":
      return "decidedAt";
    default:
      return null;
  }
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown currency code — fall back to plain formatting.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function trimQty(qty: number): string {
  if (Math.abs(qty - Math.round(qty)) < 1e-9) return String(Math.round(qty));
  return String(parseFloat(qty.toFixed(4)));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let _storageClient: SupabaseClient | null = null;
function getStorageClient(): SupabaseClient {
  if (_storageClient) return _storageClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server for the proposals feature.",
    });
  }
  _storageClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _storageClient;
}
