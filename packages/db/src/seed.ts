import { eq } from "drizzle-orm";
import { getDb, orgs, orgMemberships } from "./index";

/**
 * Seed a deterministic dev user + org + owner membership so the dev tRPC
 * context (see apps/web/vite.config.ts → DEFAULT_DEV_USER_ID) resolves to a
 * real DB row. Idempotent — safe to re-run.
 *
 * Run via `pnpm db:seed`.
 */
const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEV_ORG_ID = "00000000-0000-0000-0000-000000000010";

async function main() {
  const db = getDb();

  await db
    .insert(orgs)
    .values({
      id: DEV_ORG_ID,
      name: "Dev Workspace",
      slug: "dev",
      description: "Local development workspace seeded by `pnpm db:seed`.",
      defaultCurrency: "USD",
      locale: "en",
      ownerUserId: DEV_USER_ID,
    })
    .onConflictDoNothing({ target: orgs.id });

  await db
    .insert(orgMemberships)
    .values({
      userId: DEV_USER_ID,
      orgId: DEV_ORG_ID,
      role: "owner",
    })
    .onConflictDoNothing({ target: orgMemberships.userId });

  const verifiedOrg = await db
    .select()
    .from(orgs)
    .where(eq(orgs.id, DEV_ORG_ID))
    .limit(1);
  const verifiedMembership = await db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, DEV_USER_ID))
    .limit(1);

  console.log(`[seed] org:        ${verifiedOrg[0]?.name ?? "MISSING"}`);
  console.log(
    `[seed] membership: ${verifiedMembership[0] ? `${verifiedMembership[0].role} of ${DEV_ORG_ID}` : "MISSING"}`,
  );
  console.log(`[seed] dev user id: ${DEV_USER_ID}`);
  console.log(
    `[seed] override with: BEAMY_DEV_USER_ID=<uuid> pnpm dev (must exist as a member of some org)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
