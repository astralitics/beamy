import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlock,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  chatMessages,
  clients,
  getDb,
  projects,
} from "@beamy/db";
import {
  chatListInputSchema,
  chatResetInputSchema,
  chatSendInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";
import { CHAT_TOOLS, runTool, type ToolContext } from "./chat-tools";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const MAX_OUTPUT_TOKENS = 1024;
/** Cap on tool-loop iterations per user turn. */
const MAX_TOOL_ITERATIONS = 6;

/**
 * `chat` router — the project-scoped assistant.
 *
 * v2 mechanics: **tool use enabled.** The system prompt is now slim
 * (project facts + a hint about what tools exist); the assistant pulls
 * the rest via tool calls. This unlocks recall queries — "what fridge
 * in the kitchen?" — that v1's prompt-stuffing couldn't answer (assets
 * weren't in the prompt).
 *
 * Loop: call Anthropic with tools → if stop_reason='tool_use',
 * execute each tool_use block → append tool_result block(s) as a user
 * message → loop. Bail after MAX_TOOL_ITERATIONS to prevent runaway
 * cost.
 *
 * Persistence: only the user message and the FINAL assistant text
 * response land in chat_messages. Intermediate tool calls are
 * implementation detail. Token usage is summed across all iterations.
 */
export const chatRouter = router({
  list: orgScopedProcedure
    .input(chatListInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const ownsProject = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      if (!ownsProject[0]) throw new TRPCError({ code: "NOT_FOUND" });

      return await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.projectId, input.projectId),
            eq(chatMessages.orgId, ctx.orgId),
          ),
        )
        .orderBy(asc(chatMessages.createdAt))
        .limit(input.limit);
    }),

  send: orgScopedProcedure
    .input(chatSendInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "ANTHROPIC_API_KEY is not set on the server. Add it to .env and restart.",
        });
      }

      const projectRow = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      if (!projectRow[0]) throw new TRPCError({ code: "NOT_FOUND" });

      // Build a slim system prompt — project facts + tool guidance.
      // Tools fetch the deeper data (assets, materials, specs, bills).
      const systemPrompt = await buildSystemPrompt(
        db,
        ctx.orgId,
        projectRow[0],
      );

      // Past conversation history as plain user/assistant text. Tool
      // calls from earlier turns are not replayed — if the assistant
      // needs that data again, it calls the tool again. (Trade-off:
      // more API tokens; simpler state.)
      const history = await db
        .select({
          role: chatMessages.role,
          content: chatMessages.content,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.projectId, input.projectId),
            eq(chatMessages.orgId, ctx.orgId),
          ),
        )
        .orderBy(asc(chatMessages.createdAt))
        .limit(40);

      // Persist the user message before calling the LLM so a failed
      // turn isn't silently lost.
      const [userRow] = await db
        .insert(chatMessages)
        .values({
          orgId: ctx.orgId,
          projectId: input.projectId,
          role: "user",
          content: input.content,
          createdBy: ctx.actor,
        })
        .returning();
      if (!userRow) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const anthropic = new Anthropic({ apiKey });
      const toolCtx: ToolContext = {
        orgId: ctx.orgId,
        projectId: input.projectId,
      };

      // Running message array — grows as we loop on tool use.
      const messages: MessageParam[] = [
        ...history.map<MessageParam>((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: input.content },
      ];

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const toolsUsed: string[] = [];
      let finalText = "";
      let finalModel = DEFAULT_MODEL;

      try {
        for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
          const response = await anthropic.messages.create({
            model: DEFAULT_MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: systemPrompt,
            tools: CHAT_TOOLS,
            messages,
          });

          totalInputTokens += response.usage.input_tokens;
          totalOutputTokens += response.usage.output_tokens;
          finalModel = response.model;

          // Append the assistant's full response (text + tool_use
          // blocks) to the message array — required by the API for
          // tool_result reconciliation on the next turn.
          messages.push({ role: "assistant", content: response.content });

          if (response.stop_reason !== "tool_use") {
            // Final answer. Concatenate any text blocks.
            finalText = response.content
              .flatMap((c: ContentBlock) =>
                c.type === "text" ? [c.text] : [],
              )
              .join("\n")
              .trim();
            break;
          }

          // Execute every tool_use block in this response, then send
          // the results back as a single user message containing
          // tool_result blocks (per the Anthropic API contract).
          const toolResults: ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            toolsUsed.push(block.name);
            try {
              const result = await runTool(
                block.name,
                (block.input ?? {}) as Record<string, unknown>,
                toolCtx,
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(result),
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Error: ${msg}`,
                is_error: true,
              });
            }
          }
          messages.push({ role: "user", content: toolResults });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Anthropic API error: ${msg}`,
        });
      }

      if (!finalText) {
        finalText =
          "(I hit the tool-loop cap without converging on an answer. Try rephrasing the question.)";
      }

      const [assistantRow] = await db
        .insert(chatMessages)
        .values({
          orgId: ctx.orgId,
          projectId: input.projectId,
          role: "assistant",
          content: finalText,
          model: finalModel,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          createdBy: "agent:claude",
        })
        .returning();
      if (!assistantRow) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      await db.insert(auditLog).values({
        orgId: ctx.orgId,
        actor: ctx.actor,
        action: "chat.turn",
        resourceType: "project",
        resourceId: input.projectId,
        payload: {
          model: finalModel,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          contentLength: input.content.length,
          toolsUsed,
        },
      });

      return { user: userRow, assistant: assistantRow, toolsUsed };
    }),

  reset: orgScopedProcedure
    .input(chatResetInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const ownsProject = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.orgId, ctx.orgId),
          ),
        )
        .limit(1);
      if (!ownsProject[0]) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .delete(chatMessages)
        .where(
          and(
            eq(chatMessages.projectId, input.projectId),
            eq(chatMessages.orgId, ctx.orgId),
          ),
        );

      await db.insert(auditLog).values({
        orgId: ctx.orgId,
        actor: ctx.actor,
        action: "chat.reset",
        resourceType: "project",
        resourceId: input.projectId,
      });

      return { ok: true as const };
    }),
});

