// normalizeWorkflowDef — the pure safety net between Claude's output and the engine. Takes raw
// (untrusted) JSON and returns a definition guaranteed to satisfy the engine's invariants: valid
// step types, unique ids, no dangling/self/cyclic edges, clamped config. Never throws on recoverable
// junk — it repairs and reports. Zero node/anthropic/db imports (testable + client-safe).
import { exprPaths } from "./expressions";
import { STEP_VOCAB, vocabFor } from "./workflow-vocab";

export interface NormalizedStep {
  id: string;
  type: string;
  name?: string;
  dependsOn?: string[];
  config?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  instructions?: string;
  when?: string;
}
export interface NormalizedDef {
  name: string;
  summary?: string;
  steps: NormalizedStep[];
}
export interface NormalizeResult {
  def: NormalizedDef;
  warnings: string[];
  dropped: string[];
}

const MAX_STEPS = 50;
const MAX_STR = 4000;
// Accept only EXECUTABLE types (the curated vocab — every one has an engine handler or special
// case). Gating here, not on the broader engine list, keeps "accepted ⟹ runnable" true (so a
// non-executable type like `loop`/`parallel` is dropped+reported rather than persisted to throw).
const STEP_SET = new Set<string>(STEP_VOCAB.map((v) => v.type));
const TOP_KEYS = new Set(["id", "type", "name", "dependsOn", "config", "inputs", "instructions", "when"]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clampStr = (v: unknown): string | undefined => (typeof v === "string" ? v.slice(0, MAX_STR) : undefined);

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

/** Step ids referenced by a `when` gate (the `steps.<id>` heads). */
function whenRefIds(when: string | undefined): string[] {
  if (!when) return [];
  const out = new Set<string>();
  for (const body of exprPaths(when)) {
    const parts = body.split(".");
    if (parts[0] === "steps" && parts[1]) out.add(parts[1]);
  }
  return [...out];
}

/** Effective deps = dependsOn ∪ when-references (self excluded) — mirrors the engine's ordering. */
function effectiveDeps(s: NormalizedStep, ids: Set<string>): string[] {
  const d = new Set((s.dependsOn ?? []).filter((x) => ids.has(x) && x !== s.id));
  for (const w of whenRefIds(s.when)) if (w !== s.id && ids.has(w)) d.add(w);
  return [...d];
}

function topoIds(steps: NormalizedStep[]): string[] {
  const ids = new Set(steps.map((s) => s.id));
  const indeg = new Map(steps.map((s) => [s.id, effectiveDeps(s, ids).length]));
  const queue = steps.filter((s) => indeg.get(s.id) === 0).map((s) => s.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of steps) {
      if (effectiveDeps(s, ids).includes(id)) {
        const n = indeg.get(s.id)! - 1;
        indeg.set(s.id, n);
        if (n === 0) queue.push(s.id);
      }
    }
  }
  return order;
}

/** Drop back-edges (then `when` gates) until the graph is acyclic — guarantees topoOrder succeeds.
 *  Removes ONE edge per pass, so it's bounded by the total edge count (a dense cycle needs many
 *  removals — a node-count bound is not enough); a final hard fallback strips remaining edges. */
function breakCycles(steps: NormalizedStep[], warnings: string[]): void {
  const totalEdges = steps.reduce((n, s) => n + (s.dependsOn?.length ?? 0) + whenRefIds(s.when).length, 0);
  for (let guard = totalEdges + steps.length + 1; guard > 0; guard--) {
    const ordered = new Set(topoIds(steps));
    if (ordered.size === steps.length) return;
    const stuck = steps.filter((s) => !ordered.has(s.id));
    const stuckIds = new Set(stuck.map((s) => s.id));
    let broke = false;
    for (const s of stuck) {
      const badDep = (s.dependsOn ?? []).find((d) => stuckIds.has(d));
      if (badDep) {
        s.dependsOn = (s.dependsOn ?? []).filter((d) => d !== badDep);
        warnings.push(`Removed edge ${badDep} → ${s.id} to break a cycle.`);
        broke = true;
        break;
      }
      if (s.when && whenRefIds(s.when).some((r) => stuckIds.has(r))) {
        s.when = undefined;
        warnings.push(`Cleared a gate on ${s.id} to break a cycle.`);
        broke = true;
        break;
      }
    }
    if (!broke) break;
  }
  // Safety net: if anything is somehow still cyclic, strip all edges on the stuck set → acyclic.
  const ordered = new Set(topoIds(steps));
  if (ordered.size !== steps.length) {
    for (const s of steps) if (!ordered.has(s.id)) { s.dependsOn = undefined; s.when = undefined; }
    warnings.push("Removed remaining dependencies to break a complex cycle.");
  }
}

