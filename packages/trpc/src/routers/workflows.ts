import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import crypto from "node:crypto";
import {
  documents,
  getDb,
  projects,
  stepTemplates,
  stepTestRuns,
  stepTests,
  workflowJobs,
  workflowRuns,
  workflowRunSteps,
  workflowVersions,
  workflows,
  type Db,
} from "@beamy/db";
import { orgScopedProcedure, router } from "../init";
import { BUCKET, getStorageClient } from "../lib/storage";
import {
  runWorkflow,
  type RunResult,
  type StepType,
  type WorkflowDef,
} from "../workflow/engine";
import { makeRealHandlers } from "../workflow/handlers";
import { resolveConnectionSecret } from "./connections";
import {
  claimJobs,
  enqueueJob,
  finishJob,
  reclaimStaleJobs,
  requeueWaitingJob,
  retryJob,
  type JobRow,
} from "../workflow/queue";

/** Real handlers wired with this org's connection resolver (decrypts stored credentials). */
const orgHandlers = (orgId: string) =>
  makeRealHandlers({ resolveConnection: (id) => resolveConnectionSecret(orgId, id) });
import {
  evaluateVerifications,
  hasBlockingFailure,
  type StepOutputDef,
} from "../workflow/verification";

/**
 * `workflows` router — the Workflow Studio surface (adopted from the Astralitics catalog
 * `workflows` + `workflow-studio` modules). Authoring (CRUD), versioning (publish snapshots),
 * a real synchronous runner (auto-advances automated steps, pauses at human gates), and the
 * step-testing harness (run a step in isolation, record pass/fail history).
 *
 * Same chassis as the entity routers: orgScopedProcedure (tenant-scoped via ctx.orgId), getDb,
 * actor-stamped rows. The DAG engine + verification evaluator are vendored, pure, db-free.
 */

const triggerEnum = z.enum(["manual", "scheduled", "signal"]);
const definitionSchema = z
  .object({ name: z.string(), steps: z.array(z.any()) })
  .passthrough();

function runView(runId: string, result: RunResult) {
  return {
    id: runId,
    status: result.status,
    pausedStepId: result.pausedStepId ?? null,
    outputs: result.outputs,
    steps: result.steps.map((s) => ({
      stepId: s.id,
      stepType: s.type,
      status: s.status,
      output: s.output,
      error: s.error ?? null,
      startedAt: s.startedAt != null ? new Date(s.startedAt).toISOString() : null,
      finishedAt: s.finishedAt != null ? new Date(s.finishedAt).toISOString() : null,
      durationMs: s.startedAt != null && s.finishedAt != null ? s.finishedAt - s.startedAt : null,
    })),
  };
}

async function persistRun(
  db: ReturnType<typeof getDb>,
  orgId: string,
  runId: string,
  result: RunResult,
) {
  await db.delete(workflowRunSteps).where(eq(workflowRunSteps.runId, runId));
  if (result.steps.length) {
    await db.insert(workflowRunSteps).values(
      result.steps.map((s, i) => ({
        orgId,
        runId,
        stepId: s.id,
        stepType: s.type,
        status: s.status,
        output: (s.output ?? null) as unknown,
        error: s.error ?? null,
        order: i,
        startedAt: s.startedAt != null ? new Date(s.startedAt) : null,
        finishedAt: s.finishedAt != null ? new Date(s.finishedAt) : null,
      })),
    );
  }
  await db
    .update(workflowRuns)
    .set({
      status: result.status,
      outputs: result.outputs,
      pausedStepId: result.pausedStepId ?? null,
      finishedAt: result.status === "paused" ? null : new Date(),
    })
    .where(eq(workflowRuns.id, runId));
}

export interface DrainResult {
  jobId: string;
  runId: string;
  outcome: "done" | "failed" | "waiting" | "requeued";
  pausedStepId?: string | null;
  error?: string;
}

/**
 * Advance a single claimed job through the engine and settle its queue state. Loads the run + its
 * (current) workflow definition, runs it with this org's real handlers, persists the result, then:
 *   completed → done · paused (human gate) → waiting · failed/threw → retry w/ backoff (or failed).
 */
