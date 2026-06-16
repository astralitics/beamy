// The workflow DAG engine — vendored from the Astralitics catalog `workflows` module
// (astralitics-catalog/packages/modules/workflows/src/engine + capabilities/handlers).
// Dependency-injected: topologically orders steps, dispatches each by type, passes outputs
// forward, cascades skips, fails fast, and PAUSES at human gates. No db dependency — the
// persistence wrapper lives in the workflows router. Variable resolution (${...}) lives in
// @beamy/shared (a pure, import-free module) so the client editor and this engine resolve
// identically; it's imported below and re-exported for existing engine importers.
import { exprPaths, resolveVars, truthy, type VarScope } from "@beamy/shared";

// ── fixed step-type vocabulary ──────────────────────────────────
export const STEP_TYPES = [
  "mcp_tool_call", "function_call", "http_call", "ai_agent_task", "db_operation",
  "provision_resource", "call_workflow", "notify",
  "branch", "switch", "loop", "parallel", "wait_for_condition", "delay",
  "human_approval", "human_input",
  "succeed", "fail",
] as const;
export type StepType = (typeof STEP_TYPES)[number];
export const CORE_TYPES = new Set<StepType>([
  "branch", "switch", "succeed", "fail", "human_approval", "human_input", "delay",
]);
export function isStepType(t: string): t is StepType {
  return (STEP_TYPES as readonly string[]).includes(t);
}

// ── types ───────────────────────────────────────────────────────
export interface WorkflowStep {
  id: string;
  type: StepType;
  dependsOn?: string[];
  inputs?: Record<string, unknown>;
  config?: Record<string, unknown>;
  run?: (ctx: RunContext) => unknown | Promise<unknown>;
  skipUnless?: string;
  /** Conditional gate: a `${...}` expression; if it resolves falsy the step (and its dependents)
   *  skip. Powers IF — downstream steps gate on a branch's `${steps.<id>.output.onTrue|onFalse}`. */
  when?: string;
}
export interface WorkflowDef {
  name: string;
  steps: WorkflowStep[];
}
export interface RunContext {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  step: WorkflowStep;
}
export type StepHandler = (ctx: RunContext) => unknown | Promise<unknown>;
export type DefinitionResolver =
  | Record<string, WorkflowDef>
  | ((name: string) => WorkflowDef | undefined);
export interface RunOptions {
  inputs?: Record<string, unknown>;
  handlers?: Partial<Record<StepType, StepHandler>>;
  approvals?: Set<string>;
  definitions?: DefinitionResolver;
}
export type StepStatus = "completed" | "skipped" | "paused" | "failed";
export interface StepResult {
  id: string;
  type: StepType;
  status: StepStatus;
  output?: unknown;
  error?: string;
  childRun?: RunResult;
  /** Wall-clock timing of this step's execution, epoch ms. Omitted for skipped/paused steps. */
  startedAt?: number;
  finishedAt?: number;
}
export interface RunResult {
  status: "completed" | "paused" | "failed";
  steps: StepResult[];
  outputs: Record<string, unknown>;
  pausedStepId?: string;
}

/** The step ids referenced by a `when` gate (the `steps.<id>...` heads), restricted to real steps.
 *  These become implicit ordering edges so a gated step is always ordered AFTER the branch(es) it
 *  reads — the engine guarantees this regardless of how the definition was authored. */
function whenRefs(when: string | undefined, ids: Set<string>): string[] {
  if (when == null || when === "") return [];
  const out = new Set<string>();
  for (const body of exprPaths(when)) {
    const parts = body.split(".");
    if (parts[0] === "steps" && parts[1] && ids.has(parts[1])) out.add(parts[1]);
  }
  return [...out];
}

function topoOrder(steps: WorkflowStep[]): WorkflowStep[] {
  const ids = new Set(steps.map((s) => s.id));
  const byId = new Map(steps.map((s) => [s.id, s]));
  // Effective dependencies = explicit dependsOn ∪ steps referenced by the `when` gate (self-refs
  // excluded). This makes a `when` reference a real ordering edge — and feeds cycle detection.
  const depsOf = (s: WorkflowStep) => {
    const d = new Set(s.dependsOn ?? []);
    for (const w of whenRefs(s.when, ids)) if (w !== s.id) d.add(w);
    return [...d];
  };
  const edeps = new Map(steps.map((s) => [s.id, depsOf(s)]));
  const indeg = new Map(steps.map((s) => [s.id, edeps.get(s.id)!.length]));
  const queue = steps.filter((s) => edeps.get(s.id)!.length === 0).map((s) => s.id);
  const order: WorkflowStep[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const s of steps) {
      if (edeps.get(s.id)!.includes(id)) {
        indeg.set(s.id, indeg.get(s.id)! - 1);
        if (indeg.get(s.id) === 0) queue.push(s.id);
      }
    }
  }
  if (order.length !== steps.length) throw new Error("workflow has a dependency cycle");
  return order;
}

