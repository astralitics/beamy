// Step vocabulary — the canonical per-type config contract, shared by the AI-builder system prompt
// (teach Claude what to emit) and the normalizer (clamp config to the allowed keys). Kept beside the
// engine's STEP_TYPES so it can't drift; the web step-catalog adds render-only fields on top.

export interface VocabConfigKey {
  key: string;
  required: boolean;
  hint?: string;
}
export interface StepVocab {
  type: string;
  title: string;
  blurb: string;
  /** Declared config keys (the allowlist the normalizer clamps to). */
  config: VocabConfigKey[];
  /** Step-level `instructions` is where this type's human guidance / AI prompt lives. */
  usesInstructions?: boolean;
  /** What this step outputs, so the model wires real `${steps.<id>.output.<field>}` refs. */
  outputs?: string;
}

export const STEP_VOCAB: StepVocab[] = [
  { type: "ai_agent_task", title: "AI task", blurb: "Have Claude draft, analyze, or decide something.", config: [{ key: "prompt", required: true, hint: "what the AI should do; may reference ${steps.<id>.output.<field>}" }, { key: "model", required: false }, { key: "maxTokens", required: false }], outputs: "{ text }" },
  { type: "http_call", title: "Fetch data", blurb: "Call an external API or webhook.", config: [{ key: "method", required: true, hint: "GET|POST|PUT|PATCH|DELETE" }, { key: "url", required: true }, { key: "headers", required: false }, { key: "body", required: false }, { key: "connectionId", required: false, hint: "a stored Connection for auth" }], outputs: "{ status, ok, data }" },
  { type: "mcp_tool_call", title: "Tool call", blurb: "Run a connected tool (QuickBooks, Stripe, an MCP server).", config: [{ key: "tool", required: true, hint: "e.g. quickbooks.create_invoice" }] },
  { type: "db_operation", title: "Database", blurb: "Read or write the database.", config: [{ key: "operation", required: true }] },
  { type: "function_call", title: "Function", blurb: "Run a named server function.", config: [{ key: "fn", required: true }] },
  { type: "notify", title: "Notify", blurb: "Send a message (email implemented; sms/slack/in-app stubbed).", config: [{ key: "channel", required: true, hint: "email|sms|slack|in-app" }, { key: "to", required: true }, { key: "subject", required: false }, { key: "body", required: false }, { key: "from", required: false }, { key: "connectionId", required: false }] },
  { type: "call_workflow", title: "Run a workflow", blurb: "Invoke another workflow as a sub-run.", config: [{ key: "workflow", required: true, hint: "the other workflow's name" }] },
  { type: "branch", title: "Branch", blurb: "Split the flow: gate downstream steps on this condition's true/false path.", config: [{ key: "condition", required: true, hint: "a yes/no value, e.g. ${steps.review.output.approved}" }], outputs: "{ value, onTrue, onFalse }" },
  { type: "switch", title: "Switch", blurb: "Route to one of many paths: each case matches a value; an implicit default catches the rest.", config: [{ key: "value", required: true, hint: "the value to match, e.g. ${steps.classify.output.tier}" }, { key: "cases", required: true, hint: "array of { id, value, label? }; id is unique, first match wins (case-insensitive)" }], outputs: "{ value, matched, default, cases: { <caseId>: boolean } }" },
  { type: "loop", title: "For each", blurb: "Run one action once per item of a list, then continue with the collected results.", config: [{ key: "items", required: true, hint: "an array, e.g. ${steps.fetch.output.data} or ${inputs.vendors}" }, { key: "bodyType", required: true, hint: "the action to run per item: ai_agent_task | http_call | notify | mcp_tool_call | db_operation | function_call" }, { key: "bodyConfig", required: true, hint: "that action's config; reference the current item with ${item} / ${item.field} / ${itemIndex}" }, { key: "continueOnFail", required: false, hint: "true = keep going past a failed item (collect its error)" }, { key: "maxIterations", required: false, hint: "safety cap (default 1000, max 10000)" }], outputs: "{ results, count, succeeded, failed }" },
  { type: "delay", title: "Delay", blurb: "Wait, then continue.", config: [{ key: "duration", required: false, hint: "e.g. 30 days" }] },
  { type: "human_approval", title: "Approval", blurb: "Pause for a person to approve before continuing.", config: [], usesInstructions: true, outputs: "{ approved }" },
  { type: "human_input", title: "Human input", blurb: "Pause for a person to provide something.", config: [], usesInstructions: true },
  { type: "fail", title: "Fail", blurb: "End the workflow as failed.", config: [{ key: "reason", required: false }] },
  { type: "succeed", title: "Succeed", blurb: "End the workflow successfully.", config: [] },
];

const BY_TYPE = new Map(STEP_VOCAB.map((v) => [v.type, v]));
export function vocabFor(type: string): StepVocab | undefined {
  return BY_TYPE.get(type);
}

/** The action types valid as a `loop` body — single leaf actions only (NO human gates, control flow,
 *  or nested loops; those would break the loop's atomic single-pass model). The SINGLE source for
 *  both the engine's runtime guard and the UI's body picker, so they can't drift. */
export const LOOP_BODY_TYPES: readonly string[] = [
  "ai_agent_task", "http_call", "notify", "mcp_tool_call", "db_operation", "function_call",
];
