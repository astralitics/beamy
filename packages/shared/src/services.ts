import { z } from "zod";
import { billingUnitSchema } from "./vendors";

/**
 * services — the firm's standard offerings catalog. Examples:
 *   - "Kitchen renovation — design + build" (priced per project)
 *   - "Bathroom remodel" (priced per project)
 *   - "Site visit" (per hour)
 *   - "Full design package" (interior firm — per project or retainer)
 *   - "FF&E procurement + management" (retainer)
 *
 * Feeds proposal/bid composition later (workflow #1 in §12) — services are
 * the reusable building blocks that estimates draw from.
 */

export const serviceStatusSchema = z.enum(["active", "archived"]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");

export const serviceCreateInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(5000).optional(),
    defaultRateAmount: moneyAmount.optional(),
    defaultRateCurrency: currencyCode.optional(),
    billingUnit: billingUnitSchema.default("hour"),
    notes: z.string().trim().max(5000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  })
  .superRefine((val, ctx) => {
    const hasAmount = val.defaultRateAmount !== undefined;
    const hasCurrency = val.defaultRateCurrency !== undefined;
    if (hasAmount !== hasCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "defaultRateAmount and defaultRateCurrency must be set together",
        path: ["defaultRateAmount"],
      });
    }
  });
export type ServiceCreateInput = z.infer<typeof serviceCreateInputSchema>;

export const serviceUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    defaultRateAmount: moneyAmount.optional(),
    defaultRateCurrency: currencyCode.optional(),
    billingUnit: billingUnitSchema.optional(),
    notes: z.string().trim().max(5000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  }),
});
export type ServiceUpdateInput = z.infer<typeof serviceUpdateInputSchema>;

export const serviceListInputSchema = z.object({
  status: serviceStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type ServiceListInput = z.infer<typeof serviceListInputSchema>;

export const serviceIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type ServiceIdInput = z.infer<typeof serviceIdInputSchema>;
