// Workflow expression resolution — the SINGLE source of truth, shared by the server engine
// (@beamy/trpc) and the client expression editor (apps/web) so a `${...}` resolves byte-for-byte
// the same in the builder's live preview as it does at runtime. Pure: zero imports, no node deps.
//
// Grammar (dot-path lookup only — no filters/functions/JS; that runtime is deliberately out of
// scope): `${inputs.x}` and `${steps.<id>.output.<field>}` (the `.output` segment is optional).

export interface VarScope {
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  /** Inside a `loop` body only: the current item and its 0-based index, for `${item}` /
   *  `${item.field}` / `${itemIndex}`. Absent outside a loop (those refs then resolve to undefined). */
  item?: unknown;
  itemIndex?: number;
}

/** Matches every `${...}` token in a string. Has the /g flag (stateful lastIndex) — only use it
 *  via String.replace, which resets lastIndex. For tests/scans use the fresh regexes below. */
const TOKEN = /\$\{([^}]+)\}/g;
/** Matches a string that is PURELY one `${...}` expression. */
const EXACT = /^\$\{([^}]+)\}$/;

function getPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur == null) return undefined;
    // Only traverse OWN properties of objects/arrays — never inherited ones, so a path like
    // `…cases.toString` can't resolve to Object.prototype.toString and read as truthy in a gate.
    // Primitives (string/number) keep their normal member access (e.g. a string's `.length`).
    if (typeof cur === "object" && !Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Resolve a single expression body (the text inside `${...}`) against the scope. */
export function resolveExpr(expr: string, scope: VarScope): unknown {
  const parts = expr.trim().split(".").filter(Boolean);
  if (parts.length === 0) return undefined;
  const [head, ...rest] = parts;
  if (head === "inputs") return getPath(scope.inputs ?? {}, rest);
  if (head === "item") return getPath(scope.item, rest);
  if (head === "itemIndex") return scope.itemIndex;
  if (head === "steps") {
    const stepId = rest[0];
    if (stepId == null) return undefined;
    const stepOutput = (scope.outputs ?? {})[stepId];
    const tail = rest[1] === "output" ? rest.slice(2) : rest.slice(1);
    return getPath(stepOutput, tail);
  }
  return undefined;
}

/** Resolve every `${...}` in a value (recursing through arrays/objects). A string that is exactly
 *  one expression returns the resolved VALUE (preserving type); otherwise tokens are interpolated
 *  into the string (objects JSON-stringified, null/undefined → ""). */
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

/** True if the whole string is a single `${...}` expression. (Fresh non-/g regex — reset-safe.) */
export function isExpr(s: string): boolean {
  return /^\$\{[^}]+\}$/.test(s);
}

/** The expression bodies inside every `${...}` token in a string (e.g. ["steps.a.output.text"]). */
export function exprPaths(s: string): string[] {
  const matches = s.match(/\$\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -1).trim());
}

/**
 * Coerce a (already-resolved) value to a boolean for control flow — used identically by the engine's
 * per-step `when` gate, the `branch` handler's condition, and the client's "Run on" preview, so
 * authoring and runtime agree. JS-aligned, with string ergonomics for non-technical / interpolated
 * inputs: "", "false", "0", "no", "off" (any case) → false; any other non-empty string → true.
 * Note: an empty array is false but an empty object is true.
 */
export function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return !(s === "" || s === "false" || s === "0" || s === "no" || s === "off");
  }
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true; // non-null object
}