function resolveDefinition(resolver: DefinitionResolver | undefined, name: string) {
  if (!resolver) return undefined;
  return typeof resolver === "function" ? resolver(name) : resolver[name];
}

export async function runWorkflow(def: WorkflowDef, opts: RunOptions = {}): Promise<RunResult> {
  const { inputs = {}, handlers = {}, approvals = new Set<string>(), definitions } = opts;
  const order = topoOrder(def.steps);
  const outputs: Record<string, unknown> = {};
  const steps: StepResult[] = [];
  const statusById = new Map<string, StepStatus>();

  for (const rawStep of order) {
    // Centralized variable resolution: resolve ${inputs.x} / ${steps.id.output.y} in the step's
    // config, inputs, instructions, and `when` gate ONCE here against the current run scope, so
    // handlers receive already-resolved values and don't each re-implement resolution. This runs
    // BEFORE the skip decision because the `when` gate needs the resolved value to evaluate.
    // resolveVars is pure, so resolving a step that ends up skipped is harmless.
    const scope: VarScope = { inputs, outputs };
    const rawInstructions = (rawStep as { instructions?: unknown }).instructions;
    const step: WorkflowStep = {
      ...rawStep,
      ...(rawStep.config ? { config: resolveVars(rawStep.config, scope) } : {}),
      ...(rawStep.inputs ? { inputs: resolveVars(rawStep.inputs, scope) } : {}),
      ...(rawStep.when != null ? { when: resolveVars(rawStep.when, scope) as string } : {}),
    };
    if (typeof rawInstructions === "string") {
      (step as { instructions?: string }).instructions = resolveVars(rawInstructions, scope);
    }

    // Skip decision: a skipped dependency cascades; a falsy `when` gate skips (the IF off-path);
    // the legacy `skipUnless` step-id key is kept verbatim for back-compat.
    const deps = rawStep.dependsOn ?? [];
    const skipFromDep = deps.some((d) => statusById.get(d) === "skipped");
    // A gate exists iff `when` was authored (rawStep.when); it's evaluated on the RESOLVED value
    // (step.when), which may be undefined if it referenced an unreached step → truthy(undefined) =
    // false → skip. (Keying on step.when alone would wrongly treat "resolved to undefined" as "no
    // gate" and run the step.)
    const gated = rawStep.when != null && rawStep.when !== "";
    const skipFromGate = gated && !truthy(step.when);
    const skipFromLegacy = rawStep.skipUnless != null && !outputs[rawStep.skipUnless];
    if (skipFromDep || skipFromGate || skipFromLegacy) {
      statusById.set(rawStep.id, "skipped");
      steps.push({ id: rawStep.id, type: rawStep.type, status: "skipped" });
      continue;
    }

    const ctx: RunContext = { inputs, outputs, step };
    const startedAt = Date.now();
    try {
      if (step.type === "fail") {
        const msg = String((step.config?.reason as string) ?? "workflow failed");
        steps.push({ id: step.id, type: step.type, status: "failed", error: msg, startedAt, finishedAt: Date.now() });
        return { status: "failed", steps, outputs };
      }
      if (step.type === "human_approval" || step.type === "human_input") {
        if (!approvals.has(step.id)) {
          steps.push({ id: step.id, type: step.type, status: "paused" });
          return { status: "paused", steps, outputs, pausedStepId: step.id };
        }
        outputs[step.id] = { approved: true };
        statusById.set(step.id, "completed");
        steps.push({ id: step.id, type: step.type, status: "completed", output: outputs[step.id], startedAt, finishedAt: Date.now() });
        continue;
      }
      if (step.type === "delay" || step.type === "succeed") {
        outputs[step.id] = { ok: true };
        statusById.set(step.id, "completed");
        steps.push({ id: step.id, type: step.type, status: "completed", startedAt, finishedAt: Date.now() });
        if (step.type === "succeed") break;
        continue;
      }
      if (step.type === "call_workflow") {
        const childName = String((step.inputs?.workflow ?? step.config?.workflow) ?? "");
        const childDef = resolveDefinition(definitions, childName);
        if (!childDef) throw new Error(`call_workflow "${step.id}": no definition for "${childName}"`);
        const childInputs = (step.inputs?.inputs as Record<string, unknown>) ?? {};
        const child = await runWorkflow(childDef, { inputs: childInputs, handlers, approvals, definitions });
        if (child.status === "paused") {
          steps.push({ id: step.id, type: step.type, status: "paused", childRun: child });
          return { status: "paused", steps, outputs, pausedStepId: step.id };
        }
        if (child.status === "failed") {
          steps.push({ id: step.id, type: step.type, status: "failed", childRun: child, error: `child workflow "${childName}" failed`, startedAt, finishedAt: Date.now() });
          return { status: "failed", steps, outputs };
        }
        outputs[step.id] = child.outputs;
        statusById.set(step.id, "completed");
        steps.push({ id: step.id, type: step.type, status: "completed", output: child.outputs, childRun: child, startedAt, finishedAt: Date.now() });
        continue;
      }

      const fn = step.run ?? (handlers as Record<string, StepHandler | undefined>)[step.type];
      if (!fn) throw new Error(`no handler for step "${step.id}" of type "${step.type}"`);
      const output = await fn(ctx);
      outputs[step.id] = output;
      statusById.set(step.id, "completed");
      steps.push({ id: step.id, type: step.type, status: "completed", output, startedAt, finishedAt: Date.now() });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      statusById.set(step.id, "failed");
      steps.push({ id: step.id, type: step.type, status: "failed", error, startedAt, finishedAt: Date.now() });
      return { status: "failed", steps, outputs };
    }
  }
  return { status: "completed", steps, outputs };
}

