import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { projects } from "./projects";

/**
 * chat_messages — per-project conversation log with the assistant.
 *
 * Storing both sides of the conversation gives the assistant memory
 * across reloads and makes the chat part of the project record (alongside
 * specs / assets / activity). Each row is one message.
 *
 * `role` follows the Anthropic API shape: 'user' and 'assistant'. We
 * don't persist 'system' messages — the system prompt is rebuilt fresh
 * each turn from current project state so the assistant always sees
 * up-to-date data (rooms / specs / bills / etc), not a stale snapshot.
 *
 * `createdBy` follows the actor pattern (`user:<uuid>` / `agent:claude`)
 * so the same attribution lens that powers audit_log works here too.
 *
 * Token counts are stored for cost tracking later; nullable since
 * Anthropic returns them on every API call but we don't fail if
 * usage info is missing for some reason.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** Anthropic model id when role='assistant'; null for user messages. */
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (table) => ({
    byProject: index("chat_messages_by_project").on(
      table.projectId,
      table.createdAt,
    ),
  }),
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
