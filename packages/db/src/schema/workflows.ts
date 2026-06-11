import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";

/**
 * Workflow Studio tables — adopted from the Astralitics catalog `workflows` +
 * `workflow-studio` modules (the portable DAG engine + authoring/testing/versioning
 * surface). See astralitics-catalog/packages/entities/src/{Workflow,WorkflowVersion,
 * StepTemplate,StepTest,StepTestRun}.ts.
 *
 * Steps live INSIDE `workflows.definition` (the DAG jsonb); publishing snapshots the whole
 * definition into an immutable `workflow_versions` row. `step_templates` are the separate,
 * individually-testable building blocks; `step_tests` + `step_test_runs` are their fixtures
 * and recorded pass/fail history. (design.md §11.)
 */

const audit = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
};

/** A workflow definition — the live editable draft (the DAG of steps). */
export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: text("version").notNull().default("0"), // "0" = unpublished draft; "N" once published
    ownerModule: text("owner_module").notNull().default("workflow-studio"),
    definition: jsonb("definition").notNull(), // { name, steps: [...] }
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    summary: text("summary"),
    triggerType: text("trigger_type", { enum: ["manual", "scheduled", "signal"] })
      .notNull()
      .default("manual"),
    triggerConfig: jsonb("trigger_config"),
    currentVersionId: uuid("current_version_id"), // soft ref -> workflow_versions.id
    ...audit,
  },
  (t) => ({
    byOrg: index("workflows_org_idx").on(t.orgId, t.status),
  }),
);

/** An immutable published snapshot of a workflow's definition. */
export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id").notNull(), // soft ref -> workflows.id
    versionNumber: integer("version_number").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    definition: jsonb("definition").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    ...audit,
  },
  (t) => ({
    byWorkflow: index("workflow_versions_workflow_idx").on(t.workflowId, t.versionNumber),
  }),
);

/** One execution of a workflow. */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    workflowName: text("workflow_name").notNull(),
    workflowVersion: text("workflow_version").notNull(), // pinned at run start
    status: text("status", {
      enum: ["running", "paused", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("running"),
    inputs: jsonb("inputs"),
    outputs: jsonb("outputs"),
    pausedStepId: text("paused_step_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    actor: text("actor").notNull(),
    parentRunId: uuid("parent_run_id"),
    parentStepId: text("parent_step_id"),
  },
  (t) => ({
    byOrg: index("workflow_runs_org_idx").on(t.orgId, t.startedAt),
    byWorkflow: index("workflow_runs_workflow_idx").on(t.workflowName, t.startedAt),
  }),
);

/** Per-step execution record (the audit + resume substrate). */
export const workflowRunSteps = pgTable(
  "workflow_run_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(), // soft ref -> workflow_runs.id
    stepId: text("step_id").notNull(),
    stepType: text("step_type").notNull(),
    status: text("status").notNull(),
    output: jsonb("output"),
    error: text("error"),
    order: integer("step_order").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRun: index("workflow_run_steps_run_idx").on(t.runId, t.order),
  }),
);

/** A reusable, individually-testable step (building block). */
export const stepTemplates = pgTable(
  "step_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    stepType: text("step_type").notNull(),
    summary: text("summary"),
    config: jsonb("config"),
    inputs: jsonb("inputs").notNull().default(sql`'[]'::jsonb`),
    outputs: jsonb("outputs").notNull().default(sql`'[]'::jsonb`),
    instructions: text("instructions"),
    status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
    ...audit,
  },
  (t) => ({
    byOrg: index("step_templates_org_idx").on(t.orgId),
  }),
);

/** A test case for a step template: input fixture + expected output/verifications. */
export const stepTests = pgTable(
  "step_tests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    stepTemplateId: uuid("step_template_id").notNull(), // soft ref -> step_templates.id
    name: text("name").notNull(),
    criteria: jsonb("criteria"), // success criteria designed in this evaluation (OutputVerification[])
    inputFixture: jsonb("input_fixture"),
    expectedOutput: jsonb("expected_output"),
    expectedVerifications: jsonb("expected_verifications"),
    ...audit,
  },
  (t) => ({
    byTemplate: index("step_tests_template_idx").on(t.stepTemplateId),
  }),
);

/** Append-only recorded result of running a step test. */
export const stepTestRuns = pgTable(
  "step_test_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    stepTestId: uuid("step_test_id").notNull(), // soft ref -> step_tests.id
    passed: boolean("passed").notNull(),
    score: integer("score"), // 0–100: share of success criteria met
    actualOutput: jsonb("actual_output"),
    verificationResults: jsonb("verification_results"),
    diff: jsonb("diff"),
    error: text("error"),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
  },
  (t) => ({
    byTest: index("step_test_runs_test_idx").on(t.stepTestId, t.ranAt),
  }),
);
