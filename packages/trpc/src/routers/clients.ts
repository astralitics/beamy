import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLog, clientContacts, clients, getDb } from "@beamy/db";
import {
  clientContactCreateInputSchema,
  clientContactIdInputSchema,
  clientContactListInputSchema,
  clientContactUpdateInputSchema,
  clientCreateInputSchema,
  clientIdInputSchema,
  clientListInputSchema,
  clientUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * `clients` router — first concrete entity in M1.
 *
 * Pattern that all subsequent entity routers follow:
 *   - Every procedure runs on `orgScopedProcedure` (D-10 invariant).
 *   - Reads filter by `org_id`; writes verify the row's `org_id` matches
 *     `ctx.orgId` before mutating.
 *   - Mutations are wrapped in `db.transaction` and append to `audit_log`
 *     in the same transaction (so the row + the audit entry land together
 *     or not at all).
 */
export const clientsRouter = router({
  list: orgScopedProcedure
    .input(clientListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(clients.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(clients.status, input.status));
      if (input.search) {
        const pattern = `%${input.search}%`;
        const searchClause = or(
          ilike(clients.name, pattern),
          ilike(clients.primaryContact, pattern),
        );
        if (searchClause) conditions.push(searchClause);
      }
      return await db
        .select()
        .from(clients)
        .where(and(...conditions))
        .orderBy(desc(clients.updatedAt));
    }),

  get: orgScopedProcedure
    .input(clientIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.id), eq(clients.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: orgScopedProcedure
    .input(clientCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(clients)
          .values({
            orgId: ctx.orgId,
            name: input.name,
            primaryContact: input.primaryContact ?? null,
            address: input.address ?? null,
            notes: input.notes ?? null,
            tags: input.tags ?? [],
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "client.created",
          resourceType: "client",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(clientUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(clients)
          .where(and(eq(clients.id, input.id), eq(clients.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof clients.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        if (input.patch.name !== undefined) setClause.name = input.patch.name;
        if (input.patch.primaryContact !== undefined) {
          setClause.primaryContact = input.patch.primaryContact ?? null;
        }
        if (input.patch.address !== undefined) {
          setClause.address = input.patch.address ?? null;
        }
        if (input.patch.notes !== undefined) {
          setClause.notes = input.patch.notes ?? null;
        }
        if (input.patch.tags !== undefined) setClause.tags = input.patch.tags;

        const [updated] = await tx
          .update(clients)
          .set(setClause)
          .where(eq(clients.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "client.updated",
          resourceType: "client",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  archive: orgScopedProcedure
    .input(clientIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setClientStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "archived",
      );
    }),

  restore: orgScopedProcedure
    .input(clientIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setClientStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "active",
      );
    }),

  // ─────────────────── client_contacts sub-entity ───────────────────

  listContacts: orgScopedProcedure
    .input(clientContactListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const ownsClient = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(eq(clients.id, input.clientId), eq(clients.orgId, ctx.orgId)),
        )
        .limit(1);
      if (!ownsClient[0]) throw new TRPCError({ code: "NOT_FOUND" });

      return await db
        .select()
        .from(clientContacts)
        .where(
          and(
            eq(clientContacts.clientId, input.clientId),
            eq(clientContacts.orgId, ctx.orgId),
          ),
        )
        .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name));
    }),

  addContact: orgScopedProcedure
    .input(clientContactCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const ownsClient = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(
            and(eq(clients.id, input.clientId), eq(clients.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!ownsClient[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const [row] = await tx
          .insert(clientContacts)
          .values({
            orgId: ctx.orgId,
            clientId: input.clientId,
            name: input.name,
            role: emptyToNull(input.role),
            email: emptyToNull(input.email),
            phone: emptyToNull(input.phone),
            isPrimary: input.isPrimary ?? false,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "client_contact.created",
          resourceType: "client_contact",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  updateContact: orgScopedProcedure
    .input(clientContactUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(clientContacts)
          .where(
            and(
              eq(clientContacts.id, input.id),
              eq(clientContacts.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof clientContacts.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.role !== undefined) setClause.role = emptyToNull(p.role);
        if (p.email !== undefined) setClause.email = emptyToNull(p.email);
        if (p.phone !== undefined) setClause.phone = emptyToNull(p.phone);
        if (p.isPrimary !== undefined) setClause.isPrimary = p.isPrimary;

        const [updated] = await tx
          .update(clientContacts)
          .set(setClause)
          .where(eq(clientContacts.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "client_contact.updated",
          resourceType: "client_contact",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  removeContact: orgScopedProcedure
    .input(clientContactIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(clientContacts)
          .where(
            and(
              eq(clientContacts.id, input.id),
              eq(clientContacts.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx
          .delete(clientContacts)
          .where(eq(clientContacts.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "client_contact.deleted",
          resourceType: "client_contact",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),
});

async function setClientStatus(
  ctx: { orgId: string; actor: string },
  id: string,
  status: "active" | "archived",
) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.orgId, ctx.orgId)))
      .limit(1);
    if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await tx
      .update(clients)
      .set({
        status,
        updatedAt: new Date(),
        updatedBy: ctx.actor,
      })
      .where(eq(clients.id, id))
      .returning();
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actor: ctx.actor,
      action: status === "archived" ? "client.archived" : "client.restored",
      resourceType: "client",
      resourceId: id,
    });
    return updated;
  });
}
