// Engine fixture for for-each LOOP (map a single inner action over a list) — pure, no DB/auth/UI:
//   node node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs packages/trpc/src/workflow/loop.check.ts
// Asserts per-item dispatch + ${item}/${itemIndex} scope + outer-scope visibility, the aggregate
// output {results,count,succeeded,failed}, empty/non-array items, continueOnFail both ways, the
// maxIterations cap, missing/unknown/unsupported bodyType (incl. the v1 "no gates / no nesting in a
// loop body" constraint), and a loop aggregate driving a downstream gate.
import assert from "node:assert/strict";
import { mockHandlers, runWorkflow, type RunResult, type StepHandler, type WorkflowDef } from "./engine";

// An echo body handler: returns its (already per-item-resolved) config, throwing on a sentinel value.
const echo: StepHandler = (ctx) => {
  const c = (ctx.step.config ?? {}) as Record<string, unknown>;
  if (c.v === "bad") throw new Error("bad item");
  return c;
};
const H = { ...mockHandlers, function_call: echo };
const run = (def: WorkflowDef, inputs: Record<string, unknown> = {}) => runWorkflow(def, { inputs, handlers: H });
const stat = (r: RunResult, id: string) => r.steps.find((s) => s.id === id)?.status;
const errOf = (r: RunResult, id: string) => r.steps.find((s) => s.id === id)?.error ?? "";

// ── basic map: ${item.field} + ${itemIndex} + outer ${inputs.x} all resolve per item ──
{
  const def: WorkflowDef = {
    name: "map",
    steps: [{ id: "loop", type: "loop", config: { items: "${inputs.people}", bodyType: "function_call", bodyConfig: { to: "${item.email}", i: "${itemIndex}", tag: "${inputs.tag}" } } }],
  };
  const r = await run(def, { people: [{ email: "a@x" }, { email: "b@x" }], tag: "hi" });
  assert.equal(r.status, "completed");
  assert.deepEqual(r.outputs.loop, {
    results: [{ to: "a@x", i: 0, tag: "hi" }, { to: "b@x", i: 1, tag: "hi" }],
    count: 2, succeeded: 2, failed: 0,
  }, "per-item body config resolves ${item.x}/${itemIndex} (typed number)/${inputs.x}; aggregate output");
}

// ── whole-item ${item} + primitive items ──
{
  const def: WorkflowDef = { name: "prim", steps: [{ id: "loop", type: "loop", config: { items: "${inputs.xs}", bodyType: "function_call", bodyConfig: { v: "${item}" } } }] };
  const r = await run(def, { xs: ["x", "y", "z"] });
  const o = r.outputs.loop as { results: unknown[]; count: number };
  assert.deepEqual(o.results, [{ v: "x" }, { v: "y" }, { v: "z" }]);
  assert.equal(o.count, 3);
}

// ── empty array → completes, count 0 (not an error) ──
{
  const def: WorkflowDef = { name: "empty", steps: [{ id: "loop", type: "loop", config: { items: "${inputs.xs}", bodyType: "function_call", bodyConfig: { v: "${item}" } } }] };
  const r = await run(def, { xs: [] });
  assert.equal(r.status, "completed");
  assert.deepEqual(r.outputs.loop, { results: [], count: 0, succeeded: 0, failed: 0 });
}

// ── non-array items → fail fast ──
{
  const def: WorkflowDef = { name: "na", steps: [{ id: "loop", type: "loop", config: { items: "${inputs.x}", bodyType: "function_call", bodyConfig: { v: "${item}" } } }] };
  const r = await run(def, { x: "not an array" });
  assert.equal(r.status, "failed");
  assert.match(errOf(r, "loop"), /non-array/);
}

// ── continueOnFail=false → the run fails at the first bad item ──
{
  const def: WorkflowDef = { name: "cf0", steps: [{ id: "loop", type: "loop", config: { items: "${inputs.xs}", bodyType: "function_call", bodyConfig: { v: "${item.v}" } } }] };
  const r = await run(def, { xs: [{ v: "a" }, { v: "bad" }, { v: "c" }] });
  assert.equal(r.status, "failed");
  assert.match(errOf(r, "loop"), /item 1 failed: bad item/);
}

// ── continueOnFail=true → collects {_error}, keeps results[i] aligned, counts succeeded/failed ──
{
  const def: WorkflowDef = { name: "cf1", steps: [{ id: "loop", type: "loop", config: { continueOnFail: true, items: "${inputs.xs}", bodyType: "function_call", bodyConfig: { v: "${item.v}" } } }] };
  const r = await run(def, { xs: [{ v: "a" }, { v: "bad" }, { v: "c" }] });
  assert.equal(r.status, "completed");
  const o = r.outputs.loop as { results: { v?: string; _error?: string }[]; count: number; succeeded: number; failed: number };
  assert.equal(o.count, 3);
  assert.equal(o.succeeded, 2);
  assert.equal(o.failed, 1);
  assert.equal(o.results[0]!.v, "a");
  assert.match(o.results[1]!._error!, /bad item/);
  assert.equal(o.results[2]!.v, "c", "results stay index-aligned with items past a failure");
}

