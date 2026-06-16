// Schedule scanner — fires due schedule triggers. Runs inside the every-minute cron tick (before
// the drain). The claim is atomic (FOR UPDATE SKIP LOCKED) and bumps next_due_at forward in the
// SAME statement, so two overlapping or late ticks provably cannot both fire one trigger. After the
// claim, the real next-due cursor is computed (JS, via the shared schedule logic) and a durable run
// is enqueued through the shared enqueueRun seam.
import { eq, sql } from "drizzle-orm";
import { getDb, workflowTriggers } from "@beamy/db";
import { nextDueAfter, scheduleConfigSchema } from "@beamy/shared";
import { enqueueRun, EnqueueRunError } from "./enqueue";

export interface ScanResult {
  fired: { triggerId: string; runId: string }[];
  skipped: { triggerId: string; reason: string }[];
}

export async function scanScheduledTriggers(now: Date): Promise<ScanResult> {
  const db = getDb();
  const nowIso = now.toISOString();
  const bucket = nowIso.slice(0, 16); // 'YYYY-MM-DDTHH:MM' minute bucket
  // Self-healing temporary cursor: bump 1 min ahead so a concurrent/immediate re-scan won't
  // re-claim even if the JS recompute below never runs (then it self-corrects next minute).
  const safeNext = new Date(now.getTime() + 60_000).toISOString();

  const claimed = await db.execute<{ id: string; org_id: string; workflow_id: string; config: unknown }>(sql`
    UPDATE workflow_triggers SET
      last_fired_at = ${nowIso}::timestamptz,
      last_fired_dedupe_key = ${bucket},
      next_due_at = ${safeNext}::timestamptz,
      updated_at = ${nowIso}::timestamptz
    WHERE id IN (
      SELECT id FROM workflow_triggers
      WHERE type = 'schedule' AND enabled = true
        AND next_due_at IS NOT NULL AND next_due_at <= ${nowIso}::timestamptz
      ORDER BY next_due_at ASC
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, org_id, workflow_id, config
  `);

  const fired: ScanResult["fired"] = [];
  const skipped: ScanResult["skipped"] = [];
  for (const row of [...claimed]) {
    try {
      const parsed = scheduleConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        // Corrupt/unsupported config: back off an hour (don't leave it at the 1-min safety bump,
        // which would re-claim + flood every minute) and don't enqueue.
        await db.update(workflowTriggers).set({ nextDueAt: new Date(now.getTime() + 3600_000) }).where(eq(workflowTriggers.id, row.id));
        skipped.push({ triggerId: row.id, reason: "invalid_config" });
        continue;
      }
      const { runId } = await enqueueRun(
        row.org_id,
        { workflowId: row.workflow_id },
        { scheduledFor: nowIso },
        `schedule:${row.id}`,
        { requirePublished: true },
      );
      // Advance the cursor to the real next slot ONLY after a successful enqueue.
      await db.update(workflowTriggers).set({ nextDueAt: nextDueAfter(parsed.data, now) }).where(eq(workflowTriggers.id, row.id));
      fired.push({ triggerId: row.id, runId });
    } catch (e) {
      // Unpublished/deleted (or a transient error): leave the 1-min safety bump so a
      // transiently-unpublished schedule retries next tick instead of losing the slot. No run
      // was enqueued. One bad row never aborts the rest of the scan.
      const reason = e instanceof EnqueueRunError ? e.reason : e instanceof Error ? e.message : String(e);
      skipped.push({ triggerId: row.id, reason });
    }
  }
  return { fired, skipped };
}
