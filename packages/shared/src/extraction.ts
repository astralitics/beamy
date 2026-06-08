import { z } from "zod";

/**
 * Document-extraction schemas + prompts (Beamy glue).
 *
 * These describe what the AI reads off an uploaded **factura** (vendor
 * bill) or **cotización** (vendor quote). They are intentionally
 * *lenient drafts*: every field is optional, money/quantity fields
 * accept a number or a string, and nothing is rejected for format. The
 * draft is shown to the user to confirm/edit; the strict create schemas
 * (`billCreateInputSchema`, the bid/work-item inputs) enforce real
 * formats at save time. So a slightly-off model output yields an
 * editable form, never a hard failure.
 *
 * The `.describe()` strings flow into the tool JSON-schema and steer the
 * model; the instruction constants are the per-type prompt.
 */

/** Trimmed optional text — the common draft field. */
const looseText = (max: number) => z.string().trim().max(max).optional();

/**
 * A number-ish draft value: the model may send "12500.00" or the JSON
 * number 12500. Coerce to a trimmed string either way; omitted → undefined.
 * The strict money regex is applied later at confirm time.
 */
const looseNumber = z.coerce.string().trim().max(40).optional();

// ───────────────────────── bills / facturas ─────────────────────────

export const billExtractionSchema = z.object({
  vendorName: looseText(200).describe(
    "The vendor / supplier (proveedor) name as printed on the invoice.",
  ),
  billNumber: looseText(100).describe(
    "The invoice number — folio or 'no. de factura'.",
  ),
  description: looseText(2000).describe(
    "A short description of what was billed (concepto / descripción).",
  ),
  amount: looseNumber.describe(
    "The grand total due (total a pagar) as a plain decimal — no currency symbol, no thousands separators (e.g. 12500.00).",
  ),
  currency: looseText(8).describe(
    "ISO 4217 currency code inferred from the document — MXN for pesos / M.N., USD for dollars.",
  ),
  issuedAt: looseText(40).describe(
    "Issue date (fecha de emisión) as YYYY-MM-DD.",
  ),
  dueAt: looseText(40).describe(
    "Payment due date (fecha de vencimiento) as YYYY-MM-DD, if stated.",
  ),
  notes: looseText(2000).describe(
    "Any other relevant note: payment terms, método de pago, late-fee text.",
  ),
});
export type BillExtraction = z.infer<typeof billExtractionSchema>;

export const BILL_EXTRACTION_INSTRUCTIONS = [
  "This document is a vendor invoice (factura) that our construction & design firm received and must pay.",
  "Extract its fields and call the `record_extraction` tool.",
  "Rules:",
  "- Amounts are plain decimal numbers, no currency symbol and no thousands separators (12500.00, never $12,500.00).",
  "- Use the grand total to pay (total) for `amount`.",
  "- Dates use the format YYYY-MM-DD.",
  "- `currency` is the ISO 4217 code: MXN for Mexican pesos / M.N., USD for US dollars.",
  "- The document is often in Spanish. Map: proveedor → vendorName, folio / no. de factura → billNumber,",
  "  fecha → issuedAt, vencimiento → dueAt, concepto → description.",
  "- Omit any field you cannot find. Do not guess.",
].join("\n");

// ─────────────────────── quotes / cotizaciones ──────────────────────

export const quoteLineExtractionSchema = z.object({
  description: looseText(2000).describe(
    "The line item description (concepto / partida / descripción).",
  ),
  ref: looseText(60).describe(
    "The vendor's line code or reference, if any (e.g. V01, P-3).",
  ),
  qty: looseNumber.describe("Quantity (cantidad) as a plain number."),
  unit: looseText(40).describe(
    "Unit of measure (pza, ea, m2, ml, lote, etc.).",
  ),
  unitPriceAmount: looseNumber.describe(
    "Unit price (precio unitario) as a plain decimal, no symbol.",
  ),
  totalAmount: looseNumber.describe(
    "Line total (importe) as a plain decimal, no symbol.",
  ),
  room: looseText(120).describe(
    "The room/space this specific line's work is for. Use the EXACT name of one of the available rooms listed in the instructions; omit when it is unclear or not stated.",
  ),
});
export type QuoteLineExtraction = z.infer<typeof quoteLineExtractionSchema>;

export const quoteExtractionSchema = z.object({
  vendorName: looseText(200).describe(
    "The vendor / supplier (proveedor) name on the quote.",
  ),
  trade: looseText(80).describe(
    "The trade or specialty (oficio / especialidad) — e.g. carpintería, electricidad, tile.",
  ),
  bidNumber: looseText(120).describe(
    "The quote number — 'no. de cotización' or 'folio'.",
  ),
  bidDate: looseText(40).describe("Quote date (fecha) as YYYY-MM-DD."),
  validUntil: looseText(40).describe(
    "Validity / expiry date (vigencia) as YYYY-MM-DD, if stated.",
  ),
  subtotalAmount: looseNumber.describe(
    "Subtotal (subtotal) as a plain decimal, no symbol.",
  ),
  ivaAmount: looseNumber.describe("IVA / tax amount as a plain decimal."),
  totalAmount: looseNumber.describe(
    "Grand total WITH IVA (total con IVA) as a plain decimal, no symbol.",
  ),
  depositAmount: looseNumber.describe(
    "Down payment / deposit (anticipo, enganche, pago inicial) required to start, as a plain decimal. If shown both with and without IVA, use the WITH-IVA (con IVA) amount.",
  ),
  currency: looseText(8).describe(
    "ISO 4217 currency code — MXN for pesos, USD for dollars.",
  ),
  ivaIncluded: z
    .boolean()
    .optional()
    .describe(
      "true only if the quoted prices already include IVA; false/omit if IVA is added on top.",
    ),
  lines: z
    .array(quoteLineExtractionSchema)
    .max(300)
    .optional()
    .default([])
    .describe("One entry per priced row in the quote."),
});
export type QuoteExtraction = z.infer<typeof quoteExtractionSchema>;

