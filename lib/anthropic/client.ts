import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env/server";

export const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

// Sonnet is the cost-model recommendation for varied, unstructured documents.
// Verified against current model catalog: claude-sonnet-4-6 is the pinned-snapshot
// API ID for Claude Sonnet 4.6 (see spec v5 §4.4 SDK-drift gate, May 2026).
export const EXTRACTION_MODEL = "claude-sonnet-4-6";
