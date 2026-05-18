import { sql } from "drizzle-orm";
import { getDb } from "../src/index";

const PROJECT_ID = "140c5a01-42c3-4aba-acd5-a3e74a15b266";
const ORG_ID = "00000000-0000-0000-0000-000000000010";

async function main() {
  const db = getDb();
  const r = await db.execute(
    sql`SELECT
      (SELECT count(*) FROM rooms WHERE project_id = ${PROJECT_ID})::int AS rooms,
      (SELECT count(*) FROM vendors WHERE org_id = ${ORG_ID})::int AS vendors,
      (SELECT count(*) FROM bids WHERE project_id = ${PROJECT_ID})::int AS bids,
      (SELECT count(*) FROM work_items WHERE project_id = ${PROJECT_ID})::int AS work_items`,
  );
  console.log(r);
}

main().then(() => process.exit(0));
