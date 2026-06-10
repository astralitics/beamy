import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  auditLog,
  invitations,
  orgMemberships,
  orgs,
  type Db,
  type Invitation,
} from "@beamy/db";

/** Drizzle transaction handle — the arg passed to `db.transaction(async (tx) => …)`. */
type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Slugify a workspace name into a URL-safe base slug. */
function slugify(name: string): string {
  // NFKD splits accented letters into base + combining mark; the [^a-z0-9]
  // pass below then drops the marks, so "Jardín Verde" → "jardin-verde".
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || "workspace";
}

/** Pick a slug not already taken in `orgs`, appending a short suffix on collision. */
async function uniqueSlug(tx: DbTx, name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate =
      attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const [clash] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.slug, candidate))
      .limit(1);
    if (!clash) return candidate;
  }
  // Extremely unlikely fallback — fully random suffix.
  return `${base}-${randomBytes(4).toString("hex")}`;
}

export type RedeemResult = {
  orgId: string;
  role: "owner" | "admin" | "member";
};

/**
 * Redeem a validated invitation into a membership, in `tx`. Shared by both
 * redemption paths (`members.accept` token redeem + `me.authorize` email
 * whitelist) so the provisioning branch can't drift between them.
 *
 * Callers must have already verified the invite exists, is unused + unexpired.
 * Multi-org: the user may already belong to other orgs; for "member" invites the
 * caller checks they're not already in `inv.orgId` (the (user_id, org_id) unique
 * also backstops it). "workspace" invites always create a fresh org.
 *
 *  - `kind === "workspace"`: provision a NEW org seeded with the invite's
 *    `vertical` + `workspaceName`; the invitee becomes its `owner`. Currency
 *    and locale are inherited from the inviter's org.
 *  - `kind === "member"`: join the inviter's `orgId` at the invite's `role`.
 *
 * Marks the invite consumed and writes the audit row(s) in the same `tx`.
 */
export async function redeemInvitation(
  tx: DbTx,
  inv: Invitation,
  userId: string,
  actor: string,
  via: "token" | "email_whitelist" = "token",
): Promise<RedeemResult> {
  if (inv.kind === "workspace") {
    // Inherit currency/locale from the inviter's org for sensible defaults.
    const [inviterOrg] = await tx
      .select({
        defaultCurrency: orgs.defaultCurrency,
        locale: orgs.locale,
      })
      .from(orgs)
      .where(eq(orgs.id, inv.orgId))
      .limit(1);

    const slug = await uniqueSlug(tx, inv.workspaceName ?? "Workspace");
    const [newOrg] = await tx
      .insert(orgs)
      .values({
        name: inv.workspaceName ?? "New workspace",
        slug,
        vertical: inv.vertical,
        defaultCurrency: inviterOrg?.defaultCurrency ?? "USD",
        locale: inviterOrg?.locale ?? "en",
        ownerUserId: userId,
      })
      .returning();
    if (!newOrg) throw new Error("Failed to provision workspace");

    const [membership] = await tx
      .insert(orgMemberships)
      .values({
        userId,
        orgId: newOrg.id,
        role: "owner",
        invitedByUserId: inv.invitedByUserId,
      })
      .returning();
    if (!membership) throw new Error("Failed to create membership");

    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedByUserId: userId })
      .where(eq(invitations.id, inv.id));

    await tx.insert(auditLog).values([
      {
        orgId: newOrg.id,
        actor,
        action: "org.created",
        resourceType: "org",
        resourceId: newOrg.id,
        payload: {
          name: newOrg.name,
          slug: newOrg.slug,
          vertical: newOrg.vertical,
          via: "invitation",
          invitationId: inv.id,
        },
      },
      {
        orgId: newOrg.id,
        actor,
        action: "invitation.accepted",
        resourceType: "org_membership",
        resourceId: membership.id,
        payload: { invitationId: inv.id, email: inv.email, kind: "workspace", via },
      },
    ]);

    return { orgId: newOrg.id, role: "owner" };
  }

  // kind === "member": join the inviter's existing org.
  const [membership] = await tx
    .insert(orgMemberships)
    .values({
      userId,
      orgId: inv.orgId,
      role: inv.role,
      invitedByUserId: inv.invitedByUserId,
    })
    .returning();
  if (!membership) throw new Error("Failed to create membership");

  await tx
    .update(invitations)
    .set({ acceptedAt: new Date(), acceptedByUserId: userId })
    .where(eq(invitations.id, inv.id));

  await tx.insert(auditLog).values({
    orgId: inv.orgId,
    actor,
    action: "invitation.accepted",
    resourceType: "org_membership",
    resourceId: membership.id,
    payload: { invitationId: inv.id, email: inv.email, role: inv.role, kind: "member", via },
  });

  return { orgId: inv.orgId, role: inv.role };
}
