// enqueueRun — the single server-only seam that creates a queued run + a durable job. Used by the
// manual tRPC mutation (runs.enqueue), the webhook handler, and the schedule scanner, so every
// start-path shares the SAME durable runner / retry / drain. orgId + actor are explicit args (never
// from a request), so trigger callers pass a server-trusted org resolved from their own trigger row.
import { and, eq } from "drizzle-orm";
import { getDb, workflowRuns, workflows } from "@beamy/db";
import { enqueueJob } from "./queue";

/** Typed failure so callers can map appropriately (webhook → 404/422; scanner → skip + log). */
export class EnqueueRunError extends Error {
  constructor(public reason: "not_found" | "unpublished", message: string) {
    super(message);
    this.name = "EnqueueRunError";
  }
}

export async function enqueueRun(
  orgId: string,
  target: { workflowId: string } | { workflowName: string },
  inputs: Record<string, unknown>,
  actor: string,
  opts?: { runAfter?: Date; requirePublished?: boolean },
): Promise<{ runId: string; jobId: string }> {
  const db = getDb();
  const where =
    "workflowId" in target
      ? and(eq(workflows.orgId, orgId), eq(workflows.id, target.workflowId))
      : and(eq(workflows.orgId, orgId), eq(workflows.name, target.workflowName));
  const [wf] = await db.select().from(workflows).where(where).limit(1);
  if (!wf) throw new EnqueueRunError("not_found", "workflow not found");
  // Triggers only fire PUBLISHED workflows (don't auto-run drafts — D-8 spirit). Manual enqueue
  // leaves this off so a draft can still be queued for testing, matching the synchronous runner.
  if (opts?.requirePublished && (wf.status !== "published" || wf.currentVersionId == null)) {
    throw new EnqueueRunError("unpublished", "workflow is not published");
  }
  const [run] = await db
    .insert(workflowRuns)
    .values({ orgId, workflowName: wf.name, workflowVersion: wf.version, status: "queued", inputs, actor })
    .returning({ id: workflowRuns.id });
  if (!run) throw new Error("enqueueRun: insert returned no run");
  const job = await enqueueJob(db, { orgId, runId: run.id, runAfter: opts?.runAfter });
  return { runId: run.id, jobId: job.id };
}
