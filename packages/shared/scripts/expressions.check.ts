// Fixture check for the shared expression resolver — runnable without DB/auth/UI (login-wall
// friendly): `npx tsx packages/shared/scripts/expressions.check.ts`. Asserts resolution semantics
// AND that the @beamy/trpc engine's re-export resolves identically to the shared implementation.
import assert from "node:assert/strict";
import { exprPaths, isExpr, resolveExpr, resolveVars, truthy } from "../src/expressions";
import { resolveExpr as engineResolveExpr, resolveVars as engineResolveVars } from "../../trpc/src/workflow/engine";

const scope = {
  inputs: { name: "Ada", count: 3 },
  outputs: { draft: { total: 4200, lines: [{ sku: "A" }] }, gate: { approved: true } },
};

// exact single-expression preserves the resolved value's type
assert.equal(resolveVars("${inputs.name}", scope), "Ada");
assert.equal(resolveVars("${inputs.count}", scope), 3);
assert.equal(resolveVars("${steps.draft.output.total}", scope), 4200);
assert.deepEqual(resolveVars("${steps.draft.output.lines}", scope), [{ sku: "A" }]);
assert.equal(resolveVars("${steps.gate.output.approved}", scope), true);

// interpolation into a larger string (objects JSON-stringified, missing → "")
assert.equal(resolveVars("Hi ${inputs.name}, total ${steps.draft.output.total}", scope), "Hi Ada, total 4200");
assert.equal(resolveVars("x ${inputs.missing} y", scope), "x  y");
assert.equal(resolveVars("${inputs.missing}", scope), undefined);

// nested objects/arrays resolve recursively; an exact single-token field keeps the typed value
assert.deepEqual(resolveVars({ body: { to: "${inputs.name}", n: "${steps.draft.output.total}" } }, scope), {
  body: { to: "Ada", n: 4200 },
});

// own-property-only traversal: an inherited Object.prototype member (toString/constructor/valueOf)
// must NOT resolve to the inherited value (it would read truthy in a `when` gate). A real own key
// of the same name still resolves. (Hardens the switch `cases.<id>` namespace, but applies to all.)
assert.equal(resolveVars("${steps.draft.output.toString}", scope), undefined, "inherited toString does not leak");
assert.equal(resolveVars("${steps.gate.output.constructor}", scope), undefined, "inherited constructor does not leak");
assert.equal(resolveVars("${steps.shadow.output.toString}", { outputs: { shadow: { toString: "real" } } }), "real", "an own key shadowing a prototype name still resolves");
assert.equal(resolveVars("${steps.draft.output.lines.length}", scope), 1, "own array length still resolves");

// resolveExpr + helpers
assert.equal(resolveExpr("steps.draft.output.total", scope), 4200);
assert.equal(isExpr("${inputs.name}"), true);
assert.equal(isExpr("hi ${inputs.name}"), false);
assert.deepEqual(exprPaths("a ${inputs.x} b ${steps.s.output.y}"), ["inputs.x", "steps.s.output.y"]);
assert.deepEqual(exprPaths("no tokens"), []);

// the engine re-export must resolve identically to the shared implementation
for (const c of ["${inputs.name}", "Hi ${inputs.name} / ${steps.draft.output.total}", "${steps.gate.output.approved}"]) {
  assert.deepEqual(engineResolveVars(c, scope), resolveVars(c, scope), `engine vs shared mismatch for ${c}`);
}
assert.equal(engineResolveExpr("steps.draft.output.total", scope), resolveExpr("steps.draft.output.total", scope));

// truthy() — control-flow coercion shared by the engine `when` gate + the branch handler
for (const t of [true, 1, -1, "yes", "true", "anything", [1], {}, { a: 1 }]) {
  assert.equal(truthy(t), true, `truthy(${JSON.stringify(t)}) should be true`);
}
for (const f of [false, 0, NaN, "", "false", "FALSE", " no ", "off", "0", [], null, undefined]) {
  assert.equal(truthy(f), false, `truthy(${JSON.stringify(f)}) should be false`);
}

console.log("✓ expressions.check: shared resolver + engine re-export parity + truthy — all assertions passed");