async function advanceJob(db: Db, job: JobRow, now: Date): Promise<DrainResult> {
  const base = { jobId: job.id, runId: job.runId };
  try {
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, job.runId), eq(workflowRuns.orgId, job.orgId)))
      .limit(1);
    if (!run) {
      await finishJob(db, job.id, "failed", { now, lastError: "run not found" });
      return { ...base, outcome: "failed", error: "run not found" };
    }
    const [wf] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.orgId, job.orgId), eq(workflows.name, run.workflowName)))
      .limit(1);
    const definition = (wf?.definition ?? { name: run.workflowName, steps: [] }) as WorkflowDef;
    const approvals = new Set<string>((job.approvals as string[] | null) ?? []);
    const result = await runWorkflow(definition, {
      inputs: (run.inputs as Record<string, unknown>) ?? {},
      handlers: orgHandlers(job.orgId),
      approvals,
    });
    await persistRun(db, job.orgId, job.runId, result);
    if (result.status === "paused") {
      // Mark the RUN "waiting" (vs a synchronous "paused") so the UI resumes it via the queue
      // (approveQueued) rather than the in-request resume path. persistRun kept pausedStepId.
      await db.update(workflowRuns).set({ status: "waiting" }).where(eq(workflowRuns.id, job.runId));
      await finishJob(db, job.id, "waiting", { now });
      return { ...base, outcome: "waiting", pausedStepId: result.pausedStepId ?? null };
    }
    if (result.status === "failed") {
      const outcome = await retryJob(db, job, { now, lastError: "run failed" });
      return { ...base, outcome, error: "run failed" };
    }
    await finishJob(db, job.id, "done", { now });
    return { ...base, outcome: "done" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const outcome = await retryJob(db, job, { now, lastError: error });
    return { ...base, outcome, error };
  }
}

/**
 * Drain the queue: reclaim dead leases, claim up to `limit` eligible jobs, advance each. Scope to
 * one org with `orgId` (the per-org tick) or omit it for the global cron drain. This is the same
 * logic the Vercel-Cron trigger calls in prod (no always-on worker on serverless).
 */
export async function drainJobs(opts: { orgId?: string; limit?: number }): Promise<{ claimed: number; reclaimed: number; results: DrainResult[] }> {
  const db = getDb();
  const now = new Date();
  const workerId = crypto.randomUUID();
  const reclaimed = await reclaimStaleJobs(db, { now });
  const jobs = await claimJobs(db, { limit: opts.limit ?? 10, workerId, now, orgId: opts.orgId });
  const results: DrainResult[] = [];
  for (const job of jobs) {
    results.push(await advanceJob(db, job, now));
  }
  return { claimed: jobs.length, reclaimed, results };
}

/** Map a step's raw output to the captured-values shape the evaluator expects. */
function coerceCaptured(outputs: StepOutputDef[], actual: unknown): Record<string, unknown> {
  if (actual && typeof actual === "object" && !Array.isArray(actual)) {
    const obj = actual as Record<string, unknown>;
    if (outputs.some((o) => o.id in obj)) return obj;
  }
  const first = outputs[0];
  return first ? { [first.id]: actual } : {};
}