export const QUOTE_EXTRACTION_INSTRUCTIONS = [
  "This document is a vendor quote (cotización / presupuesto) for construction or design work.",
  "Extract the header fields AND every priced line item, then call the `record_extraction` tool.",
  "Rules:",
  "- Amounts are plain decimal numbers, no currency symbol and no thousands separators.",
  "- Dates use the format YYYY-MM-DD.",
  "- `currency` is the ISO 4217 code: MXN for Mexican pesos / M.N., USD for US dollars.",
  "- For `lines`, create one entry per priced row, with its description (concepto / partida), quantity",
  "  (cantidad), unit (unidad), unit price (precio unitario) and line total (importe).",
  "- Quantity: use the row's quantity column when there is one. When there is NO quantity column but the",
  "  description clearly states a count of units, extract that count into `qty` and the unit noun into `unit`",
  "  — e.g. 'Retoque en madera de 8 bancos' → qty 8, unit 'banco'; 'Limpieza de 2 taburetes' → qty 2, unit",
  "  'taburete'. Do NOT treat dimensions or measurements as a quantity ('tapete 2.50 x 1.60' is one rug of",
  "  that size → qty 1). If no count is stated and there is no quantity column, leave `qty` empty.",
  "- Unit price vs. line total: capture both `unitPriceAmount` (precio unitario) and `totalAmount` (importe)",
  "  when both are printed. If only ONE amount is shown for a row and the quantity is known, decide which it",
  "  is and compute the other: an amount under 'P. unitario / precio unitario' or marked 'c/u' / 'cada uno' is",
  "  the unit price (so totalAmount = unitPriceAmount × qty); an amount under 'Importe / Costo / Total' — or a",
  "  single unlabeled price for the whole row — is the line total (so unitPriceAmount = totalAmount ÷ qty).",
  "  Round to 2 decimals. When qty is 1, unit price and line total are equal.",
  "- A row may carry only a description and an amount — that is fine.",
  "- Room per line: for EACH line, set its `room` to the space that line's work is for, choosing the EXACT",
  "  name from the available rooms listed below; omit a line's room when it is unclear or not stated. If the",
  "  whole quote is clearly for a single space, set that same room on every line. Never invent a room — if",
  "  the document names no space (or none that matches the available rooms), leave every line's room empty.",
  "- IVA (Mexican VAT, normally 16%):",
  "    - If prices or totals are labeled 'sin IVA' / 'más IVA' / 'IVA no incluido', set ivaIncluded = false and",
  "      treat the stated total as the SUBTOTAL (subtotalAmount).",
  "    - If the prices already include IVA ('IVA incluido'), set ivaIncluded = true and put that grand total in totalAmount.",
  "    - Determine the IVA rate: if the document shows any amount both with and without IVA (e.g. 'anticipo sin",
  "      IVA' and 'anticipo con IVA'), infer the rate from that pair; otherwise assume 16%.",
  "    - Then compute ivaAmount = subtotal × rate and totalAmount = subtotal + ivaAmount (rounded to 2 decimals).",
  "      Filling these is REQUIRED even when the full IVA / con-IVA total is not printed — they are derived from",
  "      stated values and the standard rate, which is not the same as inventing data.",
  "- `depositAmount`: the down payment / deposit (anticipo, enganche, pago inicial) needed to start the work. If",
  "    it is shown both with and without IVA, use the WITH-IVA (con IVA) amount.",
  "- The document is often in Spanish. Map: proveedor → vendorName, oficio / especialidad → trade,",
  "  no. de cotización → bidNumber, vigencia → validUntil, subtotal / 'total sin IVA' → subtotalAmount,",
  "  IVA → ivaAmount, 'total con IVA' → totalAmount, anticipo → depositAmount.",
  "- Omit any field you genuinely cannot find or derive. Do not invent line items.",
].join("\n");

/** Discriminator for the two supported document kinds. */
export const extractionKindSchema = z.enum(["bill", "quote"]);
export type ExtractionKind = z.infer<typeof extractionKindSchema>;

/**
 * Request to extract from an already-uploaded document. The file lands
 * in Storage via the normal `documents.create` flow first; extraction
 * then reads it back by id. Nothing is stored until the user confirms.
 */
export const extractDocumentRequestSchema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),
});
export type ExtractDocumentRequest = z.infer<
  typeof extractDocumentRequestSchema
>;
