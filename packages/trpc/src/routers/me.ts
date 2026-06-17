import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  auditLog,
  getDb,
  invitations,
  orgMemberships,
  orgs,
  type Org,
} from "@beamy/db";
import {
  orgScopedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../init";
import { listMembershipsWithOrg, resolveOrgMembership } from "../context";
import { redeemInvitation } from "../lib/redeem-invitation";

/**
 * `me` router — minimal end-to-end demo for M0:
 *  - public ping that doesn't touch the DB
 *  - org-scoped query that returns the active org (proves the middleware works)
 */
export const meRouter = router({
  ping: publicProcedure.query(() => ({
    ok: true,
    ts: new Date().toISOString(),
  })),

  whoami: orgScopedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, ctx.orgId))
      .limit(1);

    const org = rows[0];
    if (!org) {
      // Should not happen — orgScopedProcedure already verified membership.
      throw new Error(`Org ${ctx.orgId} disappeared mid-request`);
    }

    return {
      userId: ctx.userId,
      role: ctx.role,
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        vertical: org.vertical,
        defaultCurrency: org.defaultCurrency,
        locale: org.locale,
      },
    };
  }),

  /**
   * Non-throwing membership probe — the "am I authorized?" gate for invite-only
   * auth. Unlike `whoami` (which 403s when the user has no org), this returns a
   * status object so the client can route a brand-new user (e.g. a fresh Google
   * sign-in with no invite) to /redeem instead of crashing on a 403.
   */
  membership: protectedProcedure.query(async ({ ctx }) => {
    const m = await resolveOrgMembership(ctx.userId, ctx.activeOrgId);
    if (!m) {
      return { hasMembership: false as const, role: null, org: null };
    }
    const db = getDb();
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, m.orgId))
      .limit(1);
    return {
      hasMembership: true as const,
      role: m.role,
      org: org
        ? {
            id: org.id,
            name: org.name,
            slug: org.slug,
            vertical: org.vertical,
            defaultCurrency: org.defaultCurrency,
            locale: org.locale,
          }
        : null,
    };
  }),

  /**
   * Every workspace the signed-in user belongs to — powers the sidebar
   * workspace switcher. Returns each org's display fields + the user's role.
   * One entry for single-org users (the switcher then just shows the name).
   */
  listOrgs: protectedProcedure.query(async ({ ctx }) => {
    return await listMembershipsWithOrg(ctx.userId);
  }),

  /**
   * Whether the signed-in user is a platform admin (in the PLATFORM_ADMIN_EMAILS
   * allowlist) — the client uses this to reveal the cross-tenant admin surface.
   * Server-computed from the verified email; never trusted from the request.
   */
  isPlatformAdmin: protectedProcedure.query(({ ctx }) => ({
    isPlatformAdmin: ctx.isPlatformAdmin,
  })),

  /**
   * Authorization gate — Beamy's take on petfactory's `am_i_authorized` +
   * `provision_user_onboarding`, reconciled with the 1-user→1-org invariant
   * (D-12, so no "personal + demo workspaces" — one org per user).
   *
   * A signed-in user is authorized iff they already have a membership OR there
   * is an unused, unexpired invitation addressed to their email. In that second
   * case we AUTO-PROVISION on the spot: create the membership, mark the invite
   * consumed, and write the audit row (the three records). Everyone else gets
   * `authorized: false`, and the client signs them out.
   *
   * The email is read from the verified `auth.users` row (never client input) —
   * the same source petfactory reads via `auth.uid()`.
   */
  authorize: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();

    // 1. Existing member → authorized, no provisioning needed.
    const existing = await resolveOrgMembership(ctx.userId, ctx.activeOrgId);
    if (existing) {
      const [org] = await db
        .select()
        .from(orgs)
        .where(eq(orgs.id, existing.orgId))
        .limit(1);
      return {
        authorized: true as const,
        role: existing.role,
        org: orgView(org),
      };
    }

    // 2. Whitelist by email — an unused, unexpired invite addressed to this user.
    const emailRows = (await db.execute(
      sql`select email from auth.users where id = ${ctx.userId}::uuid limit 1`,
    )) as unknown as Array<{ email: string | null }>;
    const email = emailRows[0]?.email?.toLowerCase() ?? null;

    if (email) {
      const [inv] = await db
        .select()
        .from(invitations)
        .where(
          and(
            sql`lower(${invitations.email}) = ${email}`,
            isNull(invitations.acceptedAt),
            gt(invitations.expiresAt, sql`now()`),
          ),
        )
        .orderBy(desc(invitations.createdAt))
        .limit(1);

      if (inv) {
        // Auto-provision by redeeming the invite. For "workspace" invites this
        // spins up a brand-new org (invitee = owner); for "member" invites it
        // joins inv.orgId. Same branch as members.accept, shared helper.
        const result = await db.transaction(async (tx) => {
          // Re-check inside the tx to guard the 1-user→1-org invariant.
          const already = await tx
            .select({ id: orgMemberships.id })
            .from(orgMemberships)
            .where(eq(orgMemberships.userId, ctx.userId))
            .limit(1);
          if (already[0]) return null;
          return await redeemInvitation(
            tx,
            inv,
            ctx.userId,
            ctx.actor,
            "email_whitelist",
          );
        });

        if (result) {
          const [org] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.id, result.orgId))
            .limit(1);
          return {
            authorized: true as const,
            role: result.role,
            org: orgView(org),
          };
        }

        // Raced with a concurrent provision — resolve the membership that won.
        const m = await resolveOrgMembership(ctx.userId, ctx.activeOrgId);
        if (m) {
          const [org] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.id, m.orgId))
            .limit(1);
          return { authorized: true as const, role: m.role, org: orgView(org) };
        }
      }
    }

    // 3. Not authorized — no membership, no matching invite.
    return { authorized: false as const, role: null, org: null };
  }),
});

function orgView(org: Org | undefined) {
  return org
    ? {
        id: org.id,
        name: org.name,
        slug: org.slug,
        vertical: org.vertical,
        defaultCurrency: org.defaultCurrency,
        locale: org.locale,
      }
    : null;
}
