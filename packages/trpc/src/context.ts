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
  activeOrgId: string | null;
  actor: string;
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
  activeOrgId?: string | null;
}): BaseContext {
  return {
    userId: opts.userId,
    activeOrgId: opts.activeOrgId ?? null,
    actor: opts.userId ? `user:${opts.userId}` : "anonymous",
  };
}

/**
 * Resolve which org membership is active for this request. A user may have many
 * memberships; we honor `preferredOrgId` (from the client) **only if** the user
 * is actually a member of it — otherwise we fall back to a deterministic default
 * (earliest joined). Returns null if the user belongs to no org.
 */
export async function resolveOrgMembership(
  userId: string,
  preferredOrgId?: string | null,
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
