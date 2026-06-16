// Fixture for the ${…} autocomplete caret logic — runs without a browser:
//   npx tsx apps/web/scripts/expr-autocomplete.check.ts
// Covers the defects the adversarial review found: the dropdown opening inside an already-closed
// token, and accept() corrupting a token with a stray brace/text. `|` marks the caret in comments.
import assert from "node:assert/strict";
import { activeToken, insertRef } from "../src/pages/workflows/ui/expr-autocomplete";

// ── activeToken: only triggers inside a genuinely OPEN token ──
assert.equal(activeToken("plain value", 11), null, "no token");
assert.equal(activeToken("${ste", 5), "ste", "open token → partial");
assert.equal(activeToken("a ${x} b ${ste", 14), "ste", "second open token");
// closed to the RIGHT of the caret (the med-severity bug): caret in `${steps.a.out|put}`
assert.equal(activeToken("${steps.a.output}", 13), null, "caret inside a closed token (} after) → no trigger");
assert.equal(activeToken("${steps.a.output}", 16), null, "caret just before the closing } → no trigger");
assert.equal(activeToken("${}", 2), null, "empty ${} → no trigger");
assert.equal(activeToken("${a} ${b}", 3), null, "caret inside the first, already-closed token");
// closed to the LEFT of the caret
assert.equal(activeToken("${a} ", 5), null, "caret after a closed token");

// ── insertRef: never leaves a stray brace/partial behind ──
assert.deepEqual(insertRef("${ste", 5, "steps.a.output.x"), { next: "${steps.a.output.x}", caret: 19 }, "clean insert, no trailing");
assert.deepEqual(insertRef("${}", 2, "inputs.x"), { next: "${inputs.x}", caret: 11 }, "empty braces → no double }}");
assert.deepEqual(insertRef("${steps.a.output}", 8, "steps.a.output.total"), { next: "${steps.a.output.total}", caret: 23 }, "mid closed token → replace whole token");
assert.deepEqual(insertRef("pre ${x} post", 7, "inputs.y"), { next: "pre ${inputs.y} post", caret: 15 }, "consume token remainder, keep surrounding text");
assert.deepEqual(insertRef("a ${x", 5, "inputs.y"), { next: "a ${inputs.y}", caret: 13 }, "no trailing } to consume");
assert.deepEqual(insertRef("no token here", 5, "inputs.x"), { next: "no token here", caret: 5 }, "no ${ → unchanged");

console.log("✓ expr-autocomplete.check: caret token detection + insertion — all assertions passed");
