// Durable run queue — pure DB operations over `workflow_jobs`. The drain *orchestration* (which
// ties the queue to the engine + persistence) lives in routers/workflows.ts; this file is just the
// queue mechanics so they stay small and testable.
//
// Claiming is atomic: a single UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) so two
// concurrent drains never grab the same job. A lease (`locked_at`/`locked_by`) lets us reclaim a
// job whose worker died mid-run. `run_after` gates eligibility (delays + retry backoff).
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { workflowJobs, type Db } from "@beamy/db";

export type JobRow = typeof workflowJobs.$inferSelect;

/** A claimed job is presumed dead if not finished within this lease, and is reclaimed to `queued`. */
export const DEFAULT_LEASE_MS = 5 * 60_000;
/** Retry backoff base: attempt N waits BASE * 2^(N-1). */
export const BACKOFF_BASE_MS = 10_000;

export interface EnqueueArgs {
  orgId: string;
  runId: string;
  runAfter?: Date;
  maxAttempts?: number;
  approvals?: string[];
}

/** Add a run to the queue. */
export async function enqueueJob(db: Db, args: EnqueueArgs): Promise<JobRow> {
  const [row] = await db
    .insert(workflowJobs)
    .values({
      orgId: args.orgId,
      runId: args.runId,
      runAfter: args.runAfter ?? new Date(),
      maxAttempts: args.maxAttempts ?? 3,
      approvals: args.approvals ?? null,
    })
    .returning();
  if (!row) throw new Error("enqueueJob: insert returned no row");
  return row;
}

/** Reclaim jobs stuck in `running` past their lease (a worker died mid-run) → back to `queued`. */
export async function reclaimStaleJobs(
  db: Db,
  opts: { now: Date; leaseMs?: number },
): Promise<number> {
  const cutoff = new Date(opts.now.getTime() - (opts.leaseMs ?? DEFAULT_LEASE_MS));
  const rows = await db
    .update(workflowJobs)
    .set({ status: "queued", lockedAt: null, lockedBy: null, updatedAt: opts.now })
    .where(and(eq(workflowJobs.status, "running"), lte(workflowJobs.lockedAt, cutoff)))
    .returning({ id: workflowJobs.id });
  return rows.length;
}

/**
 * Atomically claim up to `limit` eligible jobs (`queued` + `run_after <= now`), marking them
 * `running` under our lease and bumping `attempts`. Uses FOR UPDATE SKIP LOCKED so concurrent
 * drains don't collide. Scope to one org with `orgId` (the per-org tick); omit it for the global
 * cron drain.
 */
export async function claimJobs(
  db: Db,
  opts: { limit: number; workerId: string; now: Date; orgId?: string },
): Promise<JobRow[]> {
  const { limit, workerId, now, orgId } = opts;
  // postgres.js can't bind a JS Date as a raw param here, so pass ISO text — Postgres casts it to
  // timestamptz in the comparison/assignment.
  const nowIso = now.toISOString();
  const orgFilter = orgId ? sql`AND org_id = ${orgId}` : sql``;
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE workflow_jobs SET
      status = 'running',
      locked_at = ${nowIso}::timestamptz,
      locked_by = ${workerId},
      attempts = attempts + 1,
      updated_at = ${nowIso}::timestamptz
    WHERE id IN (
      SELECT id FROM workflow_jobs
      WHERE status = 'queued' AND run_after <= ${nowIso}::timestamptz ${orgFilter}
      ORDER BY run_after ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  const ids = [...claimed].map((r) => r.id);
  if (!ids.length) return [];
  // Re-read the typed rows (the raw UPDATE returns snake_case); they're already locked by us.
  return db.select().from(workflowJobs).where(inArray(workflowJobs.id, ids));
}

/** Mark a claimed job terminal (`done`/`failed`) or parked (`waiting` at a human gate). */
export async function finishJob(
  db: Db,
  jobId: string,
  status: "done" | "failed" | "waiting",
  opts: { now: Date; lastError?: string | null },
): Promise<void> {
  await db
    .update(workflowJobs)
    .set({ status, lockedAt: null, lockedBy: null, lastError: opts.lastError ?? null, updatedAt: opts.now })
    .where(eq(workflowJobs.id, jobId));
}

/**
 * Requeue a failed job with exponential backoff, or mark it `failed` once `maxAttempts` is reached.
 * `attempts` was already incremented at claim time, so the Nth attempt waits BASE * 2^(N-1).
 */
export async function retryJob(
  db: Db,
  job: JobRow,
  opts: { now: Date; lastError?: string | null },
): Promise<"requeued" | "failed"> {
  if (job.attempts >= job.maxAttempts) {
    await finishJob(db, job.id, "failed", opts);
    return "failed";
  }
  const delay = BACKOFF_BASE_MS * 2 ** Math.max(0, job.attempts - 1);
  await db
    .update(workflowJobs)
    .set({
      status: "queued",
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(opts.now.getTime() + delay),
      lastError: opts.lastError ?? null,
      updatedAt: opts.now,
    })
    .where(eq(workflowJobs.id, job.id));
  return "requeued";
}

/** Re-arm a parked (`waiting`) job to run again — e.g. after a human approval. */
export async function requeueWaitingJob(
  db: Db,
  opts: { runId: string; orgId: string; now: Date; approvals?: string[] },
): Promise<JobRow | null> {
  const patch: Partial<typeof workflowJobs.$inferInsert> = {
    status: "queued",
    lockedAt: null,
    lockedBy: null,
    runAfter: opts.now,
    updatedAt: opts.now,
  };
  if (opts.approvals !== undefined) patch.approvals = opts.approvals;
  const [row] = await db
    .update(workflowJobs)
    .set(patch)
    .where(and(eq(workflowJobs.runId, opts.runId), eq(workflowJobs.orgId, opts.orgId)))
    .returning();
  return row ?? null;
}
