import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb, orgMemberships, type OrgRole } from "@beamy/db";
import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Cross-tenant membership + auth-user helpers shared by the platform-admin
 * router (`routers/admin.ts`) and the ops provisioning script. Mirrors
 * Cadenza's `auth/memberships.ts`, adapted to Beamy's `org_memberships`
 * (roles owner/admin/member; no `status`/`archived` columns).
 */

const PWD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** 16 chars from a 56-char alphabet ≈ 92 bits. Surfaced once, never stored. */
export function generatePassword(len = 16): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PWD_ALPHABET[bytes[i]! % PWD_ALPHABET.length];
  return out;
}

export interface CreateMembershipInput {
  email: string;
  orgId: string;
  role: OrgRole;
  fullName?: string;
  /**
   * Optional caller-supplied password.
   *   - new auth user + customPassword → use it (don't generate)
   *   - new auth user + none           → generate one
   *   - existing user  + customPassword → reset their password to it
   *   - existing user  + none           → leave password alone
   * The resolved password (if any) is returned so the admin can hand it over.
   */
  customPassword?: string;
  /** Audit attribution + who invited (the acting platform admin). */
  invitedByUserId: string;
}

export interface CreateMembershipResult {
  userId: string;
  alreadyExisted: boolean;
  generatedPassword: string | null;
  passwordReset: boolean;
}

/**
 * Create the Supabase auth user (if it doesn't exist) and the membership row in
 * the target org. The auth-user creation goes through the admin API (outside any
 * DB transaction); the membership write is a single statement. Idempotent on
 * `(userId, orgId)` — re-running just refreshes the role.
 */
export async function createAuthUserAndMembership(
  input: CreateMembershipInput,
): Promise<CreateMembershipResult> {
  const admin = getSupabaseAdmin();
  const db = getDb();

  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const found = list?.users.find(
    (u) => u.email?.toLowerCase() === input.email.toLowerCase(),
  );

  let userId: string;
  let generatedPassword: string | null = null;
  let passwordReset = false;

  if (found) {
    userId = found.id;
    if (input.customPassword) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: input.customPassword,
      });
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message ?? "Failed to reset password.",
        });
      generatedPassword = input.customPassword;
      passwordReset = true;
    }
  } else {
    const password = input.customPassword ?? generatePassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password,
      email_confirm: true,
      user_metadata: input.fullName ? { full_name: input.fullName } : {},
    });
    if (error || !data.user)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error?.message ?? "Failed to create user.",
      });
    userId = data.user.id;
    generatedPassword = password;
  }

  const [existing] = await db
    .select({ id: orgMemberships.id })
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.orgId, input.orgId),
        eq(orgMemberships.userId, userId),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(orgMemberships).values({
      userId,
      orgId: input.orgId,
      role: input.role,
      invitedByUserId: input.invitedByUserId,
    });
  } else {
    await db
      .update(orgMemberships)
      .set({ role: input.role })
      .where(eq(orgMemberships.id, existing.id));
  }

  return { userId, alreadyExisted: Boolean(existing), generatedPassword, passwordReset };
}

/**
 * Throws when the change would leave `orgId` with zero owner/admin members.
 * "admin-like" = role in (owner, admin). Run BEFORE the write.
 */
export async function assertNotLastAdmin(
  orgId: string,
  userId: string,
  change: { kind: "demote" | "remove" },
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ userId: orgMemberships.userId, role: orgMemberships.role })
    .from(orgMemberships)
    .where(eq(orgMemberships.orgId, orgId));

  const target = rows.find((r) => r.userId === userId);
  if (!target) return;
  if (target.role !== "owner" && target.role !== "admin") return;

  const otherAdmins = rows.filter(
    (r) =>
      r.userId !== userId && (r.role === "owner" || r.role === "admin"),
  ).length;

  if (otherAdmins === 0) {
    const verb = change.kind === "demote" ? "change the role of" : "remove";
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot ${verb} the last owner/admin of this workspace. Add another admin first.`,
    });
  }
}
