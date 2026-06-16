// Workflow Studio — shared domain types + the output-verification catalog. Adopted from the
// Astralitics catalog `workflow-studio` module. Consumed by the server (the evaluator in
// @beamy/trpc) and the client (the step editor in @beamy/web), so it lives in @beamy/shared.

export interface OutputVerification {
  kind: string;
  params?: Record<string, unknown>;
}
export interface StepOutputDef {
  id: string;
  name: string;
  type: string;
  required: boolean;
  verifications: OutputVerification[];
}
export interface StepInputDef {
  name: string;
  type: string;
  from?: { stepId: string; outputId: string };
}

/** What a step output IS — drives which verifications + capture UI apply. */
export const WORKFLOW_OUTPUT_TYPES = [
  "file", "text", "structured", "list", "scalar", "measurement",
  "entity-ref", "decision", "signature", "photo-set", "event",
] as const;
export type WorkflowOutputType = (typeof WORKFLOW_OUTPUT_TYPES)[number];

export interface VerificationParamSpec {
  key: string;
  label: string;
  type: "string" | "number" | "string[]" | "regex";
  required?: boolean;
}
export interface VerificationKind {
  id: string;
  label: string;
  appliesTo: WorkflowOutputType[];
  params: VerificationParamSpec[];
  summary?: string;
}

export const VERIFICATION_CATALOG: VerificationKind[] = [
  { id: "not_null", label: "Is present", appliesTo: ["text", "structured", "scalar", "measurement", "entity-ref", "decision", "signature"], params: [] },
  { id: "was_uploaded", label: "Was uploaded", appliesTo: ["file", "photo-set"], params: [] },
  { id: "was_emitted", label: "Was emitted", appliesTo: ["event"], params: [] },
  { id: "exists", label: "Entity exists", appliesTo: ["entity-ref"], params: [] },
  { id: "mime_type", label: "MIME type in list", appliesTo: ["file"], params: [{ key: "allowed", label: "Allowed MIME types", type: "string[]", required: true }] },
  { id: "size_range", label: "Size in range", appliesTo: ["file"], params: [{ key: "min_bytes", label: "Min bytes", type: "number" }, { key: "max_bytes", label: "Max bytes", type: "number" }] },
  { id: "name_pattern", label: "Filename matches", appliesTo: ["file"], params: [{ key: "regex", label: "Regex", type: "regex", required: true }] },
  { id: "csv_required_columns", label: "CSV has columns", appliesTo: ["file"], params: [{ key: "columns", label: "Required columns", type: "string[]", required: true }] },
  { id: "csv_min_rows", label: "CSV min rows", appliesTo: ["file"], params: [{ key: "n", label: "Min rows", type: "number", required: true }] },
  { id: "min_words", label: "Min words", appliesTo: ["text"], params: [{ key: "n", label: "Min words", type: "number", required: true }] },
  { id: "max_words", label: "Max words", appliesTo: ["text"], params: [{ key: "n", label: "Max words", type: "number", required: true }] },
  { id: "contains_section", label: "Contains sections", appliesTo: ["text"], params: [{ key: "sections", label: "Required sections", type: "string[]", required: true }] },
  { id: "no_pii", label: "No PII", appliesTo: ["text"], params: [] },
  { id: "all_mime_type", label: "All files are format", appliesTo: ["photo-set", "file"], params: [{ key: "allowed", label: "Allowed MIME types", type: "string[]", required: true }] },
  { id: "all_size_range", label: "All files within size", appliesTo: ["photo-set", "file"], params: [{ key: "max_bytes", label: "Max bytes", type: "number" }, { key: "min_bytes", label: "Min bytes", type: "number" }] },
  { id: "min_count", label: "Min count", appliesTo: ["list", "photo-set"], params: [{ key: "n", label: "Min items", type: "number", required: true }] },
  { id: "max_count", label: "Max count", appliesTo: ["list", "photo-set"], params: [{ key: "n", label: "Max items", type: "number", required: true }] },
  { id: "no_duplicates", label: "No duplicates", appliesTo: ["list"], params: [] },
  { id: "equals", label: "Equals", appliesTo: ["scalar", "entity-ref"], params: [{ key: "value", label: "Expected", type: "string", required: true }] },
  { id: "not_equals", label: "Not equals", appliesTo: ["scalar"], params: [{ key: "value", label: "Disallowed", type: "string", required: true }] },
  { id: "range_min", label: "At least", appliesTo: ["scalar", "measurement"], params: [{ key: "n", label: "Min", type: "number", required: true }] },
  { id: "range_max", label: "At most", appliesTo: ["scalar", "measurement"], params: [{ key: "n", label: "Max", type: "number", required: true }] },
  { id: "pattern_match_scalar", label: "Matches pattern", appliesTo: ["scalar", "text"], params: [{ key: "regex", label: "Regex", type: "regex", required: true }] },
  { id: "unit_is", label: "Unit is", appliesTo: ["measurement"], params: [{ key: "unit", label: "Unit", type: "string", required: true }] },
  { id: "was_approved", label: "Was approved", appliesTo: ["decision"], params: [] },
  { id: "has_reason", label: "Has reason if rejected", appliesTo: ["decision"], params: [] },
  { id: "approver_role", label: "Approver role in list", appliesTo: ["signature", "decision"], params: [{ key: "roles", label: "Allowed roles", type: "string[]", required: true }] },
  { id: "max_age_minutes", label: "Signed within N minutes", appliesTo: ["signature"], params: [{ key: "minutes", label: "Max age (min)", type: "number", required: true }] },
];

export function verificationsFor(outputType: WorkflowOutputType): VerificationKind[] {
  return VERIFICATION_CATALOG.filter((v) => v.appliesTo.includes(outputType));
}

/** The canonical step-type vocabulary (mirrors the workflows engine STEP_TYPES). */
export const WORKFLOW_STEP_TYPES = [
  "mcp_tool_call", "function_call", "http_call", "ai_agent_task", "db_operation",
  "provision_resource", "call_workflow", "notify",
  "branch", "switch", "loop", "parallel", "wait_for_condition", "delay",
  "human_approval", "human_input",
  "succeed", "fail",
] as const;
export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];
