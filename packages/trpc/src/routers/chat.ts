import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLog,
  bills,
  chatMessages,
  clients,
  getDb,
  invoices,
  projects,
  rooms,
  specItems,
} from "@beamy/db";
import {
  chatListInputSchema,
  chatResetInputSchema,
  chatSendInputSchema,
} from "@beamy/shared";
import { orgScopedProcedure, router } from "../init";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const MAX_OUTPUT_TOKENS = 1024;

/**
 * `chat` router — the project-scoped assistant.
 *
 * Thin slice for v1: no streaming, no tool use. The system prompt is
 * rebuilt fresh each turn from current project state (project facts,
 * rooms, open specs, bills, invoices, recent activity), so the
 * assistant always sees up-to-date data without a stale snapshot.
 *
 * Tool use (so the assistant can run its own queries) is the next
 * iteration; until then, "stuff the context" is the simple thing that
 * works for normal-size projects.
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

      // Verify project ownership.
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

      // Build the system prompt from current project state. Parallel
      // fetches; payload is just for the LLM, not held in DB.
      const systemPrompt = await buildSystemPrompt(
        db,
        ctx.orgId,
        projectRow[0],
      );

      // Fetch existing conversation history (oldest first — Anthropic
      // expects the message array in chronological order).
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

      // Append the user message to the DB first so it's visible even
      // if the LLM call fails.
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

      // Call Anthropic.
      const anthropic = new Anthropic({ apiKey });
      let response;
      try {
        response = await anthropic.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages: [
            ...history.map((h) => ({
              role: h.role as "user" | "assistant",
              content: h.content,
            })),
            { role: "user" as const, content: input.content },
          ],
        });
      } catch (err) {
        // The user message stays in the DB so the failed turn isn't
        // lost. Surface a clear error.
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Anthropic API error: ${msg}`,
        });
      }

      // Extract text from the response. Anthropic returns content as an
      // array of blocks; we only handle text blocks in v1 (no tool use).
      const replyText = response.content
        .flatMap((c) => (c.type === "text" ? [c.text] : []))
        .join("\n")
        .trim();

      const [assistantRow] = await db
        .insert(chatMessages)
        .values({
          orgId: ctx.orgId,
          projectId: input.projectId,
          role: "assistant",
          content: replyText || "(no reply)",
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          createdBy: "agent:claude",
        })
        .returning();
      if (!assistantRow) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      // One audit_log entry per turn — captures the question + token
      // usage. Cheap analytics for later.
      await db.insert(auditLog).values({
        orgId: ctx.orgId,
        actor: ctx.actor,
        action: "chat.turn",
        resourceType: "project",
        resourceId: input.projectId,
        payload: {
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          contentLength: input.content.length,
        },
      });

      return { user: userRow, assistant: assistantRow };
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

// ──────────────────────── context builder ────────────────────────

type ProjectRow = typeof projects.$inferSelect;

/**
 * Assemble the system prompt fresh each turn. Includes:
 *   • project facts (name, client, address, contract, status)
 *   • rooms list
 *   • open specs (recent N)
 *   • assets / materials (recent N)
 *   • open bills + invoices
 *   • recent audit_log entries (last N)
 *
 * Truncations are deliberate: the assistant should see the *current*
 * project state, not the entire history. If a user asks about something
 * we didn't include, the prompt instructs the assistant to say so
 * rather than hallucinate.
 */
