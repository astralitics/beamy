import { and, eq } from "drizzle-orm";
import { bidPackages, bids, getDb, projects, workItems } from "../src/index";

const ORG = "00000000-0000-0000-0000-000000000010";

async function main() {
  const db = getDb();
  const proj = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, ORG), eq(projects.name, "Polanco Office TI")))
    .limit(1);
  if (!proj[0]) {
    console.log("project not found");
    process.exit(1);
  }
  const p = proj[0];
  console.log(`project: ${p.name} (${p.id}) status=${p.status}`);
  console.log(`  contract: ${p.contractAmount} ${p.contractCurrency}`);

  const pkgs = await db
    .select()
    .from(bidPackages)
    .where(eq(bidPackages.projectId, p.id));
  console.log(`packages: ${pkgs.length}`);
  for (const k of pkgs) {
    console.log(`  - ${k.name}: ${k.status} awardedAt=${k.awardedAt ?? "—"}`);
  }

  const bidRows = await db.select().from(bids).where(eq(bids.projectId, p.id));
  console.log(`bids: ${bidRows.length}`);
  for (const b of bidRows) {
    console.log(
      `  - ${b.bidNumber}: status=${b.status} total=${b.totalAmount} ${b.currency}${b.packageId ? " (in package)" : ""}`,
    );
  }

  const items = await db
    .select()
    .from(workItems)
    .where(eq(workItems.projectId, p.id));
  const byStatus = items.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`work_items: ${items.length} total · by status:`, byStatus);
}

main().then(() => process.exit(0));
