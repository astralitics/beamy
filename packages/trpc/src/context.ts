import { and, asc, eq } from "drizzle-orm";
import { getDb, orgMemberships, orgs, type OrgRole } from "@beamy/db";

/**
 * Context shape — built per request before handing off to procedures.
 *
 * `userId` is always present after auth (anonymous → 401 in `protectedProcedure`).
 * `activeOrgId` is the org the client asked to operate in (the `x-active-org`
 * header); it's a *request* of which membership to activate, validated against
 * real memberships in `resolveOrgMembership` — never trusted blindly.
 * `orgId` and `role` are present once `orgScopedProcedure` resolves the active
 * membership. A user may belong to multiple orgs; one is active per request.
 *
 * `actor` is the audit attribution string ("user:<uuid>" / "agent:claude" /
 * "webhook:<src>"). Mirrors Cadenza's pattern.
 */
export interface BaseContext {
  userId: string | null;
  /** Verified email from the JWT (resolved by the request handler). */
  userEmail: string | null;
  activeOrgId: string | null;
  actor: string;
  /**
   * True when `userEmail` is on the `PLATFORM_ADMIN_EMAILS` allowlist. Platform
   * admins are authorized without a membership and can operate across tenants
   * via `platformAdminProcedure`. Computed server-side from the verified email —
   * never client input — so it can't be spoofed.
   */
  isPlatformAdmin: boolean;
}

/**
 * Comma/space-separated allowlist of platform-admin emails, lowercased. Empty /
 * unset ⟹ nobody is a platform admin. The only out-of-band grant of cross-tenant
 * power; mirrors Cadenza/Velada's `PLATFORM_ADMIN_EMAIL`, widened to a list.
 */
const PLATFORM_ADMIN_EMAILS: ReadonlySet<string> = new Set(
  (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  return email != null && PLATFORM_ADMIN_EMAILS.has(email.toLowerCase());
}

export interface AuthedContext extends BaseContext {
  userId: string;
}

export interface OrgScopedContext extends AuthedContext {
  orgId: string;
  role: OrgRole;
}

/**
 * Build a per-request context from a verified user id (or null for anonymous)
 * and the client's requested active org (or null). In dev / tests, callers can
 * pass these directly. In production the web app's tRPC handler derives `userId`
 * from the Supabase JWT and `activeOrgId` from the `x-active-org` header.
 */
export function buildContext(opts: {
  userId: string | null;
  userEmail?: string | null;
  activeOrgId?: string | null;
}): BaseContext {
  const userEmail = opts.userEmail ?? null;
  return {
    userId: opts.userId,
    userEmail,
    activeOrgId: opts.activeOrgId ?? null,
    actor: opts.userId ? `user:${opts.userId}` : "anonymous",
    isPlatformAdmin: isPlatformAdminEmail(userEmail),
  };
}

/**
 * Resolve which org membership is active for this request. A user may have many
 * memberships; we honor `preferredOrgId` (from the client) **only if** the user
 * is actually a member of it — otherwise we fall back to a deterministic default
 * (earliest joined). Returns null if the user belongs to no org.
 *
 * Platform-admin cross-tenant entry: when `isPlatformAdmin` is true and the
 * caller explicitly requests a `preferredOrgId` they're NOT a real member of,
 * we synthesize an `owner` membership for that org (if it exists) so the admin
 * can operate inside any workspace. This is NEVER persisted, only ever runs
 * when the server-computed `isPlatformAdmin` is true, and requires an explicit
 * org request — so the normal membership path is byte-for-byte unchanged for
 * everyone else, and an admin with no active-org request still resolves to null
 * (→ routed to the console, not silently into a random tenant).
 */
export async function resolveOrgMembership(
  userId: string,
  preferredOrgId?: string | null,
  isPlatformAdmin = false,
) {
  const db = getDb();

  if (preferredOrgId) {
    const [preferred] = await db
      .select({ orgId: orgMemberships.orgId, role: orgMemberships.role })
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.userId, userId),
          eq(orgMemberships.orgId, preferredOrgId),
        ),
      )
      .limit(1);
    if (preferred) return preferred;

    // Cross-tenant: a platform admin entering a workspace they don't belong to.
    if (isPlatformAdmin) {
      const [org] = await db
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.id, preferredOrgId))
        .limit(1);
      if (org) return { orgId: org.id, role: "owner" as const };
    }
    // Fall through: requested org isn't one of theirs → use the default.
  }

  const [row] = await db
    .select({ orgId: orgMemberships.orgId, role: orgMemberships.role })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId))
    .orderBy(asc(orgMemberships.joinedAt))
    .limit(1);
  if (!row) return null;
  return row;
}

/**
 * List every org the user is a member of, with the org's display fields, for
 * the workspace switcher. Ordered by join time (stable list order).
 */
export async function listMembershipsWithOrg(userId: string) {
  const db = getDb();
  return await db
    .select({
      orgId: orgs.id,
      name: orgs.name,
      slug: orgs.slug,
      vertical: orgs.vertical,
      role: orgMemberships.role,
    })
    .from(orgMemberships)
    .innerJoin(orgs, eq(orgMemberships.orgId, orgs.id))
    .where(eq(orgMemberships.userId, userId))
    .orderBy(asc(orgMemberships.joinedAt));
}