// ── default mock handlers (real apps spread their own over these) ──
export const mockHandlers: Partial<Record<StepType, StepHandler>> = {
  ai_agent_task: (ctx) => ({ mock: true, kind: "ai_agent_task", step: ctx.step.id, summary: `mock AI result for ${ctx.step.id}` }),
  mcp_tool_call: (ctx) => ({ mock: true, tool: ctx.step.config?.tool ?? null, ok: true }),
  http_call: (ctx) => ({ mock: true, status: 200, url: ctx.step.config?.url ?? null }),
  db_operation: () => ({ mock: true, rows: 0 }),
  provision_resource: (ctx) => ({ mock: true, resourceId: `mock_${ctx.step.id}` }),
  notify: () => ({ mock: true, sent: true }),
  function_call: () => ({ mock: true, note: "no function bound" }),
  // Real conditional branch (a core control-flow type, pure): evaluate the resolved condition's
  // truthiness and emit named booleans so downstream steps can gate via
  // `when: ${steps.<id>.output.onTrue}` / `…onFalse`. config is already var-resolved by the loop.
  branch: (ctx) => {
    const value = truthy((ctx.step.config as Record<string, unknown> | undefined)?.condition);
    return { value, onTrue: value, onFalse: !value };
  },
  // N-way switch (a core control-flow type, pure). Matches the resolved `config.value` against each
  // case's `value` (case-insensitive, whitespace-trimmed string equality; numbers coerce to string),
  // FIRST match wins. Emits a per-case-id boolean map under `cases` (collision-safe: a case id can be
  // any name, even "value"/"default"), `matched` = the winning case id (or null), and `default` =
  // `!matched` (the catch-all). Downstream arms gate via `when: ${steps.<id>.output.cases.<caseId>}`
  // or `${steps.<id>.output.default}`. config is already var-resolved by the run loop.
  switch: (ctx) => {
    const cfg = (ctx.step.config as Record<string, unknown> | undefined) ?? {};
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const target = norm(cfg.value);
    const rawCases = Array.isArray(cfg.cases) ? (cfg.cases as unknown[]) : [];
    const cases: Record<string, boolean> = {};
    let matched: string | null = null;
    for (const c of rawCases) {
      if (!c || typeof c !== "object") continue;
      const id = String((c as Record<string, unknown>).id ?? "").trim();
      // hasOwnProperty (NOT `id in cases`): a case id that collides with an Object.prototype member
      // (e.g. "constructor", "toString") is inherited, so `in` would always be true and silently drop
      // the case. Assigning `cases[id]` then shadows the inherited member with an own key; downstream
      // gates read it via getPath, which is own-property-only (so an inherited member can't leak as a
      // truthy gate). ("__proto__" can't be set as a data key on a plain object — such a case simply
      // won't route; the UI's slugifier never produces it anyway.)
      if (!id || Object.prototype.hasOwnProperty.call(cases, id)) continue; // skip empty / duplicate ids
      const hit = matched == null && norm((c as Record<string, unknown>).value) === target;
      cases[id] = hit;
      if (hit) matched = id;
    }
    return { value: cfg.value ?? null, matched, default: matched == null, cases };
  },
};

// ── variable resolution: ${inputs.x} / ${steps.<id>.output.y} ──
// The implementation moved to @beamy/shared (shared with the client editor). Re-exported here so
// existing importers of `engine` keep working unchanged.
export { resolveExpr, resolveVars, type VarScope } from "@beamy/shared";
