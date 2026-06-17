// Engine fixture for N-way switch/case routing — pure, no DB/auth/UI:
//   node node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs packages/trpc/src/workflow/switch.check.ts
// Asserts handler output, routing, the implicit default (no-match) path, skip cascade, joins,
// nesting, ordering-without-dependsOn, match coercion (trim/case-insensitive/numeric), empty/dup
// cases, and first-match-wins — directly on RunResult. Like branch.check.ts, `delay` steps are no-op
// path markers (they complete with {ok:true} without breaking the loop, unlike `succeed`).
import assert from "node:assert/strict";
import { runWorkflow, type RunResult, type WorkflowDef } from "./engine";
import { makeRealHandlers } from "./handlers";

const H = makeRealHandlers();
const run = (def: WorkflowDef, inputs: Record<string, unknown>) => runWorkflow(def, { inputs, handlers: H });
const stat = (r: RunResult, id: string) => r.steps.find((s) => s.id === id)?.status;

// Three named cases (high/mid/low) + an implicit default arm + a join on the switch itself.
const tierDef: WorkflowDef = {
  name: "tier",
  steps: [
    { id: "route", type: "switch", config: { value: "${inputs.tier}", cases: [
      { id: "high", value: "high" }, { id: "mid", value: "mid" }, { id: "low", value: "low" },
    ] } },
    { id: "do_high", type: "delay", dependsOn: ["route"], when: "${steps.route.output.cases.high}" },
    { id: "do_mid", type: "delay", dependsOn: ["route"], when: "${steps.route.output.cases.mid}" },
    { id: "do_low", type: "delay", dependsOn: ["route"], when: "${steps.route.output.cases.low}" },
    { id: "do_default", type: "delay", dependsOn: ["route"], when: "${steps.route.output.default}" },
    { id: "after_high", type: "delay", dependsOn: ["do_high"] }, // cascade marker (no own gate)
    { id: "merge", type: "delay", dependsOn: ["route"] }, // recommended join: after the switch
    { id: "badmerge", type: "delay", dependsOn: ["do_high", "do_low"] }, // gotcha join: after two arms
  ],
};

// ── routing to a named case ──
{
  const r = await run(tierDef, { tier: "mid" });
  assert.equal(r.status, "completed");
  assert.deepEqual(r.outputs.route, { value: "mid", matched: "mid", default: false, cases: { high: false, mid: true, low: false } });
  assert.equal(stat(r, "do_mid"), "completed", "matched case runs");
  assert.equal(stat(r, "do_high"), "skipped", "non-matched cases skip");
  assert.equal(stat(r, "do_low"), "skipped");
  assert.equal(stat(r, "do_default"), "skipped", "default skips when a case matched");
  assert.equal(stat(r, "after_high"), "skipped", "cascade: dependent of a skipped arm skips");
  assert.equal(stat(r, "merge"), "completed", "join on the switch itself always runs");
  assert.equal(stat(r, "badmerge"), "skipped", "join on two arms always skips (one arm always skipped)");
}
{
  const r = await run(tierDef, { tier: "high" });
  assert.equal(r.outputs.route && (r.outputs.route as { matched: unknown }).matched, "high");
  assert.equal(stat(r, "do_high"), "completed");
  assert.equal(stat(r, "after_high"), "completed", "cascade: dependent of a run arm runs");
  assert.equal(stat(r, "do_default"), "skipped");
}

// ── implicit default (no case matched) ──
{
  const r = await run(tierDef, { tier: "urgent" });
  assert.equal(r.status, "completed");
  assert.deepEqual(r.outputs.route, { value: "urgent", matched: null, default: true, cases: { high: false, mid: false, low: false } });
  assert.equal(stat(r, "do_default"), "completed", "default arm runs when nothing matched");
  assert.equal(stat(r, "do_high"), "skipped");
  assert.equal(stat(r, "do_mid"), "skipped");
  assert.equal(stat(r, "do_low"), "skipped");
}

// ── match coercion: trim + case-insensitive + numeric ──
{
  const r = await run(tierDef, { tier: "  HIGH  " });
  assert.equal((r.outputs.route as { matched: unknown }).matched, "high", "trimmed + case-insensitive match");
  assert.equal(stat(r, "do_high"), "completed");
}
{
  const numDef: WorkflowDef = {
    name: "num",
    steps: [
      { id: "route", type: "switch", config: { value: "${inputs.n}", cases: [{ id: "one", value: 1 }, { id: "two", value: "2" }] } },
      { id: "a", type: "delay", dependsOn: ["route"], when: "${steps.route.output.cases.one}" },
      { id: "b", type: "delay", dependsOn: ["route"], when: "${steps.route.output.cases.two}" },
    ],
  };
  assert.equal(stat(await run(numDef, { n: 1 }), "a"), "completed", "numeric input 1 matches case value 1");
  assert.equal(stat(await run(numDef, { n: "2" }), "b"), "completed", "string input '2' matches case value '2'");
}

// ── first-match-wins on duplicate VALUES (distinct ids) ──
{
  const dupVal: WorkflowDef = {
    name: "dupval",
    steps: [
      { id: "route", type: "switch", config: { value: "x", cases: [{ id: "first", value: "x" }, { id: "second", value: "x" }] } },
    ],
  };
  const r = await run(dupVal, {});
  assert.deepEqual(r.outputs.route, { value: "x", matched: "first", default: false, cases: { first: true, second: false } }, "first matching case wins; later duplicate-value case stays false");
}

