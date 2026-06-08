import type { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLog, documents, getDb, projects, rooms } from "@beamy/db";
import {
  BILL_EXTRACTION_INSTRUCTIONS,
  QUOTE_EXTRACTION_INSTRUCTIONS,
  billExtractionSchema,
  extractDocumentRequestSchema,
  quoteExtractionSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";
import { DocumentExtractionError, extractDocument } from "../lib/extraction";
import { downloadDocumentBytes } from "../lib/storage";

/**
 * `extraction` router — AI document intake.
 *
 * A file is uploaded the normal way (`documents.create` → signed PUT),
 * then these procedures read it back from Storage, hand the bytes to a
 * vision/PDF model, and return a **draft** of the structured fields.
 * Nothing is written to `bills`/`bids` here — the user confirms/edits
 * the draft in the UI and then calls `bills.create` /
 * `bids.createWithLines`. This keeps agent output behind a human gate
 * (D-8) without a persisted review queue.
 *
 * The model call itself lives in the domain-agnostic `lib/extraction`
 * seam; this router only does tenancy, the Storage fetch, and audit.
 */
export const extractionRouter = router({
  extractBill: orgScopedProcedure
    .input(extractDocumentRequestSchema)
    .mutation(({ ctx, input }) =>
      runExtraction(ctx, input, {
        kind: "bill",
        schema: billExtractionSchema,
        instructions: BILL_EXTRACTION_INSTRUCTIONS,
      }),
    ),

  extractQuote: orgScopedProcedure
    .input(extractDocumentRequestSchema)
    .mutation(({ ctx, input }) =>
      runExtraction(ctx, input, {
        kind: "quote",
        schema: quoteExtractionSchema,
        instructions: QUOTE_EXTRACTION_INSTRUCTIONS,
      }),
    ),
});

async function runExtraction<T>(
  ctx: { orgId: string; actor: string },
  input: { projectId: string; documentId: string },
  cfg: { kind: "bill" | "quote"; schema: z.ZodType<T>; instructions: string },
) {
  const db = getDb();

  const ownsProject = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.id, input.projectId), eq(projects.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!ownsProject[0]) throw new TRPCError({ code: "NOT_FOUND" });

  const doc = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.orgId, ctx.orgId),
        eq(documents.projectId, input.projectId),
      ),
    )
    .limit(1)
    .then((r) => r[0]);
  if (!doc) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Document not found in this project",
    });
  }

  const bytes = await downloadDocumentBytes(doc.storagePath);

  // For quotes, give the model the project's existing rooms so it can tag
  // the quote with one of them by exact name (and never invent a room).
  let instructions = cfg.instructions;
  if (cfg.kind === "quote") {
    const roomRows = await db
      .select({ name: rooms.name })
      .from(rooms)
      .where(
        and(eq(rooms.projectId, input.projectId), eq(rooms.orgId, ctx.orgId)),
      );
    if (roomRows.length > 0) {
      instructions +=
        "\n\nAvailable rooms in this project (for each line, set its `room` to the EXACT matching name, or omit): " +
        roomRows.map((r) => r.name).join("; ");
    }
  }

  let result;
  try {
    result = await extractDocument({
      file: { bytes, mimeType: doc.mimeType },
      schema: cfg.schema,
      instructions,
    });
  } catch (err) {
    if (err instanceof DocumentExtractionError) {
      throw new TRPCError({
        code:
          err.code === "no_api_key"
            ? "PRECONDITION_FAILED"
            : err.code === "unsupported_type"
              ? "BAD_REQUEST"
              : "INTERNAL_SERVER_ERROR",
        message: err.message,
      });
    }
    throw err;
  }

  await db.insert(auditLog).values({
    orgId: ctx.orgId,
    actor: ctx.actor,
    action: `extraction.${cfg.kind}`,
    resourceType: "document",
    resourceId: doc.id,
    payload: {
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      mimeType: doc.mimeType,
    },
  });

  return {
    documentId: doc.id,
    kind: cfg.kind,
    draft: result.data,
    model: result.model,
    usage: result.usage,
  };
}
