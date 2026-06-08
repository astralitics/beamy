import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * extract-document — a domain-agnostic structured-extraction call.
 *
 * Give it raw file bytes + a Zod schema + an instruction string; it
 * hands the document to a vision/PDF-capable Claude model, forces a
 * single tool call shaped like your schema, validates the result, and
 * returns the typed data. It knows nothing about bills, quotes, the
 * database, storage, or tRPC — the only inputs are bytes + a schema +
 * a prompt. That keeps this file portable: it can be lifted into a
 * sibling app (or a published package) verbatim. Its only dependencies
 * are `@anthropic-ai/sdk`, `zod`, and `zod-to-json-schema`.
 *
 * Why forced tool use (vs. `output_config.format`): it's supported on
 * every tool-capable model and SDK version, and it mirrors the pattern
 * already in this repo's chat router. If you later standardize on a
 * structured-output-capable model, `messages.parse()` with
 * `output_config.format` is the modern equivalent.
 */

/** Image MIME types the model accepts as a vision block. */
const IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const PDF_MEDIA_TYPE = "application/pdf";

/** Default model when none is passed and EXTRACTION_MODEL is unset. */
export const EXTRACTION_DEFAULT_MODEL = "claude-sonnet-4-6";

const MAX_OUTPUT_TOKENS = 4096;
const TOOL_NAME = "record_extraction";

const DEFAULT_SYSTEM =
  "You are a precise document data-extraction engine for a construction & design firm. " +
  "Read the attached document (a vendor invoice/factura or quote/cotización) and call the " +
  "`record_extraction` tool with exactly the fields you can read off it. Never guess or invent " +
  "values — omit any field you cannot find in the document. Transcribe numbers and dates verbatim.";

export interface ExtractDocumentInput<T> {
  /** The raw document. `mimeType` selects the image vs. PDF block. */
  file: { bytes: Buffer; mimeType: string };
  /** Output shape. The model is forced to fill a tool matching this. */
  schema: z.ZodType<T>;
  /** Per-document-type prompt: what to pull and how to normalize it. */
  instructions: string;
  /** Optional system prompt override. */
  system?: string;
  /** Model id. Defaults to EXTRACTION_MODEL env → EXTRACTION_DEFAULT_MODEL. */
  model?: string;
  /** API key. Defaults to ANTHROPIC_API_KEY. */
  apiKey?: string;
}

export interface ExtractDocumentResult<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Thrown for caller-fixable problems (missing key, unsupported file
 * type, the model returning no tool call). Routers map this to a clear
 * tRPC error; other apps can catch it the same way.
 */
export class DocumentExtractionError extends Error {
  constructor(
    message: string,
    readonly code: "no_api_key" | "unsupported_type" | "no_output" | "model_error",
  ) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

export async function extractDocument<T>(
  input: ExtractDocumentInput<T>,
): Promise<ExtractDocumentResult<T>> {
  const apiKey = input.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new DocumentExtractionError(
      "ANTHROPIC_API_KEY is not set on the server. Add it to .env and restart.",
      "no_api_key",
    );
  }

  const model =
    input.model ?? process.env.EXTRACTION_MODEL ?? EXTRACTION_DEFAULT_MODEL;

  const documentBlock = toContentBlock(input.file);
  const tool: Tool = {
    name: TOOL_NAME,
    description:
      "Record the structured fields extracted from the document. Only include fields actually present in the document.",
    input_schema: toToolInputSchema(input.schema),
  };

  const anthropic = new Anthropic({ apiKey });
  const messages: MessageParam[] = [
    {
      role: "user",
      content: [documentBlock, { type: "text", text: input.instructions }],
    },
  ];

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: input.system ?? DEFAULT_SYSTEM,
      tools: [tool],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DocumentExtractionError(
      `Document extraction model call failed: ${msg}`,
      "model_error",
    );
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new DocumentExtractionError(
      "The model did not return structured extraction output.",
      "no_output",
    );
  }

  // Validate the model's output against the caller's schema. The model
  // is forced to call the tool, but it can still omit optional fields or
  // (rarely) coerce a type — Zod is the guard before this leaves the seam.
  const data = input.schema.parse(toolUse.input);

  return {
    data,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

/** Base64-encode the file into the right vision/document block. */
function toContentBlock(file: {
  bytes: Buffer;
  mimeType: string;
}): ContentBlockParam {
  const data = file.bytes.toString("base64");
  if (file.mimeType === PDF_MEDIA_TYPE) {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }
  if (IMAGE_MEDIA_TYPES.has(file.mimeType)) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: file.mimeType as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
        data,
      },
    };
  }
  throw new DocumentExtractionError(
    `Unsupported document type for extraction: ${file.mimeType}. Upload a PDF or an image (PNG, JPEG, WEBP, or GIF).`,
    "unsupported_type",
  );
}

/**
 * Convert the caller's Zod schema into a tool `input_schema`. `$refStrategy:
 * "none"` inlines nested objects (the quote line-items array) so there are
 * no `$ref`s the API would have to resolve; we drop the `$schema` meta key
 * the API doesn't expect.
 */
function toToolInputSchema(schema: z.ZodType<unknown>): Tool.InputSchema {
  const json = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as Record<string, unknown>;
  delete json.$schema;
  return json as Tool.InputSchema;
}