// ──────────────────────── system prompt ────────────────────────

type ProjectRow = typeof projects.$inferSelect;

/**
 * Slim system prompt for v2 (tool use): identity, project facts, and a
 * nudge about which tools cover which data. Deep data (full asset
 * inventory, every bill, etc.) is pulled via tools when the user asks
 * something specific.
 *
 * This is much shorter than v1's prompt-stuffing approach — typical
 * size ~500 tokens vs ~3000 — which both reduces baseline cost and
 * leaves more room for multi-turn tool reasoning.
 */
async function buildSystemPrompt(
  db: ReturnType<typeof getDb>,
  orgId: string,
  project: ProjectRow,
): Promise<string> {
  const clientRow = project.clientId
    ? await db
        .select()
        .from(clients)
        .where(
          and(eq(clients.id, project.clientId), eq(clients.orgId, orgId)),
        )
        .limit(1)
        .then((r) => r[0])
    : undefined;

  const lines: string[] = [];
  lines.push(
    "You are Beamy's project assistant. You help small construction & design firms keep track of one project at a time.",
  );
  lines.push("");
  lines.push("# This project");
  lines.push(`- Name: ${project.name}`);
  lines.push(`- Status: ${project.status}`);
  lines.push(`- Type: ${project.projectType}`);
  if (clientRow) lines.push(`- Client: ${clientRow.name}`);
  if (project.address) lines.push(`- Address: ${project.address}`);
  if (project.contractAmount && project.contractCurrency) {
    lines.push(
      `- Contract: ${project.contractAmount} ${project.contractCurrency}`,
    );
  }
  if (project.startedAt) lines.push(`- Started: ${project.startedAt}`);
  if (project.substantialCompletionAt) {
    lines.push(
      `- Substantial completion: ${project.substantialCompletionAt}`,
    );
  }
  if (project.notes) lines.push(`- Notes: ${project.notes}`);
  if (project.tags.length > 0) {
    lines.push(`- Tags: ${project.tags.join(", ")}`);
  }
  lines.push("");
  lines.push("# Tools");
  lines.push(
    "You have read-only tools to query this project's data. Use them when answering specific questions:",
  );
  lines.push(
    "- list_rooms — every room in the project (call first if a question mentions a room by name)",
  );
  lines.push(
    "- list_assets — installed items: appliances, fixtures, HVAC, plumbing, wired lighting (per-instance, with manufacturer / model / serial / install date / warranty)",
  );
  lines.push(
    "- list_asset_events — timeline for one specific asset (service, repairs, inspections). Pass asset_id from list_assets.",
  );
  lines.push(
    "- list_furniture — free-standing pieces: sofas, tables, lamps, rugs, art (separate from list_assets)",
  );
  lines.push(
    "- list_materials — paint, tile, flooring, stone, etc. (per-batch, with lot number and attic stock)",
  );
  lines.push(
    "- list_specs — the procurement audit trail (specified → approved → ordered → received → installed)",
  );
  lines.push(
    "- list_work_items — THE PLAN: the spine of work to be done (description, qty, price, status, planned dates). Awarded bid lines flow here as `approved`.",
  );
  lines.push(
    "- list_bids — vendor quotes (one per PDF). Each has vendor / trade / total / status / flags. Use vendor_name, trade, or status to filter.",
  );
  lines.push(
    "- list_bid_lines — the itemized lines INSIDE a specific bid. Pass bid_id from list_bids.",
  );
  lines.push(
    "- list_bid_packages — groupings of competing bids for one piece of work (open / awarded / cancelled).",
  );
  lines.push(
    "- list_proposals — client-facing artifacts already generated (status, total, sent/decided dates).",
  );
  lines.push(
    "- list_bills — money the firm owes vendors, with status + due dates + overdue flag",
  );
  lines.push(
    "- list_invoices — money clients owe the firm, with status + dates + overdue flag",
  );
  lines.push(
    "- list_activity — recent project-level audit log entries (state transitions, edits)",
  );
  lines.push("");
  lines.push("# Style");
  lines.push("- Answer concisely. Lead with the answer, not the reasoning.");
  lines.push(
    "- Cite specifics from tool results — names, prices, dates, lot numbers — don't paraphrase away the detail.",
  );
  lines.push(
    "- If a tool returns no rows, say so. Don't invent data. Don't apologize — just state the gap and suggest a related tool if relevant.",
  );
  lines.push(
    "- Don't narrate which tool you're about to call. Just call it and answer the question.",
  );

  return lines.join("\n");
}
