import { z } from "zod";

/**
 * Chat — per-project assistant conversation.
 *
 * v1 is a thin slice: no streaming, no tool use. The system prompt is
 * built fresh each turn from project state, so the assistant always
 * sees current data.
 */

export const chatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatListInputSchema = z.object({
  projectId: z.string().uuid(),
  /** Hard cap on rows returned. We page from the bottom (newest). */
  limit: z.number().int().min(1).max(500).default(200),
});
export type ChatListInput = z.infer<typeof chatListInputSchema>;

export const chatSendInputSchema = z.object({
  projectId: z.string().uuid(),
  content: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(8000, "Message too long (max 8000 chars)"),
});
export type ChatSendInput = z.infer<typeof chatSendInputSchema>;

export const chatResetInputSchema = z.object({
  projectId: z.string().uuid(),
});
export type ChatResetInput = z.infer<typeof chatResetInputSchema>;
