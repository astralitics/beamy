// Pure verification evaluator — vendored from the Astralitics catalog `workflow-studio` module
// (src/verification/evaluate.ts). The catalog of kinds + the StepOutputDef/OutputVerification
// types live in @beamy/shared (shared with the client step editor); this is the server-side
// evaluation logic.
import type { OutputVerification, StepOutputDef } from "@beamy/shared";

export type { StepOutputDef, OutputVerification } from "@beamy/shared";

export type VerificationResultStatus = "pass" | "fail" | "unsupported";
export interface VerificationResult {
  outputId: string;
  kind: string;
  status: VerificationResultStatus;
  message?: string;
}

export function evaluateVerification(
  output: StepOutputDef,
  verification: OutputVerification,
  value: unknown,
): VerificationResult {
  const params = (verification.params ?? {}) as Record<string, unknown>;
  const base = { outputId: output.id, kind: verification.kind };
  switch (verification.kind) {
    case "was_uploaded":
    case "not_null":
    case "was_emitted":
    case "exists":
      return value != null && value !== "" ? { ...base, status: "pass" } : { ...base, status: "fail", message: "Missing value" };
    case "mime_type": {
      const f = value as { type?: string } | undefined;
      const allowed = (params.allowed as string[]) ?? [];
      if (!f?.type) return { ...base, status: "fail", message: "No file" };
      return allowed.includes(f.type) ? { ...base, status: "pass" } : { ...base, status: "fail", message: `mime "${f.type}" not allowed` };
    }
    case "min_words": {
      const wc = countWords(typeof value === "string" ? value : "");
      const n = (params.n as number) ?? 0;
      return wc >= n ? { ...base, status: "pass" } : { ...base, status: "fail", message: `${wc} words, need ≥ ${n}` };
    }
    case "max_words": {
      const wc = countWords(typeof value === "string" ? value : "");
      const n = (params.n as number) ?? 0;
      return wc <= n ? { ...base, status: "pass" } : { ...base, status: "fail", message: `${wc} words, max ${n}` };
    }
    case "contains_section": {
      const s = (typeof value === "string" ? value : "").toLowerCase();
      const sections = (params.sections as string[]) ?? [];
      const missing = sections.filter((sec) => !s.includes(sec.toLowerCase()));
      return missing.length === 0 ? { ...base, status: "pass" } : { ...base, status: "fail", message: `missing: ${missing.join(", ")}` };
    }
    case "no_pii": {
      const s = typeof value === "string" ? value : "";
      return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s) ? { ...base, status: "fail", message: "Possible PII" } : { ...base, status: "pass" };
    }
    case "min_count": {
      const arr = Array.isArray(value) ? value : [];
      const n = (params.n as number) ?? 0;
      return arr.length >= n ? { ...base, status: "pass" } : { ...base, status: "fail", message: `${arr.length} items, need ≥ ${n}` };
    }
    case "max_count": {
      const arr = Array.isArray(value) ? value : [];
      const n = (params.n as number) ?? 0;
      return arr.length <= n ? { ...base, status: "pass" } : { ...base, status: "fail", message: `${arr.length} items, max ${n}` };
    }
    case "no_duplicates": {
      const arr = Array.isArray(value) ? value : [];
      const seen = new Set(arr.map((x) => JSON.stringify(x)));
      return seen.size === arr.length ? { ...base, status: "pass" } : { ...base, status: "fail", message: "duplicate items" };
    }
    case "equals":
      return String(value) === String(params.value ?? "") ? { ...base, status: "pass" } : { ...base, status: "fail", message: `got ${value}` };
    case "not_equals":
      return String(value) !== String(params.value ?? "") ? { ...base, status: "pass" } : { ...base, status: "fail", message: "value matched" };
    case "range_min": {
      const v = toNumber(value);
      const n = (params.n as number) ?? 0;
      if (v == null) return { ...base, status: "fail", message: "not a number" };
      return v >= n ? { ...base, status: "pass" } : { ...base, status: "fail", message: `${v} < ${n}` };
    }
    case "range_max": {
      const v = toNumber(value);
      const n = (params.n as number) ?? 0;
      if (v == null) return { ...base, status: "fail", message: "not a number" };
      return v <= n ? { ...base, status: "pass" } : { ...base, status: "fail", message: `${v} > ${n}` };
    }
    case "was_approved": {
      const d = value as { outcome?: string } | undefined;
      return d?.outcome === "approved" ? { ...base, status: "pass" } : { ...base, status: "fail", message: `outcome: ${d?.outcome ?? "∅"}` };
    }
    case "has_reason": {
      const d = value as { outcome?: string; reason?: string } | undefined;
      if (!d) return { ...base, status: "fail", message: "No decision" };
      if (d.outcome === "approved") return { ...base, status: "pass" };
      return d.reason && d.reason.trim().length > 0 ? { ...base, status: "pass" } : { ...base, status: "fail", message: "Rejection needs a reason" };
    }
    // file-set checks (a photo-set / file output is an array of file metadata)
    case "all_mime_type": {
      const arr = Array.isArray(value) ? (value as { type?: string }[]) : [];
      const allowed = (params.allowed as string[]) ?? [];
      if (arr.length === 0) return { ...base, status: "fail", message: "No files" };
      const bad = arr.filter((f) => !allowed.includes(f?.type ?? ""));
      return bad.length === 0
        ? { ...base, status: "pass" }
        : { ...base, status: "fail", message: `${bad.length} file(s) not ${allowed.map((a) => a.replace("image/", "")).join("/")}` };
    }
    case "all_size_range": {
      const arr = Array.isArray(value) ? (value as { size?: number }[]) : [];
      if (arr.length === 0) return { ...base, status: "fail", message: "No files" };
      const min = params.min_bytes as number | undefined;
      const max = params.max_bytes as number | undefined;
      const bad = arr.filter((f) => (max != null && (f?.size ?? 0) > max) || (min != null && (f?.size ?? 0) < min));
      return bad.length === 0
        ? { ...base, status: "pass" }
        : { ...base, status: "fail", message: `${bad.length} file(s) out of size range` };
    }

    default:
      return { ...base, status: "unsupported", message: "Not evaluated yet" };
  }
}

export function evaluateVerifications(outputs: StepOutputDef[], values: Record<string, unknown>): VerificationResult[] {
  const results: VerificationResult[] = [];
  for (const out of outputs) {
    const value = values[out.id];
    for (const v of out.verifications) results.push(evaluateVerification(out, v, value));
  }
  return results;
}

export function hasBlockingFailure(outputs: StepOutputDef[], results: VerificationResult[]): boolean {
  for (const out of outputs) {
    if (!out.required) continue;
    if (results.some((r) => r.outputId === out.id && r.status === "fail")) return true;
  }
  return false;
}

function countWords(s: string): number {
  return s.trim().length === 0 ? 0 : s.trim().split(/\s+/).length;
}
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (typeof v === "object" && v !== null && "value" in v) {
    const inner = (v as { value: unknown }).value;
    if (typeof inner === "number") return inner;
  }
  return null;
}
