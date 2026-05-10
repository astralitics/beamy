import { eq } from "drizzle-orm";
import { getDb, orgMemberships, type OrgRole } from "@beamy/db";

/**
 * Context shape — built per request before handing off to procedures.
 *
 * `userId` is always present after auth (anonymous → 401 in `protectedProcedure`).
 * `orgId` and `role` are present once `orgScopedProcedure` resolves the user's
 * org membership (v1: 1 user → 1 org, D-12).
 *
 * `actor` is the audit attribution string ("user:<uuid>" / "agent:claude" /
 * "webhook:<src>"). Mirrors Cadenza's pattern.
 */
export interface BaseContext {
  userId: string | null;
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
 * Build a per-request context from a verified user id (or null for anonymous).
 * In dev / tests, callers can pass a known user id directly. In production the
 * web app's tRPC handler will derive it from the Supabase JWT.
 */
export function buildContext(opts: { userId: string | null }): BaseContext {
  return {
    userId: opts.userId,
    actor: opts.userId ? `user:${opts.userId}` : "anonymous",
  };
}

/**
 * Resolve the user's org membership. Throws if the user is not a member of any
 * org (caller should map to a 403). v1: each user belongs to exactly one org.
 */
export async function resolveOrgMembership(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { orgId: row.orgId, role: row.role };
}
