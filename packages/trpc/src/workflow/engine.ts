// The workflow DAG engine — vendored from the Astralitics catalog `workflows` module
// (astralitics-catalog/packages/modules/workflows/src/engine + capabilities/handlers).
// Pure + dependency-injected: topologically orders steps, dispatches each by type, passes
// outputs forward, cascades skips, fails fast, and PAUSES at human gates. No db dependency —
// the persistence wrapper lives in the workflows router.

// ── fixed step-type vocabulary ──────────────────────────────────
export const STEP_TYPES = [
  "mcp_tool_call", "function_call", "http_call", "ai_agent_task", "db_operation",
  "provision_resource", "call_workflow", "notify",
  "branch", "loop", "parallel", "wait_for_condition", "delay",
  "human_approval", "human_input",
  "succeed", "fail",
] as const;
export type StepType = (typeof STEP_TYPES)[number];
export const CORE_TYPES = new Set<StepType>([
  "branch", "succeed", "fail", "human_approval", "human_input", "delay",
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
}
export interface RunResult {
  status: "completed" | "paused" | "failed";
  steps: StepResult[];
  outputs: Record<string, unknown>;
  pausedStepId?: string;
}

function topoOrder(steps: WorkflowStep[]): WorkflowStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const indeg = new Map(steps.map((s) => [s.id, (s.dependsOn ?? []).length]));
  const queue = steps.filter((s) => (s.dependsOn ?? []).length === 0).map((s) => s.id);
  const order: WorkflowStep[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const s of steps) {
      if ((s.dependsOn ?? []).includes(id)) {
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

  for (const step of order) {
    const deps = step.dependsOn ?? [];
    const skipFromDep = deps.some((d) => statusById.get(d) === "skipped");
    const skipFromBranch = step.skipUnless != null && !outputs[step.skipUnless];
    if (skipFromDep || skipFromBranch) {
      statusById.set(step.id, "skipped");
      steps.push({ id: step.id, type: step.type, status: "skipped" });
      continue;
    }

    const ctx: RunContext = { inputs, outputs, step };
    try {
      if (step.type === "fail") {
        const msg = String((step.config?.reason as string) ?? "workflow failed");
        steps.push({ id: step.id, type: step.type, status: "failed", error: msg });
        return { status: "failed", steps, outputs };
      }
      if (step.type === "human_approval" || step.type === "human_input") {
        if (!approvals.has(step.id)) {
          steps.push({ id: step.id, type: step.type, status: "paused" });
          return { status: "paused", steps, outputs, pausedStepId: step.id };
        }
        outputs[step.id] = { approved: true };
        statusById.set(step.id, "completed");
        steps.push({ id: step.id, type: step.type, status: "completed", output: outputs[step.id] });
        continue;
      }
      if (step.type === "delay" || step.type === "succeed") {
        outputs[step.id] = { ok: true };
        statusById.set(step.id, "completed");
        steps.push({ id: step.id, type: step.type, status: "completed" });
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
          steps.push({ id: step.id, type: step.type, status: "failed", childRun: child, error: `child workflow "${childName}" failed` });
          return { status: "failed", steps, outputs };
        }
        outputs[step.id] = child.outputs;
        statusById.set(step.id, "completed");
        steps.push({ id: step.id, type: step.type, status: "completed", output: child.outputs, childRun: child });
        continue;
      }

      const fn = step.run ?? (handlers as Record<string, StepHandler | undefined>)[step.type];
      if (!fn) throw new Error(`no handler for step "${step.id}" of type "${step.type}"`);
      const output = await fn(ctx);
      outputs[step.id] = output;
      statusById.set(step.id, "completed");
      steps.push({ id: step.id, type: step.type, status: "completed", output });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      statusById.set(step.id, "failed");
      steps.push({ id: step.id, type: step.type, status: "failed", error });
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
  branch: (ctx) => (ctx.step.config?.value ?? true) as unknown,
};

// ── variable resolution: ${inputs.x} / ${steps.<id>.output.y} ──
export interface VarScope {
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}
const TOKEN = /\$\{([^}]+)\}/g;
const EXACT = /^\$\{([^}]+)\}$/;
function getPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
export function resolveExpr(expr: string, scope: VarScope): unknown {
  const parts = expr.trim().split(".").filter(Boolean);
  if (parts.length === 0) return undefined;
  const [head, ...rest] = parts;
  if (head === "inputs") return getPath(scope.inputs ?? {}, rest);
  if (head === "steps") {
    const stepId = rest[0];
    if (stepId == null) return undefined;
    const stepOutput = (scope.outputs ?? {})[stepId];
    const tail = rest[1] === "output" ? rest.slice(2) : rest.slice(1);
    return getPath(stepOutput, tail);
  }
  return undefined;
}
export function resolveVars<T>(value: T, scope: VarScope): T {
  if (typeof value === "string") {
    const exact = value.match(EXACT);
    if (exact) return resolveExpr(exact[1] ?? "", scope) as T;
    return value.replace(TOKEN, (_m, expr) => {
      const v = resolveExpr(expr, scope);
      if (v == null) return "";
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    }) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolveVars(v, scope)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveVars(v, scope);
    return out as T;
  }
  return value;
}
