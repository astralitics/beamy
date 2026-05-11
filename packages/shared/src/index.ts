import { z } from "zod";

export * from "./clients";
export * from "./members";
export * from "./projects";
export * from "./services";
export * from "./vendors";

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
