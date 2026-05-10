import { z } from "zod";

/**
 * Client = an external party (homeowner, commercial owner, brand) the firm has
 * projects with. Distinct from `vendors` (subs/suppliers the firm pays).
 *
 * `client_contacts` (additional contacts beyond `primary_contact`) is a
 * follow-up entity — modeled the same way as `vendor_contacts` will be.
 */

export const clientStatusSchema = z.enum(["active", "archived"]);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

export const clientCreateInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  primaryContact: z.string().trim().max(200).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});
export type ClientCreateInput = z.infer<typeof clientCreateInputSchema>;

export const clientUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: clientCreateInputSchema.partial(),
});
export type ClientUpdateInput = z.infer<typeof clientUpdateInputSchema>;

export const clientListInputSchema = z.object({
  status: clientStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type ClientListInput = z.infer<typeof clientListInputSchema>;

export const clientIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type ClientIdInput = z.infer<typeof clientIdInputSchema>;