export const workflowsRouter = router({
  // ─────────────────── workflow CRUD ───────────────────
  list: orgScopedProcedure
    .input(z.object({ status: z.enum(["draft", "published", "archived"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const where = input?.status
        ? and(eq(workflows.orgId, ctx.orgId), eq(workflows.status, input.status))
        : eq(workflows.orgId, ctx.orgId);
      const rows = await db.select().from(workflows).where(where).orderBy(desc(workflows.updatedAt));
      return Promise.all(
        rows.map(async (w) => {
          const def = w.definition as { steps?: unknown[] };
          const [last] = await db
            .select({ status: workflowRuns.status, at: workflowRuns.startedAt })
            .from(workflowRuns)
            .where(and(eq(workflowRuns.orgId, ctx.orgId), eq(workflowRuns.workflowName, w.name)))
            .orderBy(desc(workflowRuns.startedAt))
            .limit(1);
          return {
            ...w,
            stepCount: def?.steps?.length ?? 0,
            lastRun: last ? { status: last.status, at: last.at?.toISOString() ?? null } : null,
          };
        }),
      );
    }),

  get: orgScopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, input.id), eq(workflows.orgId, ctx.orgId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: orgScopedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(160),
        summary: z.string().max(500).optional(),
        triggerType: triggerEnum.default("manual"),
        definition: definitionSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const definition = input.definition ?? { name: input.name, steps: [] };
      const [row] = await db
        .insert(workflows)
        .values({
          orgId: ctx.orgId,
          name: input.name,
          definition,
          summary: input.summary ?? null,
          triggerType: input.triggerType,
          createdBy: ctx.actor,
          updatedBy: ctx.actor,
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return row;
    }),

  updateDraft: orgScopedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          name: z.string().min(1).optional(),
          summary: z.string().nullable().optional(),
          definition: definitionSchema.optional(),
          triggerType: triggerEnum.optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .update(workflows)
        .set({ ...input.patch, updatedBy: ctx.actor, updatedAt: new Date() })
        .where(and(eq(workflows.id, input.id), eq(workflows.orgId, ctx.orgId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  publish: orgScopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [wf] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, input.id), eq(workflows.orgId, ctx.orgId)))
        .limit(1);
      if (!wf) throw new TRPCError({ code: "NOT_FOUND" });
      const [prior] = await db
        .select({ v: workflowVersions.versionNumber })
        .from(workflowVersions)
        .where(and(eq(workflowVersions.workflowId, input.id), eq(workflowVersions.orgId, ctx.orgId)))
        .orderBy(desc(workflowVersions.versionNumber))
        .limit(1);
      const versionNumber = (prior?.v ?? 0) + 1;
      const [version] = await db
        .insert(workflowVersions)
        .values({
          orgId: ctx.orgId,
          workflowId: input.id,
          versionNumber,
          name: wf.name,
          summary: wf.summary,
          definition: wf.definition,
          createdBy: ctx.actor,
          updatedBy: ctx.actor,
        })
        .returning();
      if (!version) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(workflows)
        .set({
          status: "published",
          version: String(versionNumber),
          currentVersionId: version.id,
          updatedBy: ctx.actor,
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, input.id));
      return version;
    }),

  listVersions: orgScopedProcedure
    .input(z.object({ workflowId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(workflowVersions)
        .where(and(eq(workflowVersions.workflowId, input.workflowId), eq(workflowVersions.orgId, ctx.orgId)))
        .orderBy(desc(workflowVersions.versionNumber));
    }),

  restoreVersion: orgScopedProcedure
    .input(z.object({ workflowId: z.string().uuid(), versionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [v] = await db
        .select()
        .from(workflowVersions)
        .where(and(eq(workflowVersions.id, input.versionId), eq(workflowVersions.orgId, ctx.orgId)))
        .limit(1);
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const [row] = await db
        .update(workflows)
        .set({ definition: v.definition, status: "draft", updatedBy: ctx.actor, updatedAt: new Date() })
        .where(and(eq(workflows.id, input.workflowId), eq(workflows.orgId, ctx.orgId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  // ─────────────────── runs (the synchronous runner) ───────────────────
  runs: router({
    start: orgScopedProcedure
      .input(z.object({ workflowId: z.string().uuid(), inputs: z.record(z.unknown()).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [wf] = await db
          .select()
          .from(workflows)
          .where(and(eq(workflows.id, input.workflowId), eq(workflows.orgId, ctx.orgId)))
          .limit(1);
        if (!wf) throw new TRPCError({ code: "NOT_FOUND" });
        const [run] = await db
          .insert(workflowRuns)
          .values({
            orgId: ctx.orgId,
            workflowName: wf.name,
            workflowVersion: wf.version,
            status: "running",
            inputs: input.inputs ?? {},
            actor: ctx.actor,
          })
          .returning({ id: workflowRuns.id });
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const result = await runWorkflow(wf.definition as WorkflowDef, {
          inputs: input.inputs,
          handlers: orgHandlers(ctx.orgId),
        });
        await persistRun(db, ctx.orgId, run.id, result);
        return runView(run.id, result);
      }),

    resume: orgScopedProcedure
      .input(z.object({ runId: z.string().uuid(), approvals: z.array(z.string()).default([]) }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [run] = await db
          .select()
          .from(workflowRuns)
          .where(and(eq(workflowRuns.id, input.runId), eq(workflowRuns.orgId, ctx.orgId)))
          .limit(1);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        const [wf] = await db
          .select()
          .from(workflows)
          .where(and(eq(workflows.orgId, ctx.orgId), eq(workflows.name, run.workflowName)))
          .limit(1);
        const definition = (wf?.definition ?? { name: run.workflowName, steps: [] }) as WorkflowDef;
        const result = await runWorkflow(definition, {
          inputs: (run.inputs as Record<string, unknown>) ?? {},
          handlers: orgHandlers(ctx.orgId),
          approvals: new Set(input.approvals),
        });
        await persistRun(db, ctx.orgId, input.runId, result);
        return runView(input.runId, result);
      }),

    // ── durable path: enqueue a run + drain the queue (the async runner) ──
    // Unlike `start` (synchronous, for "Run now"), this returns immediately with a queued run; a
    // scheduled drain (`tick` / the Vercel cron) advances it. Survives restarts, retries on failure.
    enqueue: orgScopedProcedure
      .input(z.object({ workflowId: z.string().uuid(), inputs: z.record(z.unknown()).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [wf] = await db
          .select()
          .from(workflows)
          .where(and(eq(workflows.id, input.workflowId), eq(workflows.orgId, ctx.orgId)))
          .limit(1);
        if (!wf) throw new TRPCError({ code: "NOT_FOUND" });
        const [run] = await db
          .insert(workflowRuns)
          .values({
            orgId: ctx.orgId,
            workflowName: wf.name,
            workflowVersion: wf.version,
            status: "queued",
            inputs: input.inputs ?? {},
            actor: ctx.actor,
          })
          .returning({ id: workflowRuns.id });
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const job = await enqueueJob(db, { orgId: ctx.orgId, runId: run.id });
        return { runId: run.id, jobId: job.id, status: "queued" as const };
      }),

    // Drain this org's queue now (one tick). The Vercel cron calls the same `drainJobs` globally.
    tick: orgScopedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        return drainJobs({ orgId: ctx.orgId, limit: input?.limit });
      }),

    // Approve a parked (waiting) human gate on a queued run → re-arm its job for the next tick.
    approveQueued: orgScopedProcedure
      .input(z.object({ runId: z.string().uuid(), approvals: z.array(z.string()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [run] = await db
          .select({ id: workflowRuns.id })
          .from(workflowRuns)
          .where(and(eq(workflowRuns.id, input.runId), eq(workflowRuns.orgId, ctx.orgId)))
          .limit(1);
        if (!run) throw new TRPCError({ code: "NOT_FOUND" });
        // Merge with any approvals already recorded on the job (multiple gates over a run's life).
        const [existing] = await db
          .select({ approvals: workflowJobs.approvals })
          .from(workflowJobs)
          .where(and(eq(workflowJobs.runId, input.runId), eq(workflowJobs.orgId, ctx.orgId)))
          .limit(1);
        const merged = Array.from(
          new Set([...(((existing?.approvals as string[] | null) ?? [])), ...input.approvals]),
        );
        const job = await requeueWaitingJob(db, {
          runId: input.runId,
          orgId: ctx.orgId,
          now: new Date(),
          approvals: merged,
        });
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "no queued job for this run" });
        await db.update(workflowRuns).set({ status: "running" }).where(eq(workflowRuns.id, input.runId));
        return { runId: input.runId, jobId: job.id, status: "queued" as const, approvals: merged };
      }),

    // run history for a workflow (the executions list)
    list: orgScopedProcedure
      .input(z.object({ workflowId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const db = getDb();
        const [wf] = await db
          .select({ name: workflows.name })
          .from(workflows)
          .where(and(eq(workflows.id, input.workflowId), eq(workflows.orgId, ctx.orgId)))
          .limit(1);
        if (!wf) throw new TRPCError({ code: "NOT_FOUND" });
        const rows = await db
          .select()
          .from(workflowRuns)
          .where(and(eq(workflowRuns.orgId, ctx.orgId), eq(workflowRuns.workflowName, wf.name)))
          .orderBy(desc(workflowRuns.startedAt))
          .limit(50);
        return rows.map((r) => ({
          id: r.id,
          status: r.status,
          version: r.workflowVersion,
          actor: r.actor,
          pausedStepId: r.pausedStepId ?? null,
          startedAt: r.startedAt?.toISOString() ?? null,
          finishedAt: r.finishedAt?.toISOString() ?? null,
        }));
      }),

    // a single run with its persisted per-step results (the replay)
    get: orgScopedProcedure
      .input(z.object({ runId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const db = getDb();
        const [r] = await db
          .select()
          .from(workflowRuns)
          .where(and(eq(workflowRuns.id, input.runId), eq(workflowRuns.orgId, ctx.orgId)))
          .limit(1);
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        const stepRows = await db
          .select()
          .from(workflowRunSteps)
          .where(and(eq(workflowRunSteps.runId, r.id), eq(workflowRunSteps.orgId, ctx.orgId)))
          .orderBy(workflowRunSteps.order);
        return {
          id: r.id,
          status: r.status,
          pausedStepId: r.pausedStepId ?? null,
          inputs: r.inputs,
          outputs: r.outputs,
          startedAt: r.startedAt?.toISOString() ?? null,
          finishedAt: r.finishedAt?.toISOString() ?? null,
          steps: stepRows.map((s) => ({
            stepId: s.stepId,
            stepType: s.stepType,
            status: s.status,
            output: s.output,
            error: s.error ?? null,
            startedAt: s.startedAt?.toISOString() ?? null,
            finishedAt: s.finishedAt?.toISOString() ?? null,
            durationMs:
              s.startedAt && s.finishedAt ? s.finishedAt.getTime() - s.startedAt.getTime() : null,
          })),
        };
      }),
  }),

  // ─────────────────── step templates (reusable building blocks) ───────────────────
  stepTemplates: router({
    list: orgScopedProcedure.query(async ({ ctx }) => {
      const db = getDb();
      return db.select().from(stepTemplates).where(eq(stepTemplates.orgId, ctx.orgId)).orderBy(desc(stepTemplates.updatedAt));
    }),
    get: orgScopedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .select()
        .from(stepTemplates)
        .where(and(eq(stepTemplates.id, input.id), eq(stepTemplates.orgId, ctx.orgId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),
    delete: orgScopedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(stepTemplates).where(and(eq(stepTemplates.id, input.id), eq(stepTemplates.orgId, ctx.orgId)));
      return { id: input.id };
    }),
    create: orgScopedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          stepType: z.string(),
          summary: z.string().optional(),
          config: z.record(z.unknown()).optional(),
          inputs: z.array(z.any()).default([]),
          outputs: z.array(z.any()).default([]),
          instructions: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const slug =
          input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "step";
        const [row] = await db
          .insert(stepTemplates)
          .values({
            orgId: ctx.orgId,
            name: input.name,
            slug,
            stepType: input.stepType,
            summary: input.summary ?? null,
            config: input.config ?? null,
            inputs: input.inputs,
            outputs: input.outputs,
            instructions: input.instructions ?? null,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return row;
      }),
    update: orgScopedProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().optional(),
          stepType: z.string().optional(),
          summary: z.string().optional(),
          config: z.record(z.unknown()).optional(),
          inputs: z.array(z.any()).optional(),
          outputs: z.array(z.any()).optional(),
          instructions: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const { id, ...patch } = input;
        const [row] = await db
          .update(stepTemplates)
          .set({ ...patch, updatedBy: ctx.actor, updatedAt: new Date() })
          .where(and(eq(stepTemplates.id, id), eq(stepTemplates.orgId, ctx.orgId)))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        return row;
      }),
  }),

  // ─────────────────── step tests (fixtures + recorded results) ───────────────────
  stepTests: router({
    listForTemplate: orgScopedProcedure
      .input(z.object({ stepTemplateId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const db = getDb();
        return db
          .select()
          .from(stepTests)
          .where(and(eq(stepTests.stepTemplateId, input.stepTemplateId), eq(stepTests.orgId, ctx.orgId)));
      }),
    create: orgScopedProcedure
      .input(
        z.object({
          stepTemplateId: z.string().uuid(),
          name: z.string().min(1),
          outputId: z.string().optional(),
          criteria: z.array(z.any()).optional(),
          inputFixture: z.record(z.unknown()).default({}),
          expectedOutput: z.unknown().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [row] = await db
          .insert(stepTests)
          .values({
            orgId: ctx.orgId,
            stepTemplateId: input.stepTemplateId,
            name: input.name,
            outputId: input.outputId ?? null,
            criteria: input.criteria ?? null,
            inputFixture: input.inputFixture,
            expectedOutput: (input.expectedOutput ?? null) as unknown,
            createdBy: ctx.actor,
            updatedBy: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return row;
      }),
    run: orgScopedProcedure
      .input(z.object({ stepTestId: z.string().uuid(), captured: z.record(z.unknown()).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [test] = await db
          .select()
          .from(stepTests)
          .where(and(eq(stepTests.id, input.stepTestId), eq(stepTests.orgId, ctx.orgId)))
          .limit(1);
        if (!test) throw new TRPCError({ code: "NOT_FOUND" });
        const [tmpl] = await db
          .select()
          .from(stepTemplates)
          .where(and(eq(stepTemplates.id, test.stepTemplateId), eq(stepTemplates.orgId, ctx.orgId)))
          .limit(1);
        if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });

        const fixture = (test.inputFixture as Record<string, unknown>) ?? {};
        const declared = (tmpl.outputs as StepOutputDef[]) ?? [];
        // the test targets one declared output (null = the first); its criteria override that output's checks
        const target = declared.find((o) => o.id === test.outputId) ?? declared[0];
        const criteria = (test.criteria as StepOutputDef["verifications"] | null) ?? null;
        const outputs: StepOutputDef[] =
          criteria && criteria.length && target
            ? [{ ...target, verifications: criteria }]
            : target
              ? [target]
              : declared;

        let actualOutput: unknown;
        let error: string | null = null;

        if (input.captured != null) {
          // live trial — the operator just performed the step (e.g. uploaded the pictures)
          actualOutput = input.captured;
        } else if (fixture.captured != null) {
          // a provided sample output — score it directly against the success criteria
          actualOutput = fixture.captured;
        } else if (tmpl.stepType === "human_approval" || tmpl.stepType === "human_input") {
          actualOutput = fixture.output ?? fixture;
        } else {
          const stepInputs = (fixture.inputs as Record<string, unknown>) ?? fixture;
          const result = await runWorkflow(
            {
              name: `steptest:${tmpl.slug}`,
              steps: [
                {
                  id: tmpl.slug || "step",
                  type: tmpl.stepType as StepType,
                  inputs: stepInputs,
                  config: (tmpl.config ?? undefined) as Record<string, unknown> | undefined,
                },
              ],
            },
            { inputs: stepInputs, handlers: orgHandlers(ctx.orgId) },
          );
          if (result.status === "failed") error = result.steps[0]?.error ?? "step failed";
          actualOutput = result.outputs[tmpl.slug || "step"];
        }

        const captured = coerceCaptured(outputs, actualOutput);
        const verificationResults = evaluateVerifications(outputs, captured);
        const blocking = hasBlockingFailure(outputs, verificationResults);
        let diff: unknown = null;
        let expectedOk = true;
        if (test.expectedOutput != null) {
          expectedOk = JSON.stringify(actualOutput) === JSON.stringify(test.expectedOutput);
          if (!expectedOk) diff = { expected: test.expectedOutput, actual: actualOutput };
          verificationResults.push({
            outputId: "__expected__",
            kind: "matches_expected",
            status: expectedOk ? "pass" : "fail",
            message: expectedOk ? undefined : "output differs from expected",
          });
        }
        const passed = !error && !blocking && expectedOk;
        // score = share of success criteria met (0–100); a thrown step scores 0
        const total = verificationResults.length;
        const passedCount = verificationResults.filter((r) => r.status === "pass").length;
        const score = error ? 0 : total === 0 ? 100 : Math.round((100 * passedCount) / total);

        const [row] = await db
          .insert(stepTestRuns)
          .values({
            orgId: ctx.orgId,
            stepTestId: test.id,
            passed,
            score,
            actualOutput: (actualOutput ?? null) as unknown,
            verificationResults,
            diff,
            error,
            actor: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return row;
      }),
    // Live trial: grade the files the operator actually uploaded into a real
    // project. Reads the `documents` rows back (source of truth), confirms the
    // blobs landed in Storage, then scores them against the evaluation's
    // criteria. Output = the storage paths. This is the real Brief→Act→Verify→
    // Resolve loop — not browser-collected metadata like `run`.
    runUpload: orgScopedProcedure
      .input(
        z.object({
          stepTestId: z.string().uuid(),
          projectId: z.string().uuid(),
          documentIds: z.array(z.string().uuid()).default([]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [test] = await db
          .select()
          .from(stepTests)
          .where(and(eq(stepTests.id, input.stepTestId), eq(stepTests.orgId, ctx.orgId)))
          .limit(1);
        if (!test) throw new TRPCError({ code: "NOT_FOUND" });
        const [tmpl] = await db
          .select()
          .from(stepTemplates)
          .where(and(eq(stepTemplates.id, test.stepTemplateId), eq(stepTemplates.orgId, ctx.orgId)))
          .limit(1);
        if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });
        const [proj] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.orgId, ctx.orgId)))
          .limit(1);
        if (!proj) throw new TRPCError({ code: "BAD_REQUEST", message: "Project not in this org" });

        // Read the DB records that were just uploaded — the source of truth.
        const rows = input.documentIds.length
          ? await db
              .select()
              .from(documents)
              .where(
                and(
                  eq(documents.orgId, ctx.orgId),
                  eq(documents.projectId, input.projectId),
                  inArray(documents.id, input.documentIds),
                ),
              )
          : [];

        // Confirm the blobs actually landed in Storage (best-effort: if storage
        // isn't configured, fall back to trusting the rows).
        const missing: string[] = [];
        try {
          const storage = getStorageClient();
          const { data: objs } = await storage.storage
            .from(BUCKET)
            .list(`${ctx.orgId}/${input.projectId}`, { limit: 1000 });
          const present = new Set((objs ?? []).map((o) => o.name));
          for (const r of rows) {
            const base = r.storagePath.split("/").pop() ?? "";
            if (!present.has(base)) missing.push(r.name);
          }
        } catch {
          // storage unavailable — skip the existence check
        }
        const landed = rows.filter((r) => !missing.includes(r.name));

        // the test targets one declared output (null = the first); its criteria override that output's checks
        const declared = (tmpl.outputs as StepOutputDef[]) ?? [];
        const target = declared.find((o) => o.id === test.outputId) ?? declared[0];
        const criteria = (test.criteria as StepOutputDef["verifications"] | null) ?? null;
        const outputs: StepOutputDef[] =
          criteria && criteria.length && target
            ? [{ ...target, verifications: criteria }]
            : target
              ? [target]
              : declared;
        const outId = target?.id ?? "output";

        // Build the captured photo-set from the DB rows (mime + size as recorded).
        const captured: Record<string, unknown> = {
          [outId]: landed.map((r) => ({ name: r.name, type: r.mimeType, size: r.sizeBytes, path: r.storagePath })),
        };
        const verificationResults = evaluateVerifications(outputs, captured);
        if (missing.length) {
          verificationResults.push({
            outputId: outId,
            kind: "blobs_present",
            status: "fail",
            message: `${missing.length} file(s) never landed in storage`,
          });
        }
        const blocking = hasBlockingFailure(outputs, verificationResults) || missing.length > 0;
        const paths = landed.map((r) => r.storagePath);
        const total = verificationResults.length;
        const passedCount = verificationResults.filter((r) => r.status === "pass").length;
        const score = total === 0 ? 100 : Math.round((100 * passedCount) / total);

        const [row] = await db
          .insert(stepTestRuns)
          .values({
            orgId: ctx.orgId,
            stepTestId: test.id,
            passed: !blocking,
            score,
            actualOutput: { paths, documentIds: landed.map((r) => r.id) } as unknown,
            verificationResults,
            diff: null,
            error: null,
            actor: ctx.actor,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return { ...row, paths };
      }),
    listRuns: orgScopedProcedure
      .input(z.object({ stepTestId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const db = getDb();
        return db
          .select()
          .from(stepTestRuns)
          .where(and(eq(stepTestRuns.stepTestId, input.stepTestId), eq(stepTestRuns.orgId, ctx.orgId)))
          .orderBy(desc(stepTestRuns.ranAt));
      }),
  }),
});