// ── invalid bodies: missing config, and non-leaf body types rejected by the allowlist ──
// The allowlist guard fires BEFORE the handler lookup, so branch/switch (which DO have handlers) and
// human gates / nested loops / unknown types all get the same clear "not a valid loop action" error.
for (const [label, config, re] of [
  ["missing bodyConfig", { items: [1], bodyType: "function_call" }, /bodyConfig is required/],
  ["missing bodyType", { items: [1], bodyConfig: {} }, /bodyType is required/],
  ["unknown bodyType", { items: [1], bodyType: "nope", bodyConfig: {} }, /not a valid loop action/],
  ["human gate as body", { items: [1], bodyType: "human_approval", bodyConfig: {} }, /not a valid loop action/],
  ["nested loop as body", { items: [1], bodyType: "loop", bodyConfig: {} }, /not a valid loop action/],
  ["branch as body (has a handler, still rejected)", { items: [1], bodyType: "branch", bodyConfig: { condition: "true" } }, /not a valid loop action/],
  ["switch as body (has a handler, still rejected)", { items: [1], bodyType: "switch", bodyConfig: { value: "x", cases: [] } }, /not a valid loop action/],
] as const) {
  const r = await run({ name: "bad", steps: [{ id: "loop", type: "loop", config }] });
  assert.equal(r.status, "failed", `${label}: should fail`);
  assert.match(errOf(r, "loop"), re, `${label}: error`);
}

// ── maxIterations hardening: a non-positive / non-finite value falls back to the default (never
// disables the cap or produces a negative cap), a float floors, a valid value is honoured ──
for (const [label, maxIterations, items, expect] of [
  ["negative falls back to default (does not fail a small loop)", -5, [1, 2, 3], "completed"],
  ["zero falls back to default", 0, [1, 2, 3], "completed"],
  ["NaN string falls back to default", "abc", [1, 2, 3], "completed"],
  ["float floors (2.9 → cap 2, 3 items exceeds)", 2.9, [1, 2, 3], "failed"],
  ["valid cap honoured", 2, [1, 2, 3], "failed"],
] as const) {
  const r = await run({ name: "cap", steps: [{ id: "loop", type: "loop", config: { items, bodyType: "function_call", bodyConfig: { v: "${item}" }, maxIterations } }] });
  assert.equal(r.status, expect, `maxIterations ${label}`);
}

// ── the body dispatches through the SAME handler set (a mock notify per item) ──
{
  const def: WorkflowDef = { name: "dispatch", steps: [{ id: "loop", type: "loop", config: { items: ["a@x", "b@x"], bodyType: "notify", bodyConfig: { channel: "email", to: "${item}" } } }] };
  const r = await run(def);
  assert.equal((r.outputs.loop as { succeeded: number }).succeeded, 2);
  assert.deepEqual((r.outputs.loop as { results: unknown[] }).results[0], { mock: true, sent: true });
}

// ── a loop's aggregate output drives a downstream gate ──
{
  const def: WorkflowDef = {
    name: "drive",
    steps: [
      { id: "loop", type: "loop", config: { items: "${inputs.xs}", bodyType: "function_call", bodyConfig: { v: "${item}" } } },
      { id: "after", type: "delay", dependsOn: ["loop"], when: "${steps.loop.output.count}" },
    ],
  };
  assert.equal(stat(await run(def, { xs: [1, 2] }), "after"), "completed", "downstream runs when the loop processed > 0 items");
  assert.equal(stat(await run(def, { xs: [] }), "after"), "skipped", "downstream skips when the loop processed 0 items");
}

// ── a loop is an ordinary step for gating: a falsy `when` skips it (and it never runs the body) ──
{
  const def: WorkflowDef = {
    name: "gated",
    steps: [
      { id: "decide", type: "branch", config: { condition: "${inputs.go}" } },
      { id: "loop", type: "loop", dependsOn: ["decide"], when: "${steps.decide.output.onTrue}", config: { items: [1, 2], bodyType: "function_call", bodyConfig: { v: "${item}" } } },
    ],
  };
  assert.equal(stat(await run(def, { go: false }), "loop"), "skipped", "a loop gated by a falsy when skips");
  assert.equal(stat(await run(def, { go: true }), "loop"), "completed", "a loop gated by a truthy when runs");
}

// ── loop items sourced from a prior step's output (ordered via dependsOn — config refs don't auto-order) ──
{
  const def: WorkflowDef = {
    name: "chain",
    steps: [
      { id: "src", type: "function_call", run: () => ["p", "q"], dependsOn: [] },
      { id: "loop", type: "loop", dependsOn: ["src"], config: { items: "${steps.src.output}", bodyType: "function_call", bodyConfig: { v: "${item}" } } },
    ],
  };
  const r = await run(def, {});
  assert.equal(r.status, "completed");
  assert.deepEqual((r.outputs.loop as { results: unknown[] }).results, [{ v: "p" }, { v: "q" }], "items resolved from the upstream step output, mapped per item");
}

console.log("✓ loop.check: map · item/itemIndex scope · aggregate · empty/non-array · continueOnFail · maxIterations hardening · leaf-body allowlist · dispatch · gating · items-from-prior-step — all passed");
