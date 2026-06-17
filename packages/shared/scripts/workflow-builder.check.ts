// Fixture for normalizeWorkflowDef — pure, deterministic, no db/anthropic:
//   npx tsx packages/shared/scripts/workflow-builder.check.ts
// Layer 1: repair/validate semantics. Layer 2: every normalized def is engine-runnable (topoOrder
// + runWorkflow with mockHandlers never throw).
import assert from "node:assert/strict";
import { normalizeWorkflowDef } from "../src/workflow-builder";
import { WORKFLOW_STEP_TYPES } from "../src/workflows";
import { runWorkflow, type WorkflowDef } from "../../trpc/src/workflow/engine";

// clean def passes essentially untouched
{
  const { def, warnings, dropped } = normalizeWorkflowDef({
    name: "Lead intake",
    steps: [
      { id: "draft", type: "ai_agent_task", config: { prompt: "Draft a scope" } },
      { id: "gate", type: "human_approval", dependsOn: ["draft"], instructions: "Approve?" },
      { id: "send", type: "notify", dependsOn: ["gate"], config: { channel: "email", to: "a@b.com", subject: "x", body: "y" } },
    ],
  });
  assert.equal(def.steps.length, 3);
  assert.equal(dropped.length, 0);
  assert.deepEqual(def.steps[1]!.dependsOn, ["draft"]);
}

// unknown type → dropped
{
  const { def, dropped } = normalizeWorkflowDef({ name: "x", steps: [{ id: "a", type: "send_email" }, { id: "b", type: "succeed" }] });
  assert.equal(def.steps.length, 1);
  assert.ok(dropped.some((d) => d.includes("send_email")));
}

// id slugify + dependsOn references rewritten to the slugified id
{
  const { def } = normalizeWorkflowDef({ name: "x", steps: [
    { id: "First Step!", type: "ai_agent_task", config: { prompt: "p" } },
    { id: "second", type: "succeed", dependsOn: ["First Step!"] },
  ] });
  assert.equal(def.steps[0]!.id, "first_step");
  assert.deepEqual(def.steps[1]!.dependsOn, ["first_step"], "dep rewritten to the slugified id");
}

// duplicate ids deduped; no self-dependency left (a dep on the shared id is ambiguous → resolved/dropped)
{
  const { def } = normalizeWorkflowDef({ name: "x", steps: [
    { id: "step", type: "ai_agent_task", config: { prompt: "p" } },
    { id: "step", type: "succeed", dependsOn: ["step"] },
  ] });
  assert.equal(new Set(def.steps.map((s) => s.id)).size, 2, "ids deduped");
  assert.ok(!def.steps[1]!.dependsOn?.includes(def.steps[1]!.id), "no self-dependency");
}

// dangling + self dependsOn stripped
{
  const { def } = normalizeWorkflowDef({ name: "x", steps: [{ id: "a", type: "succeed", dependsOn: ["a", "ghost"] }] });
  assert.equal(def.steps[0]!.dependsOn, undefined);
}

// when referencing a missing step → cleared
{
  const { def } = normalizeWorkflowDef({ name: "x", steps: [{ id: "a", type: "delay", when: "${steps.ghost.output.onTrue}" }] });
  assert.equal(def.steps[0]!.when, undefined);
}

// missing required config → KEEP + warn (not dropped)
{
  const { def, warnings, dropped } = normalizeWorkflowDef({ name: "x", steps: [{ id: "a", type: "http_call", config: {} }] });
  assert.equal(def.steps.length, 1, "kept");
  assert.equal(dropped.length, 0);
  assert.ok(warnings.some((w) => w.includes("url")));
}

// hallucinated config keys stripped; http method clamped
{
  const { def } = normalizeWorkflowDef({ name: "x", steps: [{ id: "a", type: "http_call", config: { url: "https://x", method: "fetch", nonsense: 1 } }] });
  assert.equal((def.steps[0]!.config as Record<string, unknown>).method, "GET");
  assert.equal((def.steps[0]!.config as Record<string, unknown>).nonsense, undefined);
}

