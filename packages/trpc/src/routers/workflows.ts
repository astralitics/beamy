import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getDb,
  stepTemplates,
  stepTestRuns,
  stepTests,
  workflowRuns,
  workflowRunSteps,
  workflowVersions,
  workflows,
} from "@beamy/db";
import { orgScopedProcedure, router } from "../init";
import {
  mockHandlers,
  runWorkflow,
  type RunResult,
  type StepType,
  type WorkflowDef,
} from "../workflow/engine";
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
          handlers: mockHandlers,
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
          handlers: mockHandlers,
          approvals: new Set(input.approvals),
        });
        await persistRun(db, ctx.orgId, input.runId, result);
        return runView(input.runId, result);
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
        // criteria designed in THIS evaluation override the template output's checks
        const criteria = (test.criteria as StepOutputDef["verifications"] | null) ?? null;
        const outputs: StepOutputDef[] =
          criteria && criteria.length && declared[0]
            ? [{ ...declared[0], verifications: criteria }]
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
            { inputs: stepInputs, handlers: mockHandlers },
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
