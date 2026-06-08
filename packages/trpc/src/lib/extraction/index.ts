/**
 * Reusable document-extraction seam.
 *
 * Domain-agnostic: bytes + a Zod schema + a prompt → typed data via a
 * Claude vision/PDF call. Free of any `@beamy/*` import so it can be
 * lifted into a sibling app or a published package verbatim. See
 * `extract-document.ts` for the contract.
 */
export {
  extractDocument,
  DocumentExtractionError,
  EXTRACTION_DEFAULT_MODEL,
  type ExtractDocumentInput,
  type ExtractDocumentResult,
} from "./extract-document";
