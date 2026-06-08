import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";

/**
 * Shared Supabase Storage access for the `documents` bucket.
 *
 * Both the documents router (signed upload/download URLs) and the
 * extraction router (server-side byte download for the model call) use
 * this — one lazy admin client, built on demand so dev-from-zero (no
 * SUPABASE_URL / key set) doesn't crash at boot; the endpoints throw a
 * clear error instead.
 */

export const BUCKET = "documents";

let _storageClient: SupabaseClient | null = null;

export function getStorageClient(): SupabaseClient {
  if (_storageClient) return _storageClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server for the documents feature.",
    });
  }
  _storageClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _storageClient;
}

/**
 * Download a document's bytes from Storage by its `storagePath`. Used
 * server-side (e.g. to hand the file to the extraction model). Throws a
 * clear error when the blob is missing — the common "orphan row" case
 * where the metadata row landed but the upload never finished.
 */
export async function downloadDocumentBytes(
  storagePath: string,
): Promise<Buffer> {
  const storage = getStorageClient();
  const { data, error } = await storage.storage
    .from(BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Storage download failed: ${error?.message ?? "no data"} (the file may not have finished uploading)`,
    });
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
