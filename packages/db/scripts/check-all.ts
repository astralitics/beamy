import { sql } from "drizzle-orm";
import { getDb } from "../src/index";

const ORG = "00000000-0000-0000-0000-000000000010";

async function main() {
  const db = getDb();
  const r = await db.execute(sql`
SELECT
  (SELECT count(*) FROM rooms WHERE org_id=${ORG})::int AS rooms,
  (SELECT count(*) FROM vendors WHERE org_id=${ORG})::int AS vendors,
  (SELECT count(*) FROM bids WHERE org_id=${ORG})::int AS bids,
  (SELECT count(*) FROM bid_packages WHERE org_id=${ORG})::int AS bid_packages,
  (SELECT count(*) FROM work_items WHERE org_id=${ORG})::int AS work_items,
  (SELECT count(*) FROM assets WHERE org_id=${ORG})::int AS assets,
  (SELECT count(*) FROM asset_events WHERE org_id=${ORG})::int AS asset_events,
  (SELECT count(*) FROM furniture WHERE org_id=${ORG})::int AS furniture,
  (SELECT count(*) FROM bills WHERE org_id=${ORG})::int AS bills,
  (SELECT count(*) FROM proposals WHERE org_id=${ORG})::int AS proposals`);
  console.log(r);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
