import { z } from "zod";

/**
 * Documents — project-scoped file library backed by Supabase Storage.
 *
 * Upload flow: client calls `documents.create` with file metadata →
 * server creates the row + returns a signed upload URL → client PUTs
 * the file bytes to that URL → done. File bytes never traverse tRPC.
 */

/** Hard cap on uploads. 50 MB matches a generous PDF / photo set. */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export const documentCreateInputSchema = z.object({
  projectId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  mimeType: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(
      /^[a-zA-Z0-9.\-+]+\/[a-zA-Z0-9.\-+*]+$/,
      "expected `type/subtype`",
    ),
  sizeBytes: z
    .number()
    .int()
    .min(1, "file is empty")
    .max(MAX_DOCUMENT_BYTES, "file exceeds 50 MB"),
});
export type DocumentCreateInput = z.infer<typeof documentCreateInputSchema>;

export const documentUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    roomId: z.string().uuid().nullable().optional(),
    assetId: z.string().uuid().nullable().optional(),
    materialId: z.string().uuid().nullable().optional(),
  }),
});
export type DocumentUpdateInput = z.infer<typeof documentUpdateInputSchema>;

export const documentListInputSchema = z.object({
  projectId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
});
export type DocumentListInput = z.infer<typeof documentListInputSchema>;

export const documentIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type DocumentIdInput = z.infer<typeof documentIdInputSchema>;
