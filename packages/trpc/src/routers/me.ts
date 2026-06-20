import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, invitations, orgs, type Org } from "@beamy/db";
import {
  orgScopedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../init";
import { listMembershipsWithOrg, resolveOrgMembership } from "../context";

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
    const m = await resolveOrgMembership(
      ctx.userId,
      ctx.activeOrgId,
      ctx.isPlatformAdmin,
    );
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
    // Platform admins can operate in any workspace, so the switcher lists ALL
    // of them (synthesized `owner` role) rather than just real memberships —
    // otherwise an admin with no memberships sees an empty dropdown.
    if (ctx.isPlatformAdmin) {
      const db = getDb();
      const all = await db
        .select({
          orgId: orgs.id,
          name: orgs.name,
          slug: orgs.slug,
          vertical: orgs.vertical,
        })
        .from(orgs)
        .orderBy(asc(orgs.name));
      return all.map((o) => ({ ...o, role: "owner" as const }));
    }
    return await listMembershipsWithOrg(ctx.userId);
  }),

  /**
   * Authorization gate — Beamy's take on Velada's `auth.me` allowlist gate,
   * adapted to Beamy's token invites + multi-org. READ-ONLY: it never mutates
   * (no auto-provisioning in a query). It reports a verdict the client routes on.
   *
   * A signed-in user is `authorized` iff ANY of:
   *   1. they have a membership (the common case), OR
   *   2. they're a platform admin (allowlisted email — in even with no org), OR
   *   3. there's an unused, unexpired invite addressed to their email.
   *
   * `pendingInviteToken` carries that invite's token back to the client so
   * `OrgGate` can route to `/redeem?token=…` to finish the redemption — the
   * server-driven bridge that survives OAuth round-trips (no localStorage).
   * Email-gated by design: the invite is matched on the verified email, so a
   * link only resolves for the address it was addressed to.
   */
  authorize: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();

    // 1. Existing member (or platform admin who requested a specific org) →
    //    authorized, route into the app.
    const existing = await resolveOrgMembership(
      ctx.userId,
      ctx.activeOrgId,
      ctx.isPlatformAdmin,
    );
    if (existing) {
      const [org] = await db
        .select()
        .from(orgs)
        .where(eq(orgs.id, existing.orgId))
        .limit(1);
      return {
        authorized: true as const,
        hasMembership: true as const,
        role: existing.role,
        org: orgView(org),
        isPlatformAdmin: ctx.isPlatformAdmin,
        pendingInviteToken: null as string | null,
      };
    }

    // 2. Pending email-matched invite → route to /redeem to accept it. This is
    //    checked BEFORE the platform-admin fallback so that an invited platform
    //    admin still redeems their invite into a real membership, instead of
    //    being short-circuited to the console (which left the invite stuck
    //    "pending" forever).
    let pendingInviteToken: string | null = null;
    if (ctx.userEmail) {
      const [inv] = await db
        .select({ token: invitations.token })
        .from(invitations)
        .where(
          and(
            sql`lower(${invitations.email}) = ${ctx.userEmail.toLowerCase()}`,
            isNull(invitations.acceptedAt),
            gt(invitations.expiresAt, sql`now()`),
          ),
        )
        .orderBy(desc(invitations.createdAt))
        .limit(1);
      if (inv) pendingInviteToken = inv.token;
    }
    if (pendingInviteToken) {
      return {
        authorized: true as const,
        hasMembership: false as const,
        role: null,
        org: null,
        isPlatformAdmin: ctx.isPlatformAdmin,
        pendingInviteToken,
      };
    }

    // 3. Platform admin with no membership + no invite → the console.
    if (ctx.isPlatformAdmin) {
      return {
        authorized: true as const,
        hasMembership: false as const,
        role: null,
        org: null,
        isPlatformAdmin: true as const,
        pendingInviteToken: null as string | null,
      };
    }

    // 4. Not authorized — no membership, no invite, not an admin.
    return {
      authorized: false as const,
      hasMembership: false as const,
      role: null,
      org: null,
      isPlatformAdmin: false as const,
      pendingInviteToken: null as string | null,
    };
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
