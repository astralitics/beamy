// Engine fixture for real conditional branching (IF) — pure, no DB/auth/UI:
//   npx tsx packages/trpc/src/workflow/branch.check.ts
// Asserts routing, skip cascade, joins, nesting, gated-on-skipped, and skipUnless back-compat
// directly on RunResult. Uses `delay` steps as no-op path markers (they complete with {ok:true}
// without breaking the loop, unlike `succeed`).
import assert from "node:assert/strict";
import { runWorkflow, type RunResult, type WorkflowDef } from "./engine";
import { makeRealHandlers } from "./handlers";

const H = makeRealHandlers();
const run = (def: WorkflowDef, inputs: Record<string, unknown>) => runWorkflow(def, { inputs, handlers: H });
const stat = (r: RunResult, id: string) => r.steps.find((s) => s.id === id)?.status;

// ── basic routing + cascade + joins ──
const ifDef: WorkflowDef = {
  name: "if",
  steps: [
    { id: "decide", type: "branch", config: { condition: "${inputs.go}" } },
    { id: "yes", type: "delay", dependsOn: ["decide"], when: "${steps.decide.output.onTrue}" },
    { id: "no", type: "delay", dependsOn: ["decide"], when: "${steps.decide.output.onFalse}" },
    { id: "yes2", type: "delay", dependsOn: ["yes"] }, // cascade marker (no own gate)
    { id: "merge", type: "delay", dependsOn: ["decide"] }, // recommended join: after the branch
    { id: "badmerge", type: "delay", dependsOn: ["yes", "no"] }, // gotcha join: after both arms
  ],
};
{
  const r = await run(ifDef, { go: true });
  assert.equal(r.status, "completed");
  assert.deepEqual(r.outputs.decide, { value: true, onTrue: true, onFalse: false });
  assert.equal(stat(r, "yes"), "completed", "true path runs");
  assert.equal(stat(r, "no"), "skipped", "false path skips");
  assert.equal(stat(r, "yes2"), "completed", "cascade: dependent of a run step runs");
  assert.equal(stat(r, "merge"), "completed", "join on the branch itself runs");
  assert.equal(stat(r, "badmerge"), "skipped", "join on both arms always skips (one arm skipped)");
}
{
  const r = await run(ifDef, { go: false });
  assert.deepEqual(r.outputs.decide, { value: false, onTrue: false, onFalse: true });
  assert.equal(stat(r, "no"), "completed", "false path runs");
  assert.equal(stat(r, "yes"), "skipped", "true path skips");
  assert.equal(stat(r, "yes2"), "skipped", "cascade: dependent of a skipped step skips");
  assert.equal(stat(r, "merge"), "completed", "join on the branch runs on the false path too");
}

// ── nested branches ──
const nestedDef: WorkflowDef = {
  name: "nested",
  steps: [
    { id: "a", type: "branch", config: { condition: "${inputs.go}" } },
    { id: "b", type: "branch", dependsOn: ["a"], when: "${steps.a.output.onTrue}", config: { condition: "${inputs.go2}" } },
    { id: "child", type: "delay", dependsOn: ["b"], when: "${steps.b.output.onTrue}" },
  ],
};
assert.equal(stat(await run(nestedDef, { go: true, go2: true }), "child"), "completed", "nested: runs only when both true");
assert.equal(stat(await run(nestedDef, { go: true, go2: false }), "child"), "skipped", "nested: inner false skips child");
{
  const r = await run(nestedDef, { go: false, go2: true });
  assert.equal(stat(r, "b"), "skipped", "nested: inner branch skips when outer is false");
  assert.equal(stat(r, "child"), "skipped", "nested: child skips under a skipped branch");
}

// ── ordering: a `when`-gated step with NO dependsOn is still ordered AFTER its branch ──
// `lonely` is listed FIRST and depends on nothing; `decide` depends on `pre` so it is NOT a root.
// Only the engine deriving an ordering edge from `when` makes this correct (regression test): with
// pure-dependsOn ordering, `lonely` would evaluate before `decide` produced output → wrongly skip.
const orphanDef: WorkflowDef = {
  name: "orphan",
  steps: [
    { id: "lonely", type: "delay", when: "${steps.decide.output.onTrue}" },
    { id: "pre", type: "delay" },
    { id: "decide", type: "branch", dependsOn: ["pre"], config: { condition: "${inputs.go}" } },
  ],
};
assert.equal(stat(await run(orphanDef, { go: true }), "lonely"), "completed", "when-gated step ordered after its branch even with no dependsOn + reversed array order");
assert.equal(stat(await run(orphanDef, { go: false }), "lonely"), "skipped", "gate-only step skips on the false path");

// ── no condition → false path ──
const noCondDef: WorkflowDef = {
  name: "nocond",
  steps: [
    { id: "decide", type: "branch", config: {} },
    { id: "yes", type: "delay", dependsOn: ["decide"], when: "${steps.decide.output.onTrue}" },
    { id: "no", type: "delay", dependsOn: ["decide"], when: "${steps.decide.output.onFalse}" },
  ],
};
{
  const r = await run(noCondDef, {});
  assert.deepEqual(r.outputs.decide, { value: false, onTrue: false, onFalse: true }, "no condition → false");
  assert.equal(stat(r, "no"), "completed");
  assert.equal(stat(r, "yes"), "skipped");
}

// ── back-compat: legacy skipUnless (step-id key) still gates ──
const legacyDef: WorkflowDef = {
  name: "legacy",
  steps: [
    { id: "flagOff", type: "function_call", run: () => 0 }, // falsy output
    { id: "flagOn", type: "function_call", run: () => 1 }, // truthy output
    { id: "gOff", type: "delay", dependsOn: ["flagOff"], skipUnless: "flagOff" },
    { id: "gOn", type: "delay", dependsOn: ["flagOn"], skipUnless: "flagOn" },
  ],
};
{
  const r = await run(legacyDef, {});
  assert.equal(stat(r, "gOff"), "skipped", "skipUnless skips when the referenced output is falsy");
  assert.equal(stat(r, "gOn"), "completed", "skipUnless runs when the referenced output is truthy");
}

// ── the step-test harness path: a lone branch resolves its condition from inputs ──
{
  const r = await runWorkflow(
    { name: "t", steps: [{ id: "b", type: "branch", config: { condition: "${inputs.approved}" }, dependsOn: [] }] },
    { inputs: { approved: false }, handlers: H },
  );
  assert.deepEqual(r.outputs.b, { value: false, onTrue: false, onFalse: true });
}

console.log("✓ branch.check: routing · cascade · joins · nesting · gate-on-unreached · no-condition · skipUnless back-compat — all passed");