export function normalizeWorkflowDef(raw: unknown, opts?: { name?: string }): NormalizeResult {
  const warnings: string[] = [];
  const dropped: string[] = [];
  const root = isObj(raw) ? raw : {};
  const name = (clampStr(root.name) || opts?.name || "Untitled workflow").slice(0, 160);
  const summary = clampStr(root.summary);
  const rawSteps = Array.isArray(root.steps) ? root.steps : [];
  if (!Array.isArray(root.steps)) warnings.push("The AI produced no steps array — starting from an empty canvas.");

  // ── pass 1: per-step clean (type + id), building an original-id → new-id remap ──
  const remap = new Map<string, string>();
  const usedIds = new Set<string>();
  const cleaned: NormalizedStep[] = [];
  let synth = 0;
  for (const rs of rawSteps.slice(0, MAX_STEPS)) {
    if (!isObj(rs)) { dropped.push("(non-object step)"); continue; }
    const type = typeof rs.type === "string" ? rs.type : "";
    if (!STEP_SET.has(type)) { dropped.push(`${rs.id ?? "?"} (unknown type "${type}")`); continue; }
    const origId = typeof rs.id === "string" ? rs.id : "";
    let id = slugify(origId);
    if (!id || usedIds.has(id)) {
      const base = id || type.replace(/[^a-z0-9]+/g, "_");
      do { id = `${base}_${++synth}`; } while (usedIds.has(id));
    }
    usedIds.add(id);
    if (origId) remap.set(origId, id);
    cleaned.push({ id, type, name: clampStr(rs.name) });
    // carry the still-raw fields for later passes (config/deps/when/instructions/inputs)
    Object.assign(cleaned[cleaned.length - 1]!, { _raw: rs });
  }
  if (rawSteps.length > MAX_STEPS) warnings.push(`Kept the first ${MAX_STEPS} steps (the AI produced ${rawSteps.length}).`);

  const idSet = new Set(cleaned.map((s) => s.id));
  const remapRef = (ref: string) => remap.get(ref) ?? (idSet.has(ref) ? ref : ref);

  // ── pass 2: config clamp + edge repair, using the remap ──
  for (const s of cleaned) {
    const rs = (s as { _raw?: Record<string, unknown> })._raw ?? {};
    delete (s as { _raw?: unknown })._raw;
    s.name = s.name || vocabFor(s.type)?.title;
    if (typeof rs.instructions === "string") s.instructions = clampStr(rs.instructions);

    // config: object only, clamped to the type's allowlist (keep unknown-vocab types' config as-is)
    if (rs.config !== undefined) {
      const cfg = isObj(rs.config) ? rs.config : {};
      if (!isObj(rs.config)) warnings.push(`${s.id}: ignored a non-object config.`);
      const vocab = vocabFor(s.type);
      const out: Record<string, unknown> = {};
      const allow = vocab ? new Set(vocab.config.map((c) => c.key)) : null;
      for (const [k, v] of Object.entries(cfg)) {
        if (allow && !allow.has(k)) continue; // strip hallucinated keys
        out[k] = typeof v === "string" ? v.slice(0, MAX_STR) : v;
      }
      if (s.type === "http_call" && out.method !== undefined) {
        const m = String(out.method).toUpperCase();
        out.method = HTTP_METHODS.has(m) ? m : "GET";
      }
      if (Object.keys(out).length) s.config = out;
      // warn (don't drop) on missing required config — the human fills it before publishing
      const missing = (vocab?.config ?? []).filter((c) => c.required && (out[c.key] == null || out[c.key] === ""));
      if (missing.length) warnings.push(`${s.id}: missing ${missing.map((c) => c.key).join(", ")} — fill it before publishing.`);
    }
    if (isObj(rs.inputs)) s.inputs = rs.inputs;

    // dependsOn: string[] of real ids (remapped), no self/dangling
    if (rs.dependsOn !== undefined) {
      const arr = Array.isArray(rs.dependsOn) ? rs.dependsOn : [];
      if (!Array.isArray(rs.dependsOn)) warnings.push(`${s.id}: ignored a non-array dependsOn.`);
      const deps: string[] = [];
      for (const d of arr) {
        if (typeof d !== "string") continue;
        const mapped = remapRef(d);
        if (mapped === s.id) { warnings.push(`${s.id}: dropped a self-dependency.`); continue; }
        if (!idSet.has(mapped)) { warnings.push(`${s.id}: dropped dependency on unknown step "${d}".`); continue; }
        if (!deps.includes(mapped)) deps.push(mapped);
      }
      if (deps.length) s.dependsOn = deps;
    }

    // when: rewrite each ${steps.<head>...} head through the remap exactly ONCE (a single-pass token
    // rewrite — chained string-replace could re-process an already-rewritten id when slugs collide
    // and silently point the gate at the wrong step). Clear if it references a step that's gone.
    if (typeof rs.when === "string" && rs.when.trim()) {
      const w = rs.when.replace(/(\$\{steps\.)([^.}]+)/g, (_m, pre: string, ref: string) => pre + (remap.get(ref) ?? ref));
      const bad = whenRefIds(w).find((r) => !idSet.has(r));
      if (bad) warnings.push(`${s.id}: cleared a gate referencing unknown step "${bad}".`);
      else s.when = clampStr(w);
    }
  }

  // ── pass 3: break cycles so the engine's topoOrder can never throw ──
  breakCycles(cleaned, warnings);

  if (cleaned.length === 0) warnings.push("No runnable steps — the canvas is a starting point you can build on.");
  return { def: { name, ...(summary ? { summary } : {}), steps: cleaned }, warnings, dropped };
}
