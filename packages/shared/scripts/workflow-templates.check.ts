// Fixture for the shipped workflow templates — pure, no db/auth:
//   node node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs packages/shared/scripts/workflow-templates.check.ts
// Tests the SAME WORKFLOW_TEMPLATES the gallery ships. For every template: it normalizes clean
// (0 dropped, no repair/missing-required warnings, 3-7 steps, all refs resolve) and runs through the
// engine without throwing. Per-template run variants assert the gate pauses and both branch arms route.
import assert from "node:assert/strict";
import { normalizeWorkflowDef } from "../src/workflow-builder";
import { WORKFLOW_TEMPLATES } from "../src/workflow-templates";
import { mockHandlers, runWorkflow, type WorkflowDef } from "../../trpc/src/workflow/engine";

const REPAIR = /missing|unknown|self-depend|cleared a gate|cycle|removed edge|removed remaining/i;

interface Variant { label: string; inputs?: Record<string, unknown>; approvals?: string[]; expect: "completed" | "paused" | "failed"; ran?: string; skipped?: string }
// What each template should DO when run with mock handlers (drives the gate + branch arms).
const VARIANTS: Record<string, Variant[]> = {
  "batch-vendor-outreach": [
    { label: "emails each vendor on the list", inputs: { vendors: [{ email: "a@x.com", name: "A" }, { email: "b@x.com", name: "B" }], project_name: "P", company_name: "Co" }, expect: "completed", ran: "email_each_vendor" },
    { label: "empty vendor list still completes", inputs: { vendors: [] }, expect: "completed", ran: "done" },
  ],
  "change-order-routing-by-tier": [
    { label: "high → pauses at PM approval", inputs: { tier: "high" }, expect: "paused" },
    { label: "high + approved → emails the high-value CO", inputs: { tier: "high" }, approvals: ["pm_approval"], expect: "completed", ran: "send_high", skipped: "send_mid" },
    { label: "mid → straight to client", inputs: { tier: "mid" }, expect: "completed", ran: "send_mid", skipped: "pm_approval" },
    { label: "low → straight to client", inputs: { tier: "low" }, expect: "completed", ran: "send_low", skipped: "send_mid" },
    { label: "unknown tier → all arms skip, run completes", inputs: { tier: "tbd" }, expect: "completed", skipped: "send_high" },
  ],
  "change-order-budget-triage": [
    { label: "major → pauses at PM approval", inputs: { is_major: true }, expect: "paused" },
    { label: "major + approved → emails the approved CO", inputs: { is_major: true }, approvals: ["pm_approval"], expect: "completed", ran: "send_major", skipped: "send_minor" },
    { label: "minor → straight to client", inputs: { is_major: false }, expect: "completed", ran: "send_minor", skipped: "pm_approval" },
  ],
  "lead-to-proposal": [
    { label: "pauses at review", expect: "paused" },
    { label: "approved → sends + succeeds", approvals: ["review_proposal"], expect: "completed", ran: "send_proposal" },
  ],
  "site-visit-to-assessment": [
    { label: "pauses at sign-off", expect: "paused" },
    { label: "signed off → emails assessment", approvals: ["supervisor_review"], expect: "completed" },
  ],
  "rfi-intake": [
    { label: "pauses at lead review", expect: "paused" },
    { label: "approved → sends response", approvals: ["lead_review"], expect: "completed" },
  ],
  "weekly-site-weather-briefing": [
    { label: "runs end to end (no gate)", expect: "completed" },
  ],
};

const ids = new Set<string>();
for (const t of WORKFLOW_TEMPLATES) {
  assert.ok(!ids.has(t.id), `duplicate template id ${t.id}`);
  ids.add(t.id);
  assert.ok(t.title && t.description && t.category, `${t.id}: missing card metadata`);
  assert.ok(["manual", "scheduled", "signal"].includes(t.triggerType), `${t.id}: bad triggerType ${t.triggerType}`);

  const { def, warnings, dropped } = normalizeWorkflowDef(t.def, { name: t.title });
  assert.equal(dropped.length, 0, `${t.id}: dropped steps ${JSON.stringify(dropped)}`);
  const repairs = warnings.filter((w) => REPAIR.test(w));
  assert.equal(repairs.length, 0, `${t.id}: needed repair ${JSON.stringify(repairs)}`);
  assert.ok(def.steps.length >= 3 && def.steps.length <= 7, `${t.id}: ${def.steps.length} steps (want 3-7)`);
  // every dependsOn ref points at a real step
  const stepIds = new Set(def.steps.map((s) => s.id));
  for (const s of def.steps) for (const d of s.dependsOn ?? []) assert.ok(stepIds.has(d), `${t.id}: ${s.id} → unknown dep ${d}`);

  const variants = VARIANTS[t.id];
  assert.ok(variants, `${t.id}: no run variants defined`);
  for (const v of variants!) {
    const r = await runWorkflow(def as WorkflowDef, { inputs: v.inputs ?? {}, handlers: mockHandlers, approvals: new Set(v.approvals ?? []) });
    assert.equal(r.status, v.expect, `${t.id} [${v.label}]: status ${r.status} ≠ ${v.expect}`);
    if (v.ran) assert.equal(r.steps.find((s) => s.id === v.ran)?.status, "completed", `${t.id} [${v.label}]: ${v.ran} should run`);
    if (v.skipped) assert.equal(r.steps.find((s) => s.id === v.skipped)?.status, "skipped", `${t.id} [${v.label}]: ${v.skipped} should skip`);
  }
}

console.log(`✓ workflow-templates.check: ${WORKFLOW_TEMPLATES.length} templates — normalize clean + run to expected terminals`);
