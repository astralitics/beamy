import { and, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  assets,
  auditLog,
  documents,
  getDb,
  materials,
  projects,
  rooms,
} from "@beamy/db";
import {
  documentCreateInputSchema,
  documentIdInputSchema,
  documentListInputSchema,
  documentUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";
import { BUCKET, getStorageClient } from "../lib/storage";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 10; // 10 minutes

/**
 * `documents` router — project-scoped file library backed by Supabase
 * Storage.
 *
 * Upload flow: client calls `documents.create` with file metadata →
 * server records the row + mints a signed PUT URL into the `documents`
 * bucket → client uploads bytes directly to that URL. File bytes
 * never traverse tRPC.
 *
 * Download flow: client calls `documents.getDownloadUrl` → server
 * verifies ownership + mints a signed GET URL → client navigates.
 *
 * "Orphan rows" (create succeeded but upload failed) leave a metadata
 * row pointing at a non-existent blob. The download endpoint returns
 * a clear error; the UI surfaces it. A cleanup job could sweep these
 * later (deferred).
 */
export const documentsRouter = router({
  list: orgScopedProcedure
    .input(documentListInputSchema)
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
        eq(documents.projectId, input.projectId),
        eq(documents.orgId, ctx.orgId),
      ];
      if (input.roomId) conditions.push(eq(documents.roomId, input.roomId));
      if (input.assetId) conditions.push(eq(documents.assetId, input.assetId));
      if (input.materialId) {
        conditions.push(eq(documents.materialId, input.materialId));
      }
      if (input.search) {
        const p = `%${input.search}%`;
        const c = or(
          ilike(documents.name, p),
          ilike(documents.description, p),
        );
        if (c) conditions.push(c);
      }

      return await db
        .select({
          doc: documents,
          room: rooms,
          asset: assets,
          material: materials,
        })
        .from(documents)
        .leftJoin(rooms, eq(documents.roomId, rooms.id))
        .leftJoin(assets, eq(documents.assetId, assets.id))
        .leftJoin(materials, eq(documents.materialId, materials.id))
        .where(and(...conditions))
        .orderBy(desc(documents.createdAt))
        .then((rows) =>
          rows.map((r) => ({
            ...r.doc,
            room: r.room,
            asset: r.asset,
            material: r.material,
          })),
        );
    }),

  create: orgScopedProcedure
    .input(documentCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const storage = getStorageClient();

      await verifyOwnership(db, ctx.orgId, input.projectId, {
        roomId: input.roomId,
        assetId: input.assetId,
        materialId: input.materialId,
      });

      // Pre-generate the document id so we can build the storage path
      // before the row is inserted (path includes the id for uniqueness).
      const docId = crypto.randomUUID();
      const ext = guessExtension(input.name, input.mimeType);
      const storagePath = `${ctx.orgId}/${input.projectId}/${docId}${ext}`;

      // Mint the signed upload URL first. If this fails (e.g. bucket
      // missing) we never create the orphan row.
      const { data: uploadData, error: uploadErr } = await storage.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath);
      if (uploadErr || !uploadData) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Storage error: ${uploadErr?.message ?? "no upload URL"}`,
        });
      }

      const [row] = await db
        .insert(documents)
        .values({
          id: docId,
          orgId: ctx.orgId,
          projectId: input.projectId,
          roomId: input.roomId ?? null,
          assetId: input.assetId ?? null,
          materialId: input.materialId ?? null,
          name: input.name,
          description: null,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          storagePath,
          createdBy: ctx.actor,
          updatedBy: ctx.actor,
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.insert(auditLog).values({
        orgId: ctx.orgId,
        actor: ctx.actor,
        action: "document.created",
        resourceType: "document",
        resourceId: row.id,
        payload: {
          name: input.name,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
        },
      });

      return {
        document: row,
        upload: {
          signedUrl: uploadData.signedUrl,
          token: uploadData.token,
          path: uploadData.path,
        },
      };
    }),

  getDownloadUrl: orgScopedProcedure
    .input(documentIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const storage = getStorageClient();

      const row = await db
        .select()
        .from(documents)
        .where(
          and(eq(documents.id, input.id), eq(documents.orgId, ctx.orgId)),
        )
        .limit(1)
        .then((r) => r[0]);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const { data, error } = await storage.storage
        .from(BUCKET)
        .createSignedUrl(row.storagePath, SIGNED_URL_EXPIRY_SECONDS, {
          download: row.name,
        });
      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Storage error: ${error?.message ?? "no download URL"} (the file may not have finished uploading)`,
        });
      }
      return { signedUrl: data.signedUrl };
    }),

  update: orgScopedProcedure
    .input(documentUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(documents)
          .where(
            and(eq(documents.id, input.id), eq(documents.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof documents.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.description !== undefined) setClause.description = p.description;
        if (p.roomId !== undefined) setClause.roomId = p.roomId;
        if (p.assetId !== undefined) setClause.assetId = p.assetId;
        if (p.materialId !== undefined) setClause.materialId = p.materialId;

        const [updated] = await tx
          .update(documents)
          .set(setClause)
          .where(eq(documents.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "document.updated",
          resourceType: "document",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  remove: orgScopedProcedure
    .input(documentIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const storage = getStorageClient();

      const row = await db
        .select()
        .from(documents)
        .where(
          and(eq(documents.id, input.id), eq(documents.orgId, ctx.orgId)),
        )
        .limit(1)
        .then((r) => r[0]);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      // Delete the storage object first. If this fails the row stays —
      // the user can retry. (Better than the row vanishing while the
      // blob lingers undeletable.)
      const { error: removeErr } = await storage.storage
        .from(BUCKET)
        .remove([row.storagePath]);
      // We tolerate "not found" here — orphan-row case where the blob
      // never landed. Other errors bubble up.
      if (removeErr && !/not[_ ]?found/i.test(removeErr.message)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Storage error: ${removeErr.message}`,
        });
      }

      await getDb()
        .delete(documents)
        .where(eq(documents.id, input.id));

      await getDb().insert(auditLog).values({
        orgId: ctx.orgId,
        actor: ctx.actor,
        action: "document.deleted",
        resourceType: "document",
        resourceId: input.id,
        payload: { name: row.name, storagePath: row.storagePath },
      });

      return { ok: true as const };
    }),
});

// ────────────────────── helpers ──────────────────────

/**
 * Derive a file extension (with leading dot, or empty string) from the
 * user-supplied filename — falling back to a sniff of the mime type if
 * the filename has none. Used only for the storage path; the row's
 * `name` keeps the original.
 */
function guessExtension(name: string, mimeType: string): string {
  const m = name.match(/\.[a-zA-Z0-9]{1,8}$/);
  if (m) return m[0].toLowerCase();
  const sub = mimeType.split("/")[1]?.split(";")[0]?.split("+")[0];
  if (!sub) return "";
  // Map a few common subtypes to their canonical extension.
  const map: Record<string, string> = {
    jpeg: ".jpg",
    "svg+xml": ".svg",
    plain: ".txt",
    msword: ".doc",
    "vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  };
  return `.${map[sub] ?? sub}`;
}

async function verifyOwnership(
  db: ReturnType<typeof getDb>,
  orgId: string,
  projectId: string,
  refs: { roomId?: string; assetId?: string; materialId?: string },
) {
  const ok = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .limit(1);
  if (!ok[0]) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Project not found in this org",
    });
  }
  if (refs.roomId) {
    const r = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.id, refs.roomId), eq(rooms.orgId, orgId)))
      .limit(1);
    if (!r[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Room not found in this org",
      });
    }
  }
  if (refs.assetId) {
    const r = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, refs.assetId), eq(assets.orgId, orgId)))
      .limit(1);
    if (!r[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Asset not found in this org",
      });
    }
  }
  if (refs.materialId) {
    const r = await db
      .select({ id: materials.id })
      .from(materials)
      .where(and(eq(materials.id, refs.materialId), eq(materials.orgId, orgId)))
      .limit(1);
    if (!r[0]) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Material not found in this org",
      });
    }
  }
}
