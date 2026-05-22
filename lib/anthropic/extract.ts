import "server-only";
import type { ContentBlockParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { anthropic, EXTRACTION_MODEL } from "@/lib/anthropic/client";
import {
  EXTRACTION_TOOL,
  buildExtractionPrompt,
  type DocumentType,
} from "@/lib/extraction/taxonomy";

export type ExtractionResult = {
  extractedFields: Record<string, unknown>;
  overallConfidence: number | null;
  model: string;
};

// MIME types the Anthropic SDK's Base64ImageSource accepts. application/pdf is
// handled separately through the document block, not the image block.
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];
function isImageMimeType(mime: string): mime is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

export async function extractIncomeFields(args: {
  documentType: DocumentType;
  mimeType: string;
  base64Data: string;
}): Promise<ExtractionResult> {
  let mediaBlock: ContentBlockParam;
  if (args.mimeType === "application/pdf") {
    mediaBlock = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: args.base64Data,
      },
    };
  } else if (isImageMimeType(args.mimeType)) {
    mediaBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: args.mimeType,
        data: args.base64Data,
      },
    };
  } else {
    throw new Error(`unsupported mime type for extraction: ${args.mimeType}`);
  }

  const tool = EXTRACTION_TOOL as unknown as Tool;
  const msg = await anthropic.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 2048,
    tools: [tool],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          mediaBlock,
          { type: "text", text: buildExtractionPrompt(args.documentType) },
        ],
      },
    ],
  });

  const toolUse = msg.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("extraction returned no tool_use block");
  }
  const input = (toolUse.input ?? {}) as {
    extracted_fields?: Record<string, unknown>;
    overall_confidence?: number;
  };
  return {
    extractedFields: scrubPii(input.extracted_fields ?? {}),
    overallConfidence:
      typeof input.overall_confidence === "number" ? input.overall_confidence : null,
    model: EXTRACTION_MODEL,
  };
}

// Defense-in-depth: the prompt forbids SSNs/account numbers, but extracted_fields
// is free-form jsonb, so strip anything that looks like one before persisting.
// Drops values matching SSN (NNN-NN-NNNN / 9 consecutive digits) or long digit
// runs (>=12, account-number-like). Keys containing 'ssn'/'account' are dropped.
export function scrubPii(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const ssn = /\b\d{3}-?\d{2}-?\d{4}\b/;
  const longDigits = /\d{12,}/;
  for (const [k, v] of Object.entries(fields)) {
    if (/ssn|social.?security|account.?number|routing/i.test(k)) continue;
    if (
      typeof v === "string" &&
      (ssn.test(v) || longDigits.test(v.replace(/\D/g, "")))
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}
