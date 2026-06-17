// AI workflow builder — turn an English description into a raw workflow definition via a forced
// Claude tool call. The model can only emit our tool shape (so no prose / no JSON-parsing ladder)
// and its `type` enum comes from the shared vocab (so it can't invent step types). The raw output
// still goes through the pure normalizer before persistence — this file is just generation.
import Anthropic from "@anthropic-ai/sdk";
import { STEP_VOCAB } from "@beamy/shared";

const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const STEP_ENUM = STEP_VOCAB.map((v) => v.type);

/** The forced output tool. The shape is loose (config is a free object) — the prompt teaches the
 *  per-type config semantics and the normalizer is the safety net; the enum hard-blocks bad types. */
const EMIT_WORKFLOW_TOOL: Anthropic.Tool = {
  name: "emit_workflow",
  description: "Emit the workflow as a DAG of typed steps.",
  input_schema: {
    type: "object",
    required: ["name", "steps"],
    properties: {
      name: { type: "string", description: "A short workflow name." },
      summary: { type: "string", description: "One sentence on what it does." },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "type"],
          properties: {
            id: { type: "string", description: "short snake_case, unique" },
            type: { type: "string", enum: STEP_ENUM },
            name: { type: "string" },
            dependsOn: { type: "array", items: { type: "string" }, description: "ids of upstream steps" },
            when: { type: "string", description: "optional gate, e.g. ${steps.<branchId>.output.onTrue}" },
            config: { type: "object", description: "type-specific config (see the system guidance)" },
            instructions: { type: "string", description: "human-facing guidance for human_approval/human_input" },
          },
        },
      },
    },
  },
};

export function buildWorkflowSystemPrompt(): string {
  const vocab = STEP_VOCAB.map((v) => {
    const req = v.config.filter((c) => c.required).map((c) => c.key);
    const opt = v.config.filter((c) => !c.required).map((c) => c.key);
    const parts = [`- ${v.type} (${v.title}): ${v.blurb}`];
    if (req.length) parts.push(`required config: ${req.join(", ")}`);
    if (opt.length) parts.push(`optional: ${opt.join(", ")}`);
    if (v.usesInstructions) parts.push(`put human guidance in the step's "instructions"`);
    if (v.outputs) parts.push(`outputs ${v.outputs}`);
    return parts.join(" · ");
  }).join("\n");

  return `You design workflows for a construction & design agency platform (Beamy), for NON-TECHNICAL users (project managers, crew leads, owners). Turn the user's description into a DAG of typed steps and emit exactly ONE emit_workflow tool call. If the request is vague, make reasonable assumptions and still produce a runnable draft — never ask questions.

STEP TYPES (use only these):
${vocab}

WIRING RULES:
- dependsOn is an array of upstream step ids forming a DAG. No cycles.
- Reference earlier data with \${steps.<id>.output.<field>} or \${inputs.<field>} — dot paths only (no operators, math, or filters).
- Conditionals (2-way): emit a "branch" step with config.condition (a yes/no value, e.g. \${steps.review.output.approved}); it outputs { value, onTrue, onFalse }. Gate the TRUE-path steps with when:"\${steps.<branchId>.output.onTrue}" and FALSE-path steps with "...onFalse".
- Multi-way routing (3+ paths): emit a "switch" step with config.value (the value to match, e.g. \${steps.classify.output.tier}) and config.cases — an array of { id, value, label? } where id is a short unique snake_case key and value is the literal it matches (case-insensitive). It outputs { value, matched, default, cases: { <id>: boolean } }. Gate each arm with when:"\${steps.<switchId>.output.cases.<id>}", and an optional catch-all arm (when nothing matched) with when:"\${steps.<switchId>.output.default}". The case id in the gate MUST exactly match the id in config.cases.
- Repeat an action over a list: emit a "loop" step with config.items (an array expression, e.g. \${steps.fetch.output.rows} or \${inputs.vendors}), config.bodyType (the action to run per item — one of ai_agent_task | http_call | notify | mcp_tool_call | db_operation | function_call), and config.bodyConfig (that action's OWN config object, where you reference the current item with \${item} / \${item.field} / \${itemIndex}). It outputs { results, count, succeeded, failed } — gate/aggregate downstream on \${steps.<loopId>.output.count}. Optional: config.continueOnFail (keep going past a failed item), config.maxIterations. A loop body is a SINGLE action — no human approvals, branches, or nested loops inside it.
- JOIN RULE (important): a step that should run after ANY branch/switch arm must dependsOn the BRANCH/SWITCH step itself — NOT the arms. Depending on the arms always skips it (some arm is always skipped).
- Use ids that are short, unique, snake_case. Prefer the simplest correct graph. End terminal paths with succeed (or fail for an error path).

EXAMPLES:
1) Lead → proposal: steps = draft (ai_agent_task, config.prompt "Draft a scope of work from the lead details") → approve (human_approval, dependsOn [draft], instructions "Approve the scope?") → send (notify, dependsOn [approve], config {channel:"email", to:"\${inputs.client_email}", subject:"Your proposal", body:"\${steps.draft.output.text}"}) → done (succeed, dependsOn [send]).
2) Conditional: check (branch, config.condition "\${steps.review.output.approved}") ; build (ai_agent_task, dependsOn [check], when "\${steps.check.output.onTrue}") ; reject (notify, dependsOn [check], when "\${steps.check.output.onFalse}", config {channel:"email", to:"...", subject:"Update", body:"..."}).
3) Multi-way: classify (switch, config.value "\${inputs.tier}", config.cases [{id:"high",value:"high",label:"High-value"},{id:"mid",value:"mid",label:"Mid-tier"},{id:"low",value:"low",label:"Low-value"}]) ; approve (human_approval, dependsOn [classify], when "\${steps.classify.output.cases.high}") ; send_mid (notify, dependsOn [classify], when "\${steps.classify.output.cases.mid}", config {channel:"email", to:"...", subject:"...", body:"..."}) ; send_low (notify, dependsOn [classify], when "\${steps.classify.output.cases.low}", config {...}).
4) For-each: email_all (loop, config.items "\${inputs.vendors}", config.bodyType "notify", config.bodyConfig {channel:"email", to:"\${item.email}", subject:"RFP for \${inputs.project}", body:"Hi \${item.name}, please see the attached RFP."}) ; it outputs { results, count, succeeded, failed }.`;
}

/** Generate a RAW workflow object from a description (still must pass normalizeWorkflowDef).
 *  `truncated` is true if the model hit the token limit mid-tool — the draft may be incomplete. */
export async function generateWorkflowDraft(prompt: string): Promise<{ input: unknown; truncated: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server");
  const anthropic = new Anthropic({ apiKey });
  const resp = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    system: buildWorkflowSystemPrompt(),
    tools: [EMIT_WORKFLOW_TOOL],
    tool_choice: { type: "tool", name: "emit_workflow", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: prompt }],
  });
  const block = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) throw new Error("the AI did not return a workflow");
  return { input: block.input, truncated: resp.stop_reason === "max_tokens" };
}
