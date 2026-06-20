import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLog, getDb, orgMemberships, orgs } from "@beamy/db";
import { platformAdminProcedure, router } from "../init";
import {
  assertNotLastAdmin,
  createAuthUserAndMembership,
} from "../lib/admin-access";

/**
 * Platform-admin surface — cross-tenant workspace + access management. Every
 * procedure is gated by `platformAdminProcedure` (verified email on the
 * `PLATFORM_ADMIN_EMAILS` allowlist) and intentionally ignores `ctx.orgId`:
 * these operate against any tenant. The normal membership-scoped path is
 * untouched for everyone else.
 *
 * Ported from Cadenza's `admin.access`, adapted to Beamy (org_memberships,
 * roles owner/admin/member, no `status` column) — and crucially WITHOUT the
 * `WHERE status = 'active'` filter that silently dropped freshly-created
 * workspaces from the list.
 */

const roleSchema = z.enum(["owner", "admin", "member"]);
const verticalSchema = z.enum(["construction", "landscaping"]);

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || "workspace";
}

export const adminRouter = router({
  access: router({
    /**
     * EVERY workspace (no status filter — new ones can't be missed) with a flat
     * list of its members. The page joins these against `users` for emails.
     */
    orgs: platformAdminProcedure.query(async () => {
      const db = getDb();
      const allOrgs = await db
        .select({
          id: orgs.id,
          name: orgs.name,
          slug: orgs.slug,
          vertical: orgs.vertical,
          defaultCurrency: orgs.defaultCurrency,
          createdAt: orgs.createdAt,
        })
        .from(orgs)
        .orderBy(desc(orgs.createdAt));

      if (allOrgs.length === 0) return [];

      const members = await db
        .select({
          orgId: orgMemberships.orgId,
          userId: orgMemberships.userId,
          role: orgMemberships.role,
          joinedAt: orgMemberships.joinedAt,
        })
        .from(orgMemberships)
        .where(
          inArray(
            orgMemberships.orgId,
            allOrgs.map((o) => o.id),
          ),
        )
        .orderBy(asc(orgMemberships.joinedAt));

      const byOrg = new Map<string, typeof members>();
      for (const m of members) {
        const arr = byOrg.get(m.orgId) ?? [];
        arr.push(m);
        byOrg.set(m.orgId, arr);
      }
      return allOrgs.map((o) => ({ ...o, members: byOrg.get(o.id) ?? [] }));
    }),

    /**
     * EVERY Supabase auth login (capped 1000), each with the workspaces it
     * belongs to. Includes accounts with NO membership (e.g. signed up but never
     * joined) so they're visible + deletable — the app's only window into
     * `auth.users`. Capped at 1000.
     */
    users: platformAdminProcedure.query(async () => {
      const db = getDb();
      const { getSupabaseAdmin } = await import("../lib/supabase-admin");
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      const memberships = await db
        .select({
          userId: orgMemberships.userId,
          orgId: orgMemberships.orgId,
          role: orgMemberships.role,
          orgName: orgs.name,
        })
        .from(orgMemberships)
        .innerJoin(orgs, eq(orgs.id, orgMemberships.orgId));
      const byUser = new Map<string, typeof memberships>();
      for (const m of memberships) {
        const arr = byUser.get(m.userId) ?? [];
        arr.push(m);
        byUser.set(m.userId, arr);
      }

      return (data?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? null,
        fullName:
          (u.user_metadata?.full_name as string | undefined) ?? null,
        memberships: (byUser.get(u.id) ?? []).map((m) => ({
          orgId: m.orgId,
          orgName: m.orgName,
          role: m.role,
        })),
      }));
    }),

    /**
     * Delete a login account ENTIRELY — the Supabase `auth.users` row AND all of
     * its memberships ("remove from both"). This is the only place the app can
     * delete a login. Refuses self-deletion. The auth row is removed last so a
     * failure there doesn't leave us half-cleaned.
     */
    deleteUser: platformAdminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.userId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot delete your own account.",
          });
        const db = getDb();
        await db
          .delete(orgMemberships)
          .where(eq(orgMemberships.userId, input.userId));

        const { getSupabaseAdmin } = await import("../lib/supabase-admin");
        const admin = getSupabaseAdmin();
        const { error } = await admin.auth.admin.deleteUser(input.userId);
        if (error && !/not.?found/i.test(error.message ?? ""))
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message ?? "Failed to delete the auth user.",
          });

        const [anchor] = await db
          .select({ id: orgs.id })
          .from(orgs)
          .limit(1);
        if (anchor) {
          await db.insert(auditLog).values({
            orgId: anchor.id,
            actor: ctx.actor,
            action: "user.deleted",
            resourceType: "user",
            resourceId: input.userId,
            payload: { via: "platform_admin" },
          });
        }
        return { ok: true as const };
      }),

    /**
     * Audit a platform admin entering a workspace they don't belong to. The
     * actual cross-tenant access is granted by `resolveOrgMembership` (synthesized
     * owner) once the client sends `x-active-org`; this just records the entry.
     */
    enterWorkspace: platformAdminProcedure
      .input(z.object({ orgId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [org] = await db
          .select({ id: orgs.id, name: orgs.name })
          .from(orgs)
          .where(eq(orgs.id, input.orgId))
          .limit(1);
        if (!org)
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found." });
        await db.insert(auditLog).values({
          orgId: org.id,
          actor: ctx.actor,
          action: "org.entered",
          resourceType: "org",
          resourceId: org.id,
          payload: { name: org.name, via: "platform_admin" },
        });
        return { ok: true as const, orgId: org.id };
      }),

    /**
     * Provision a brand-new workspace + its owner in one shot — the bootstrap
     * for strictly invite-only. Creates the org, ensures the owner's auth
     * account exists (returns a password if freshly created), and makes them
     * `owner`.
     */
    createWorkspace: platformAdminProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(120),
          vertical: verticalSchema,
          ownerEmail: z.string().trim().email().max(200),
          ownerFullName: z.string().trim().min(1).max(120).optional(),
          ownerPassword: z.string().min(8).max(72).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const slug = `${slugify(input.name)}-${randomBytes(2).toString("hex")}`;

        // We need a real owner_user_id for the org row, but the auth user is
        // created by the membership helper. Create the auth user + a temporary
        // ownerless org is awkward; instead create the user first via the
        // helper against a placeholder is not possible. So: create the org with
        // a sentinel, then patch ownerUserId after the user exists.
        const [org] = await db
          .insert(orgs)
          .values({
            name: input.name,
            slug,
            vertical: input.vertical,
            ownerUserId: ctx.userId, // patched below to the real owner
          })
          .returning();
        if (!org)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const result = await createAuthUserAndMembership({
          email: input.ownerEmail,
          orgId: org.id,
          role: "owner",
          fullName: input.ownerFullName,
          customPassword: input.ownerPassword,
          invitedByUserId: ctx.userId,
        });

        await db
          .update(orgs)
          .set({ ownerUserId: result.userId })
          .where(eq(orgs.id, org.id));

        await db.insert(auditLog).values({
          orgId: org.id,
          actor: ctx.actor,
          action: "org.created",
          resourceType: "org",
          resourceId: org.id,
          payload: {
            name: org.name,
            vertical: org.vertical,
            ownerEmail: input.ownerEmail,
            via: "platform_admin",
          },
        });

        return {
          orgId: org.id,
          ownerUserId: result.userId,
          generatedPassword: result.generatedPassword,
          passwordReset: result.passwordReset,
          alreadyExisted: result.alreadyExisted,
        };
      }),

    /** Add (or link) a user to a workspace at a role. Creates the auth user if new. */
    addMember: platformAdminProcedure
      .input(
        z.object({
          orgId: z.string().uuid(),
          email: z.string().trim().email().max(200),
          role: roleSchema,
          fullName: z.string().trim().min(1).max(120).optional(),
          customPassword: z.string().min(8).max(72).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createAuthUserAndMembership({
          email: input.email,
          orgId: input.orgId,
          role: input.role,
          fullName: input.fullName,
          customPassword: input.customPassword,
          invitedByUserId: ctx.userId,
        });
        await getDb()
          .insert(auditLog)
          .values({
            orgId: input.orgId,
            actor: ctx.actor,
            action: "membership.granted",
            resourceType: "org_membership",
            resourceId: result.userId,
            payload: { email: input.email, role: input.role, via: "platform_admin" },
          });
        return result;
      }),

    /** Change a member's role in a workspace. Guards the last owner/admin. */
    updateMember: platformAdminProcedure
      .input(
        z.object({
          orgId: z.string().uuid(),
          userId: z.string().uuid(),
          role: roleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.role !== "owner" && input.role !== "admin") {
          await assertNotLastAdmin(input.orgId, input.userId, { kind: "demote" });
        }
        const db = getDb();
        await db
          .update(orgMemberships)
          .set({ role: input.role })
          .where(
            and(
              eq(orgMemberships.orgId, input.orgId),
              eq(orgMemberships.userId, input.userId),
            ),
          );
        await db.insert(auditLog).values({
          orgId: input.orgId,
          actor: ctx.actor,
          action: "membership.role_changed",
          resourceType: "org_membership",
          resourceId: input.userId,
          payload: { role: input.role, via: "platform_admin" },
        });
        return { ok: true as const };
      }),

    /** Revoke a user's access to a workspace. Guards self + last owner/admin. */
    removeMember: platformAdminProcedure
      .input(z.object({ orgId: z.string().uuid(), userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.userId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot remove yourself from a workspace here.",
          });
        await assertNotLastAdmin(input.orgId, input.userId, { kind: "remove" });
        const db = getDb();
        await db
          .delete(orgMemberships)
          .where(
            and(
              eq(orgMemberships.orgId, input.orgId),
              eq(orgMemberships.userId, input.userId),
            ),
          );
        await db.insert(auditLog).values({
          orgId: input.orgId,
          actor: ctx.actor,
          action: "membership.revoked",
          resourceType: "org_membership",
          resourceId: input.userId,
          payload: { via: "platform_admin" },
        });
        return { ok: true as const };
      }),

    /**
     * Hard-delete a whole workspace (cascade). Type-the-name confirmation. The
     * deletion audit is anchored to a SURVIVING org (the target's own audit rows
     * cascade away), written in the same transaction as the delete.
     */
    deleteWorkspace: platformAdminProcedure
      .input(z.object({ orgId: z.string().uuid(), confirmName: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [target] = await db
          .select({ id: orgs.id, name: orgs.name })
          .from(orgs)
          .where(eq(orgs.id, input.orgId))
          .limit(1);
        if (!target)
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found." });
        if (input.confirmName.trim() !== target.name)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The typed name doesn't match this workspace.",
          });

        // A durable audit home that won't cascade away with the target.
        const [anchor] = await db
          .select({ id: orgs.id })
          .from(orgs)
          .where(ne(orgs.id, input.orgId))
          .limit(1);

        await db.transaction(async (tx) => {
          if (anchor) {
            await tx.insert(auditLog).values({
              orgId: anchor.id,
              actor: ctx.actor,
              action: "org.deleted",
              resourceType: "org",
              resourceId: target.id,
              payload: { name: target.name, via: "platform_admin" },
            });
          }
          await tx.delete(orgs).where(eq(orgs.id, input.orgId));
        });
        return { ok: true as const };
      }),
  }),
});