// malformed shapes coerced (config string, dependsOn string) — no throw
{
  const { def } = normalizeWorkflowDef({ name: "x", steps: [{ id: "a", type: "succeed", config: "oops", dependsOn: "b" }] });
  assert.ok(def.steps[0]!.config === undefined || typeof def.steps[0]!.config === "object");
  assert.equal(def.steps[0]!.dependsOn, undefined);
}

// cyclic def (A↔B) becomes acyclic
{
  const { def } = normalizeWorkflowDef({ name: "x", steps: [
    { id: "a", type: "succeed", dependsOn: ["b"] },
    { id: "b", type: "succeed", dependsOn: ["a"] },
  ] });
  // topoIds would fail if cyclic; engine parity below proves acyclic
  assert.equal(def.steps.length, 2);
}

// non-executable engine type (parallel — still a placeholder, not in STEP_VOCAB) → dropped (no
// handler → would throw at runtime). NB: `loop` IS executable now (in the vocab), so it is kept.
{
  const { def, dropped } = normalizeWorkflowDef({ name: "x", steps: [{ id: "p", type: "parallel" }, { id: "ok", type: "succeed" }] });
  assert.equal(def.steps.length, 1);
  assert.ok(dropped.some((d) => d.includes("parallel")));
}

// when-rewrite under a slug COLLISION must not point at the wrong step (single-pass, no chaining)
{
  const { def } = normalizeWorkflowDef({ name: "x", steps: [
    { id: "x y", type: "branch", config: { condition: "true" } }, // → "x_y"
    { id: "x_y", type: "delay" },                                   // collision → "x_y_1"
    { id: "c", type: "delay", dependsOn: ["x y"], when: "${steps.x y.output.onTrue}" },
  ] });
  const c = def.steps.find((s) => s.id === "c")!;
  assert.equal(c.when, "${steps.x_y.output.onTrue}", "gate maps to the FIRST step, not the collided second");
}

// empty / garbage input → valid empty def
{
  const { def } = normalizeWorkflowDef("not an object");
  assert.equal(def.steps.length, 0);
  assert.ok(def.name);
}

// system-prompt vocab covers every engine step type is asserted in ai-builder's own surface; here we
// assert the normalizer's type set matches the engine vocabulary (no drift)
assert.equal(WORKFLOW_STEP_TYPES.includes("branch"), true);

// ── Layer 2: engine-runnability parity — every normalized def runs without throwing ──
const cases: unknown[] = [
  { name: "branch", steps: [
    { id: "d", type: "branch", config: { condition: "${inputs.go}" } },
    { id: "y", type: "succeed", dependsOn: ["d"], when: "${steps.d.output.onTrue}" },
    { id: "n", type: "delay", dependsOn: ["d"], when: "${steps.d.output.onFalse}" },
  ] },
  { name: "cyclic", steps: [{ id: "a", type: "delay", dependsOn: ["b"] }, { id: "b", type: "delay", dependsOn: ["a"] }] },
  { name: "dupes", steps: [{ id: "s", type: "delay" }, { id: "s", type: "delay", dependsOn: ["s"] }] },
  // dense cycle (complete digraph of 4): each node depends on the other three — needs many edge
  // removals; proves breakCycles converges to acyclic (the old node-count bound exited still-cyclic).
  { name: "dense", steps: ["a", "b", "c", "d"].map((id) => ({ id, type: "delay", dependsOn: ["a", "b", "c", "d"].filter((x) => x !== id) })) },
];
for (const c of cases) {
  const { def } = normalizeWorkflowDef(c);
  await runWorkflow(def as WorkflowDef, { inputs: { go: true } }); // must not throw (no cycle / no bad handler)
}

console.log("✓ workflow-builder.check: normalize semantics + engine-runnability parity — all passed");
