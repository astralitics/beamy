import { z } from "zod";

export * from "./assets";
export * from "./bids";
export * from "./bills";
export * from "./chat";
export * from "./clients";
export * from "./documents";
export * from "./invoices";
export * from "./materials";
export * from "./members";
export * from "./projects";
export * from "./proposals";
export * from "./services";
export * from "./specs";
export * from "./vendors";
export * from "./work-items";

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
  defaultCurrency: z.string().length(3).default("USD"),
  locale: z.string().min(2).max(10).default("en"),
});
export type CreateOrgInput = z.infer<typeof createOrgInputSchema>;
