"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profile";
import { recordConsent } from "@/lib/actions/consent";
import { extractIncomeFields, scrubPii } from "@/lib/anthropic/extract";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/extraction/taxonomy";
import type { Json } from "@/lib/supabase/types";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const STORAGE_BUCKET = "income-documents-raw";

type ActionError = { ok: false; error: string };

function sanitizeFilename(name: string): string {
  // Strip path separators; allow alnum, dot, hyphen, underscore; collapse the rest.
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 200) || "file";
}

function isDocumentType(s: string): s is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(s);
}

function isAllowedMime(s: string): s is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(s);
}

// --------------------------------------------------------------
// createDocumentUpload — mint a signed upload URL + insert the row
// --------------------------------------------------------------
export async function createDocumentUpload(args: {
  documentType: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<
  | {
      ok: true;
      documentId: string;
      signedUrl: string;
      token: string;
      storagePath: string;
    }
  | ActionError
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not authenticated" };

  if (!isDocumentType(args.documentType)) {
    return { ok: false, error: "unknown document type" };
  }
  if (!isAllowedMime(args.mimeType)) {
    return { ok: false, error: "mime type not allowed" };
  }
  if (
    !Number.isFinite(args.sizeBytes) ||
    args.sizeBytes <= 0 ||
    args.sizeBytes > MAX_BYTES
  ) {
    return { ok: false, error: "size out of range (max 20 MB)" };
  }

  const { profileId } = await ensureProfile();

  // Record consent for uploaded documents at the time of this upload. UI surface
  // is 'document_upload' so we can distinguish from the settings-page toggle.
  const consentRes = await recordConsent(
    "income_docs_uploaded",
    "grant",
    "document_upload"
  );
  if (!consentRes.ok) {
    return { ok: false, error: `consent failed: ${consentRes.error}` };
  }

  const supabase = createServerClient();

  // The active 'anthropic' vendor-terms row governs this document (Anthropic is
  // the extraction processor whose reuse posture applies).
  const { data: terms, error: termsErr } = await supabase
    .from("vendor_terms_versions")
    .select("id")
    .eq("vendor", "anthropic")
    .is("superseded_at", null)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (termsErr || !terms) {
    return {
      ok: false,
      error: "no active anthropic vendor_terms_version row",
    };
  }

  const storagePath = `${profileId}/${crypto.randomUUID()}-${sanitizeFilename(args.filename)}`;

  const { data: doc, error: insertErr } = await supabase
    .from("income_documents")
    .insert({
      profile_id: profileId,
      storage_path: storagePath,
      filename: args.filename,
      size_bytes: args.sizeBytes,
      mime_type: args.mimeType,
      document_type: args.documentType,
      tax_year: null,
      vendor_terms_version_id: terms.id as string,
      parse_status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !doc) {
    return { ok: false, error: insertErr?.message ?? "insert failed" };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signErr || !signed) {
    return {
      ok: false,
      error: signErr?.message ?? "could not mint signed upload URL",
    };
  }

  return {
    ok: true,
    documentId: doc.id as string,
    signedUrl: signed.signedUrl,
    token: signed.token,
    storagePath,
  };
}

// --------------------------------------------------------------
// runExtraction — download from storage, call Claude, persist fields
// --------------------------------------------------------------
export async function runExtraction(
  documentId: string
): Promise<{ ok: true; parsedFieldId: string } | ActionError> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not authenticated" };
  const { profileId } = await ensureProfile();
  const supabase = createServerClient();

  const { data: doc, error: loadErr } = await supabase
    .from("income_documents")
    .select(
      "id, profile_id, storage_path, document_type, mime_type, parse_status"
    )
    .eq("id", documentId)
    .maybeSingle();
  if (loadErr || !doc) {
    return { ok: false, error: "document not found" };
  }
  if ((doc.profile_id as string) !== profileId) {
    return { ok: false, error: "not authorized for this document" };
  }

  await supabase
    .from("income_documents")
    .update({ parse_status: "parsing" })
    .eq("id", documentId);

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(doc.storage_path as string);
    if (dlErr || !blob) {
      throw new Error(dlErr?.message ?? "download failed");
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const base64Data = buf.toString("base64");

    const result = await extractIncomeFields({
      documentType: doc.document_type as DocumentType,
      mimeType: doc.mime_type as string,
      base64Data,
    });

    const { data: parsed, error: parseErr } = await supabase
      .from("parsed_document_fields")
      .insert({
        income_document_id: documentId,
        profile_id: profileId,
        tax_year: null,
        filing_status: null,
        // jsonb column: the value is a flat key→primitive map from Claude
        // (Record<string, unknown>) which satisfies the Json union at runtime
        // but not structurally at compile time. Cast at the boundary.
        extracted_fields: result.extractedFields as unknown as Json,
        extraction_model: result.model,
        extraction_confidence_overall: result.overallConfidence,
        user_confirmation_status: "pending",
      })
      .select("id")
      .single();
    if (parseErr || !parsed) {
      throw new Error(parseErr?.message ?? "parsed_document_fields insert failed");
    }

    await supabase
      .from("income_documents")
      .update({
        parse_status: "completed",
        parse_completed_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return { ok: true, parsedFieldId: parsed.id as string };
  } catch (err) {
    await supabase
      .from("income_documents")
      .update({ parse_status: "failed" })
      .eq("id", documentId);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "extraction failed",
    };
  }
}

// --------------------------------------------------------------
// confirmExtraction — user accepts/corrects/rejects the extraction
// --------------------------------------------------------------
export async function confirmExtraction(args: {
  parsedFieldId: string;
  status: "confirmed" | "corrected" | "rejected";
  correctedFields?: Record<string, unknown>;
}): Promise<{ ok: true } | ActionError> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not authenticated" };
  if (!["confirmed", "corrected", "rejected"].includes(args.status)) {
    return { ok: false, error: "invalid status" };
  }
  const { profileId } = await ensureProfile();
  const supabase = createServerClient();

  const { data: existing, error: loadErr } = await supabase
    .from("parsed_document_fields")
    .select("id, profile_id, extracted_fields")
    .eq("id", args.parsedFieldId)
    .maybeSingle();
  if (loadErr || !existing) {
    return { ok: false, error: "parsed fields row not found" };
  }
  if ((existing.profile_id as string) !== profileId) {
    return { ok: false, error: "not authorized for this row" };
  }

  const update: {
    user_confirmation_status: "confirmed" | "corrected" | "rejected";
    user_confirmed_at: string;
    extracted_fields?: Json;
  } = {
    user_confirmation_status: args.status,
    user_confirmed_at: new Date().toISOString(),
  };

  if (args.status === "corrected" && args.correctedFields) {
    const merged = {
      ...((existing.extracted_fields as Record<string, unknown>) ?? {}),
      ...scrubPii(args.correctedFields),
    };
    update.extracted_fields = merged as unknown as Json;
  }

  const { error: updateErr } = await supabase
    .from("parsed_document_fields")
    .update(update)
    .eq("id", args.parsedFieldId);
  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true };
}