async function buildSystemPrompt(
  db: ReturnType<typeof getDb>,
  orgId: string,
  project: ProjectRow,
): Promise<string> {
  const [
    clientRow,
    roomList,
    specList,
    billList,
    invoiceList,
    activityList,
  ] = await Promise.all([
    project.clientId
      ? db
          .select()
          .from(clients)
          .where(
            and(eq(clients.id, project.clientId), eq(clients.orgId, orgId)),
          )
          .limit(1)
          .then((r) => r[0])
      : Promise.resolve(undefined),
    db
      .select()
      .from(rooms)
      .where(eq(rooms.projectId, project.id))
      .orderBy(asc(rooms.name)),
    db
      .select()
      .from(specItems)
      .where(eq(specItems.projectId, project.id))
      .orderBy(desc(specItems.updatedAt))
      .limit(30),
    db
      .select()
      .from(bills)
      .where(eq(bills.projectId, project.id))
      .orderBy(desc(bills.updatedAt))
      .limit(30),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, project.id))
      .orderBy(desc(invoices.updatedAt))
      .limit(30),
    db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, orgId),
          eq(auditLog.resourceType, "project"),
          eq(auditLog.resourceId, project.id),
        ),
      )
      .orderBy(desc(auditLog.ts))
      .limit(15),
  ]);

  const lines: string[] = [];
  lines.push(
    "You are Beamy's project assistant. You help small construction & design firms keep track of one project at a time.",
  );
  lines.push(
    "You answer concisely. When asked something not in the context below, say you don't have that information — never invent vendors, prices, dates, or model numbers.",
  );
  lines.push("");

  lines.push(`# Project · ${project.name}`);
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
  if (project.tags.length > 0) lines.push(`- Tags: ${project.tags.join(", ")}`);
  lines.push("");

  lines.push(`# Rooms (${roomList.length})`);
  if (roomList.length === 0) {
    lines.push("(none yet)");
  } else {
    for (const r of roomList) {
      const tag = r.roomType ? ` · ${r.roomType}` : "";
      lines.push(`- ${r.name}${tag}${r.notes ? ` — ${r.notes}` : ""}`);
    }
  }
  lines.push("");

  lines.push(`# Specs (showing ${specList.length})`);
  if (specList.length === 0) {
    lines.push("(none yet)");
  } else {
    for (const s of specList) {
      const parts: string[] = [`${s.name} [${s.state}]`];
      if (s.specType) parts.push(`→ ${s.specType}`);
      if (s.category) parts.push(s.category);
      if (s.clientPriceAmount && s.clientPriceCurrency) {
        parts.push(
          `client ${s.clientPriceAmount} ${s.clientPriceCurrency}`,
        );
      }
      if (s.installedAt) parts.push(`installed ${s.installedAt}`);
      lines.push(`- ${parts.join(" · ")}`);
    }
  }
  lines.push("");

  lines.push(`# Bills (showing ${billList.length}; ours to pay)`);
  if (billList.length === 0) {
    lines.push("(none yet)");
  } else {
    for (const b of billList) {
      const parts: string[] = [
        `${b.amount} ${b.currency}`,
        `[${b.status}]`,
      ];
      if (b.description) parts.push(b.description);
      if (b.dueAt) parts.push(`due ${b.dueAt}`);
      if (b.paidAt) parts.push(`paid ${b.paidAt}`);
      lines.push(`- ${parts.join(" · ")}`);
    }
  }
  lines.push("");

  lines.push(`# Invoices (showing ${invoiceList.length}; clients owe us)`);
  if (invoiceList.length === 0) {
    lines.push("(none yet)");
  } else {
    for (const i of invoiceList) {
      const parts: string[] = [
        `${i.amount} ${i.currency}`,
        `[${i.status}]`,
      ];
      if (i.invoiceNumber) parts.push(`#${i.invoiceNumber}`);
      if (i.description) parts.push(i.description);
      if (i.dueAt) parts.push(`due ${i.dueAt}`);
      if (i.paidAt) parts.push(`paid ${i.paidAt}`);
      lines.push(`- ${parts.join(" · ")}`);
    }
  }
  lines.push("");

  lines.push(`# Recent project activity (last ${activityList.length})`);
  if (activityList.length === 0) {
    lines.push("(no recent project-level activity)");
  } else {
    for (const a of activityList) {
      lines.push(`- ${a.ts.toISOString().slice(0, 10)} · ${a.action}`);
    }
  }

  return lines.join("\n");
}
