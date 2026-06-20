import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Seed the platform-admin login accounts — the ONE out-of-band step that
 * bootstraps a strictly invite-only deployment. For each email in
 * `PLATFORM_ADMIN_EMAILS`, create a confirmed Supabase auth user so they can
 * sign in; their email being on the allowlist is what grants the cross-tenant
 * console (see `platformAdminProcedure`). Idempotent — existing accounts are
 * left untouched.
 *
 * Run:  pnpm --filter @beamy/db provision-admins
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PLATFORM_ADMIN_EMAILS
 *       (optional) PLATFORM_ADMIN_PASSWORD — set a known password for all new
 *       admins (handy for local/staging testing); otherwise one is generated
 *       and printed once.
 */

const PWD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(len = 16): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PWD_ALPHABET[bytes[i]! % PWD_ALPHABET.length];
  return out;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "[provision-admins] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
    process.exit(1);
  }

  const emails = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) {
    console.error(
      "[provision-admins] PLATFORM_ADMIN_EMAILS is empty — nothing to do.",
    );
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) {
    console.error("[provision-admins] failed to list users:", listErr.message);
    process.exit(1);
  }
  const existingByEmail = new Map(
    (list?.users ?? []).map((u) => [u.email?.toLowerCase(), u]),
  );

  for (const email of emails) {
    if (existingByEmail.has(email)) {
      console.log(`[provision-admins] exists, skip: ${email}`);
      continue;
    }
    const password = process.env.PLATFORM_ADMIN_PASSWORD || generatePassword();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error(`[provision-admins] FAILED ${email}: ${error.message}`);
      continue;
    }
    console.log(`[provision-admins] created: ${email}  password: ${password}`);
  }
  console.log("[provision-admins] done.");
}

main().catch((err) => {
  console.error("[provision-admins] error:", err);
  process.exit(1);
});
