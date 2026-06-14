import { z } from "zod";
import { verticalSchema } from "./verticals";

export * from "./assets";
export * from "./bids";
export * from "./bills";
export * from "./change-orders";
export * from "./chat";
export * from "./clients";
export * from "./documents";
export * from "./extraction";
export * from "./furniture";
export * from "./invoices";
export * from "./materials";
export * from "./members";
export * from "./projects";
export * from "./proposals";
export * from "./services";
export * from "./specs";
export * from "./vendors";
export * from "./verticals";
export * from "./work-items";
export * from "./workflows";
export * from "./expressions";
export * from "./schedule";
export * from "./workflow-vocab";
export * from "./workflow-builder";
export * from "./workflow-templates";

export const orgRoleSchema = z.enum(["owner", "admin", "member"]);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const createOrgInputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, and hyphens only"),
  description: z.string().max(1000).optional(),
  // Product vertical for the new workspace. Optional so the sign-up flow can
  // omit it (defaults to construction); the "+ New workspace" switcher action
  // sets it explicitly.
  vertical: verticalSchema.optional(),
  defaultCurrency: z.string().length(3).default("USD"),
  locale: z.string().min(2).max(10).default("en"),
});
export type CreateOrgInput = z.infer<typeof createOrgInputSchema>;