// ── duplicate IDs: the later one is ignored (no key clobber); empty-id cases skipped ──
{
  const dupId: WorkflowDef = {
    name: "dupid",
    steps: [
      { id: "route", type: "switch", config: { value: "b", cases: [
        { id: "k", value: "a" }, { id: "", value: "b" }, { id: "k", value: "b" },
      ] } },
    ],
  };
  const r = await run(dupId, {});
  // The empty-id case is skipped; the duplicate "k" is ignored (first "k" already recorded, value "a" → false).
  assert.deepEqual(r.outputs.route, { value: "b", matched: null, default: true, cases: { k: false } });
}

// ── empty / missing cases → default, no routes ──
{
  const emptyDef: WorkflowDef = {
    name: "empty",
    steps: [
      { id: "route", type: "switch", config: { value: "anything" } }, // no cases key at all
      { id: "x", type: "delay", dependsOn: ["route"], when: "${steps.route.output.cases.nope}" },
      { id: "d", type: "delay", dependsOn: ["route"], when: "${steps.route.output.default}" },
    ],
  };
  const r = await run(emptyDef, {});
  assert.deepEqual(r.outputs.route, { value: "anything", matched: null, default: true, cases: {} });
  assert.equal(stat(r, "x"), "skipped", "gate on a non-existent case id skips");
  assert.equal(stat(r, "d"), "completed", "default runs even with no cases");
}

// ── reserved-name case ids (prototype-safe): a case id that collides with an Object.prototype member
// must be recorded as an OWN key and route correctly; and a gate on a prototype name that is NOT a
// declared case must NOT leak the inherited member as a truthy value (getPath is own-property-only). ──
{
  const protoDef: WorkflowDef = {
    name: "proto",
    steps: [
      { id: "route", type: "switch", config: { value: "${inputs.v}", cases: [
        { id: "constructor", value: "ctor" }, { id: "toString", value: "ts" },
      ] } },
      { id: "hit", type: "delay", dependsOn: ["route"], when: "${steps.route.output.cases.constructor}" },
      { id: "ghost", type: "delay", dependsOn: ["route"], when: "${steps.route.output.cases.valueOf}" }, // no such case
    ],
  };
  const r = await run(protoDef, { v: "ctor" });
  assert.deepEqual(r.outputs.route, { value: "ctor", matched: "constructor", default: false, cases: { constructor: true, toString: false } }, "reserved-name ids recorded as own keys + routed (not dropped by a prototype-chain check)");
  assert.equal(stat(r, "hit"), "completed", "gate on a real reserved-name case ('constructor') runs");
  assert.equal(stat(r, "ghost"), "skipped", "gate on an inherited prototype name with no matching case ('valueOf') does NOT leak truthy");
}

// ── ordering: a switch-gated step with NO dependsOn is still ordered AFTER its switch ──
// `lonely` is listed FIRST and depends on nothing; `route` depends on `pre` so it is NOT a root.
// Only the engine deriving an ordering edge from `when` (whenRefs) makes this correct.
{
  const orphanDef: WorkflowDef = {
    name: "orphan",
    steps: [
      { id: "lonely", type: "delay", when: "${steps.route.output.cases.go}" },
      { id: "pre", type: "delay" },
      { id: "route", type: "switch", dependsOn: ["pre"], config: { value: "${inputs.v}", cases: [{ id: "go", value: "go" }] } },
    ],
  };
  assert.equal(stat(await run(orphanDef, { v: "go" }), "lonely"), "completed", "switch-gated step ordered after its switch despite reversed array order");
  assert.equal(stat(await run(orphanDef, { v: "stop" }), "lonely"), "skipped", "gate-only step skips when its case didn't match");
}

// ── nested switches ──
{
  const nestedDef: WorkflowDef = {
    name: "nested",
    steps: [
      { id: "outer", type: "switch", config: { value: "${inputs.a}", cases: [{ id: "x", value: "x" }, { id: "y", value: "y" }] } },
      { id: "inner", type: "switch", dependsOn: ["outer"], when: "${steps.outer.output.cases.x}", config: { value: "${inputs.b}", cases: [{ id: "p", value: "p" }] } },
      { id: "leaf", type: "delay", dependsOn: ["inner"], when: "${steps.inner.output.cases.p}" },
    ],
  };
  assert.equal(stat(await run(nestedDef, { a: "x", b: "p" }), "leaf"), "completed", "nested: runs only when both route through");
  assert.equal(stat(await run(nestedDef, { a: "x", b: "q" }), "leaf"), "skipped", "nested: inner no-match skips leaf");
  {
    const r = await run(nestedDef, { a: "y", b: "p" });
    assert.equal(stat(r, "inner"), "skipped", "nested: inner switch skips when outer routed elsewhere");
    assert.equal(stat(r, "leaf"), "skipped", "nested: leaf skips under a skipped inner switch");
  }
}

console.log("✓ switch.check: routing · default · cascade · joins · nesting · ordering · coercion · dup/empty cases · first-match-wins — all passed");
