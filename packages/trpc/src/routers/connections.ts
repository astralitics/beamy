import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { connections, getDb } from "@beamy/db";
import { orgScopedProcedure, router } from "../init";
import { decryptSecret, encryptSecret } from "../lib/secrets";

/**
 * `connections` router — manage stored credentials ("Connections") a step can use to reach an
 * external app. Secret VALUES are encrypted at rest and never leave the server; the client only
 * ever sees metadata (name, provider, config, whether a secret is set). The runtime resolves the
 * decrypted secret via `resolveConnectionSecret` (not a tRPC procedure). Real provider
 * integrations (OAuth, app APIs) are still placeholders — this is the secrets-management layer.
 */

const PROVIDERS = ["api_key", "bearer", "basic", "header"] as const;

type ConnectionRow = typeof connections.$inferSelect;

/** The client-safe shape — metadata only, never the secret. */
function view(row: ConnectionRow) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    config: (row.config as Record<string, unknown> | null) ?? null,
    hasSecret: row.secretEnc != null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const connectionsRouter = router({
  list: orgScopedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(connections)
      .where(eq(connections.orgId, ctx.orgId))
      .orderBy(desc(connections.updatedAt));
    return rows.map(view);
  }),

  create: orgScopedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        provider: z.enum(PROVIDERS),
        secret: z.record(z.string()).default({}),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .insert(connections)
        .values({
          orgId: ctx.orgId,
          name: input.name,
          provider: input.provider,
          secretEnc: Object.keys(input.secret).length ? encryptSecret(input.secret) : null,
          config: input.config ?? null,
          createdBy: ctx.actor,
          updatedBy: ctx.actor,
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return view(row);
    }),

  update: orgScopedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        config: z.record(z.unknown()).optional(),
        /** Provided only when rotating the secret; omit to leave it unchanged. */
        secret: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const patch: Partial<typeof connections.$inferInsert> = { updatedBy: ctx.actor, updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.config !== undefined) patch.config = input.config;
      if (input.secret !== undefined) {
        patch.secretEnc = Object.keys(input.secret).length ? encryptSecret(input.secret) : null;
      }
      const [row] = await db
        .update(connections)
        .set(patch)
        .where(and(eq(connections.id, input.id), eq(connections.orgId, ctx.orgId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return view(row);
    }),

  delete: orgScopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(connections).where(and(eq(connections.id, input.id), eq(connections.orgId, ctx.orgId)));
      return { id: input.id };
    }),
});

/**
 * Server-only: resolve a connection's decrypted secret for the runtime. NOT a tRPC procedure —
 * the decrypted secret must never reach the client. Returns null if the connection isn't found
 * in the org.
 */
export async function resolveConnectionSecret(
  orgId: string,
  connectionId: string,
): Promise<{ provider: string; config: Record<string, unknown> | null; secret: Record<string, unknown> } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.orgId, orgId)))
    .limit(1);
  if (!row) return null;
  return {
    provider: row.provider,
    config: (row.config as Record<string, unknown> | null) ?? null,
    secret: row.secretEnc ? decryptSecret(row.secretEnc) : {},
  };
}
