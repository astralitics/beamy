import { z } from "zod";

/**
 * Spec item = something the client commits to buy and install. Carries
 * the pre-install lifecycle (specified → approved → ordered → received
 * → installed) and the price math (catalog × markup → client price).
 *
 * Once installed, the corresponding asset or material row is created
 * (manually for v1; via workflow in M5). The spec stays around as the
 * procurement audit trail.
 */

export const specStateSchema = z.enum([
  "specified",
  "client_approved",
  "ordered",
  "received",
  "installed",
  "cancelled",
]);
export type SpecState = z.infer<typeof specStateSchema>;

export const SPEC_STATE_LABELS: Record<SpecState, string> = {
  specified: "Specified",
  client_approved: "Client approved",
  ordered: "Ordered",
  received: "Received",
  installed: "Installed",
  cancelled: "Cancelled",
};

/** Ordered list of forward transitions for the lifecycle. */
export const SPEC_STATE_FLOW: SpecState[] = [
  "specified",
  "client_approved",
  "ordered",
  "received",
  "installed",
];

export const specTypeSchema = z.enum(["asset", "material"]);
export type SpecType = z.infer<typeof specTypeSchema>;

export const SPEC_TYPE_LABELS: Record<SpecType, string> = {
  asset: "Asset",
  material: "Material",
};

const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "decimal with up to 2 decimal places");
const currencyCode = z.string().length(3, "ISO 4217 3-letter code");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

function moneyPairCheck(
  amount: string | null | undefined,
  currency: string | null | undefined,
  ctx: z.RefinementCtx,
  amountPath: string,
) {
  const hasAmount = amount !== undefined && amount !== null;
  const hasCurrency = currency !== undefined && currency !== null;
  if (hasAmount !== hasCurrency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "amount and currency must be set together",
      path: [amountPath],
    });
  }
}

export const specCreateInputSchema = z
  .object({
    projectId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    specType: specTypeSchema.default("asset"),
    category: z.string().trim().max(80).optional(),
    name: z.string().trim().min(1, "Name is required").max(200),
    description: z.string().trim().max(2000).optional(),
    state: specStateSchema.default("specified"),
    catalogPriceAmount: moneyAmount.optional(),
    catalogPriceCurrency: currencyCode.optional(),
    clientPriceAmount: moneyAmount.optional(),
    clientPriceCurrency: currencyCode.optional(),
    approvedAt: isoDate.optional(),
    orderedAt: isoDate.optional(),
    receivedAt: isoDate.optional(),
    installedAt: isoDate.optional(),
    notes: z.string().trim().max(10000).optional(),
  })
  .superRefine((val, ctx) => {
    moneyPairCheck(
      val.catalogPriceAmount,
      val.catalogPriceCurrency,
      ctx,
      "catalogPriceAmount",
    );
    moneyPairCheck(
      val.clientPriceAmount,
      val.clientPriceCurrency,
      ctx,
      "clientPriceAmount",
    );
  });
export type SpecCreateInput = z.infer<typeof specCreateInputSchema>;

export const specUpdateInputSchema = z.object({
  id: z.string().uuid(),
  patch: z
    .object({
      roomId: z.string().uuid().nullable().optional(),
      vendorId: z.string().uuid().nullable().optional(),
      specType: specTypeSchema.optional(),
      category: z.string().trim().max(80).nullable().optional(),
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      state: specStateSchema.optional(),
      catalogPriceAmount: moneyAmount.nullable().optional(),
      catalogPriceCurrency: currencyCode.nullable().optional(),
      clientPriceAmount: moneyAmount.nullable().optional(),
      clientPriceCurrency: currencyCode.nullable().optional(),
      approvedAt: isoDate.nullable().optional(),
      orderedAt: isoDate.nullable().optional(),
      receivedAt: isoDate.nullable().optional(),
      installedAt: isoDate.nullable().optional(),
      notes: z.string().trim().max(10000).nullable().optional(),
    })
    .superRefine((val, ctx) => {
      moneyPairCheck(
        val.catalogPriceAmount,
        val.catalogPriceCurrency,
        ctx,
        "catalogPriceAmount",
      );
      moneyPairCheck(
        val.clientPriceAmount,
        val.clientPriceCurrency,
        ctx,
        "clientPriceAmount",
      );
    }),
});
export type SpecUpdateInput = z.infer<typeof specUpdateInputSchema>;

export const specListInputSchema = z.object({
  projectId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  state: specStateSchema.optional(),
  specType: specTypeSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type SpecListInput = z.infer<typeof specListInputSchema>;

export const specIdInputSchema = z.object({
  id: z.string().uuid(),
});
export type SpecIdInput = z.infer<typeof specIdInputSchema>;

/**
 * State transition input — separate endpoint from update because each
 * transition has a date that gets stamped automatically.
 */
export const specTransitionInputSchema = z.object({
  id: z.string().uuid(),
  to: specStateSchema,
  // Optional override of the timestamp — defaults to today.
  at: isoDate.optional(),
});
export type SpecTransitionInput = z.infer<typeof specTransitionInputSchema>;
