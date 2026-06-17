import { and, asc, eq } from "drizzle-orm";
import { getDb, orgMemberships, orgs, type OrgRole } from "@beamy/db";

/**
 * Platform-admin allowlist — a small set of operators who can see/enter/manage ALL
 * workspaces (cross-tenant). Granted SOLELY by the `PLATFORM_ADMIN_EMAILS` env var
 * (comma/space/newline-separated), checked against the JWT-verified email. NOT stored
 * in tenant data, never client-settable. Empty/unset ⟹ NOBODY is an admin (safe default).
 */
function parsePlatformAdminEmails(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True iff this (server-verified) email is in the allowlist. Email-less / empty allowlist → false. */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parsePlatformAdminEmails().has(email.trim().toLowerCase());
}

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
  /** The server-verified email (from the Supabase JWT). Used only to compute platform-admin. */
  userEmail: string | null;
  /** Computed once per request from `userEmail` + the PLATFORM_ADMIN_EMAILS allowlist. */
  isPlatformAdmin: boolean;
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
  userEmail?: string | null;
}): BaseContext {
  const userEmail = opts.userEmail ?? null;
  return {
    userId: opts.userId,
    activeOrgId: opts.activeOrgId ?? null,
    userEmail,
    isPlatformAdmin: isPlatformAdminEmail(userEmail),
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
  isPlatformAdmin = false,
) {
  const db = getDb();

  // PLATFORM ADMIN ONLY: may activate ANY existing org, with `owner` synthesized for
  // this request (never written to org_memberships). Normal users NEVER enter this
  // branch — it is gated entirely on the server-computed isPlatformAdmin flag — so the
  // membership enforcement below is unchanged for everyone else. If the requested org
  // doesn't exist, fall through to the admin's own default membership.
  if (isPlatformAdmin && preferredOrgId) {
    const [org] = await db
      .select({ orgId: orgs.id })
      .from(orgs)
      .where(eq(orgs.id, preferredOrgId))
      .limit(1);
    if (org) return { orgId: org.orgId, role: "owner" as OrgRole };
  }

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
