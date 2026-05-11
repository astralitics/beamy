import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  getDb,
  vendorCompliance,
  vendorContacts,
  vendors,
} from "@beamy/db";
import {
  complianceCreateInputSchema,
  complianceIdInputSchema,
  complianceListInputSchema,
  complianceUpdateInputSchema,
  vendorContactCreateInputSchema,
  vendorContactIdInputSchema,
  vendorContactListInputSchema,
  vendorContactUpdateInputSchema,
  vendorCreateInputSchema,
  vendorIdInputSchema,
  vendorListInputSchema,
  vendorUpdateInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

/**
 * `vendors` router — full CRUD over the vendor parent + compliance
 * sub-entity (W9 / COIs / licenses with expiration dates).
 *
 * Same pattern as `clientsRouter`: every procedure on orgScopedProcedure,
 * every mutation wrapped in db.transaction with an audit_log insert in
 * the same tx.
 *
 * `vendor_contacts` schema lands now (so the migration is complete) but
 * its CRUD procedures wait for the contacts pass that also touches
 * `client_contacts` for shape symmetry.
 */
export const vendorsRouter = router({
  // ─────────────────── vendor CRUD ───────────────────

  list: orgScopedProcedure
    .input(vendorListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(vendors.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(vendors.status, input.status));
      if (input.trade) conditions.push(eq(vendors.trade, input.trade));
      if (input.search) {
        const pattern = `%${input.search}%`;
        const searchClause = or(
          ilike(vendors.name, pattern),
          ilike(vendors.primaryContact, pattern),
          ilike(vendors.email, pattern),
        );
        if (searchClause) conditions.push(searchClause);
      }
      return await db
        .select()
        .from(vendors)
        .where(and(...conditions))
        .orderBy(desc(vendors.updatedAt));
    }),

  get: orgScopedProcedure
    .input(vendorIdInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(vendors)
        .where(and(eq(vendors.id, input.id), eq(vendors.orgId, ctx.orgId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: orgScopedProcedure
    .input(vendorCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(vendors)
          .values({
            orgId: ctx.orgId,
            name: input.name,
            trade: input.trade,
            primaryContact: input.primaryContact ?? null,
            email: emptyToNull(input.email),
            phone: input.phone ?? null,
            address: input.address ?? null,
            defaultRateAmount: input.defaultRateAmount ?? null,
            defaultRateCurrency: input.defaultRateCurrency ?? null,
            billingUnit: input.billingUnit ?? "hour",
            paymentTerms: input.paymentTerms ?? null,
            ein: input.ein ?? null,
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
          action: "vendor.created",
          resourceType: "vendor",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  update: orgScopedProcedure
    .input(vendorUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(vendors)
          .where(and(eq(vendors.id, input.id), eq(vendors.orgId, ctx.orgId)))
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof vendors.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.name !== undefined) setClause.name = p.name;
        if (p.trade !== undefined) setClause.trade = p.trade;
        if (p.primaryContact !== undefined) {
          setClause.primaryContact = p.primaryContact ?? null;
        }
        if (p.email !== undefined) setClause.email = emptyToNull(p.email);
        if (p.phone !== undefined) setClause.phone = p.phone ?? null;
        if (p.address !== undefined) setClause.address = p.address ?? null;
        if (p.defaultRateAmount !== undefined) {
          setClause.defaultRateAmount = p.defaultRateAmount ?? null;
        }
        if (p.defaultRateCurrency !== undefined) {
          setClause.defaultRateCurrency = p.defaultRateCurrency ?? null;
        }
        if (p.billingUnit !== undefined) setClause.billingUnit = p.billingUnit;
        if (p.paymentTerms !== undefined) {
          setClause.paymentTerms = p.paymentTerms ?? null;
        }
        if (p.ein !== undefined) setClause.ein = p.ein ?? null;
        if (p.notes !== undefined) setClause.notes = p.notes ?? null;
        if (p.tags !== undefined) setClause.tags = p.tags;

        const [updated] = await tx
          .update(vendors)
          .set(setClause)
          .where(eq(vendors.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "vendor.updated",
          resourceType: "vendor",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  archive: orgScopedProcedure
    .input(vendorIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setVendorStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "archived",
      );
    }),

  restore: orgScopedProcedure
    .input(vendorIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      return await setVendorStatus(
        { orgId: ctx.orgId, actor: ctx.actor },
        input.id,
        "active",
      );
    }),

  // ─────────────────── compliance sub-entity ───────────────────

  listCompliance: orgScopedProcedure
    .input(complianceListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      // Verify the vendor belongs to this org before exposing its compliance.
      const ownsVendor = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(
          and(eq(vendors.id, input.vendorId), eq(vendors.orgId, ctx.orgId)),
        )
        .limit(1);
      if (!ownsVendor[0]) throw new TRPCError({ code: "NOT_FOUND" });

      return await db
        .select()
        .from(vendorCompliance)
        .where(
          and(
            eq(vendorCompliance.vendorId, input.vendorId),
            eq(vendorCompliance.orgId, ctx.orgId),
          ),
        )
        .orderBy(asc(vendorCompliance.expiresAt));
    }),

  addCompliance: orgScopedProcedure
    .input(complianceCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const ownsVendor = await tx
          .select({ id: vendors.id })
          .from(vendors)
          .where(
            and(eq(vendors.id, input.vendorId), eq(vendors.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!ownsVendor[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const [row] = await tx
          .insert(vendorCompliance)
          .values({
            orgId: ctx.orgId,
            vendorId: input.vendorId,
            docType: input.docType,
            effectiveFrom: input.effectiveFrom ?? null,
            expiresAt: input.expiresAt ?? null,
            coverageAmount: input.coverageAmount ?? null,
            coverageCurrency: input.coverageCurrency ?? null,
            notes: input.notes ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "vendor_compliance.created",
          resourceType: "vendor_compliance",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  updateCompliance: orgScopedProcedure
    .input(complianceUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(vendorCompliance)
          .where(
            and(
              eq(vendorCompliance.id, input.id),
              eq(vendorCompliance.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof vendorCompliance.$inferInsert> = {
          updatedAt: new Date(),
          updatedBy: ctx.actor,
        };
        const p = input.patch;
        if (p.docType !== undefined) setClause.docType = p.docType;
        if (p.effectiveFrom !== undefined) {
          setClause.effectiveFrom = p.effectiveFrom ?? null;
        }
        if (p.expiresAt !== undefined) {
          setClause.expiresAt = p.expiresAt ?? null;
        }
        if (p.coverageAmount !== undefined) {
          setClause.coverageAmount = p.coverageAmount ?? null;
        }
        if (p.coverageCurrency !== undefined) {
          setClause.coverageCurrency = p.coverageCurrency ?? null;
        }
        if (p.notes !== undefined) setClause.notes = p.notes ?? null;

        const [updated] = await tx
          .update(vendorCompliance)
          .set(setClause)
          .where(eq(vendorCompliance.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "vendor_compliance.updated",
          resourceType: "vendor_compliance",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  removeCompliance: orgScopedProcedure
    .input(complianceIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(vendorCompliance)
          .where(
            and(
              eq(vendorCompliance.id, input.id),
              eq(vendorCompliance.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx
          .delete(vendorCompliance)
          .where(eq(vendorCompliance.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "vendor_compliance.deleted",
          resourceType: "vendor_compliance",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),

  // ─────────────────── vendor_contacts sub-entity ───────────────────

  listContacts: orgScopedProcedure
    .input(vendorContactListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const ownsVendor = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(
          and(eq(vendors.id, input.vendorId), eq(vendors.orgId, ctx.orgId)),
        )
        .limit(1);
      if (!ownsVendor[0]) throw new TRPCError({ code: "NOT_FOUND" });

      return await db
        .select()
        .from(vendorContacts)
        .where(
          and(
            eq(vendorContacts.vendorId, input.vendorId),
            eq(vendorContacts.orgId, ctx.orgId),
          ),
        )
        .orderBy(desc(vendorContacts.isPrimary), asc(vendorContacts.name));
    }),

  addContact: orgScopedProcedure
    .input(vendorContactCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const ownsVendor = await tx
          .select({ id: vendors.id })
          .from(vendors)
          .where(
            and(eq(vendors.id, input.vendorId), eq(vendors.orgId, ctx.orgId)),
          )
          .limit(1);
        if (!ownsVendor[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const [row] = await tx
          .insert(vendorContacts)
          .values({
            orgId: ctx.orgId,
            vendorId: input.vendorId,
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
          action: "vendor_contact.created",
          resourceType: "vendor_contact",
          resourceId: row.id,
          payload: input,
        });
        return row;
      });
    }),

  updateContact: orgScopedProcedure
    .input(vendorContactUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(vendorContacts)
          .where(
            and(
              eq(vendorContacts.id, input.id),
              eq(vendorContacts.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        const setClause: Partial<typeof vendorContacts.$inferInsert> = {
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
          .update(vendorContacts)
          .set(setClause)
          .where(eq(vendorContacts.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "vendor_contact.updated",
          resourceType: "vendor_contact",
          resourceId: input.id,
          payload: input.patch,
        });
        return updated;
      });
    }),

  removeContact: orgScopedProcedure
    .input(vendorContactIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(vendorContacts)
          .where(
            and(
              eq(vendorContacts.id, input.id),
              eq(vendorContacts.orgId, ctx.orgId),
            ),
          )
          .limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

        await tx
          .delete(vendorContacts)
          .where(eq(vendorContacts.id, input.id));

        await tx.insert(auditLog).values({
          orgId: ctx.orgId,
          actor: ctx.actor,
          action: "vendor_contact.deleted",
          resourceType: "vendor_contact",
          resourceId: input.id,
          payload: existing[0],
        });
        return { ok: true as const };
      });
    }),
});

async function setVendorStatus(
  ctx: { orgId: string; actor: string },
  id: string,
  status: "active" | "archived",
) {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.orgId, ctx.orgId)))
      .limit(1);
    if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await tx
      .update(vendors)
      .set({
        status,
        updatedAt: new Date(),
        updatedBy: ctx.actor,
      })
      .where(eq(vendors.id, id))
      .returning();
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      actor: ctx.actor,
      action: status === "archived" ? "vendor.archived" : "vendor.restored",
      resourceType: "vendor",
      resourceId: id,
    });
    return updated;
  });
}

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
