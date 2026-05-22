"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSupabaseBrowserClient } from "@/lib/supabase/browser";
import { confirmExtraction } from "@/lib/actions/documents";

type DocRow = {
  id: string;
  filename: string;
  document_type: string;
  parse_status: string;
};

type ParsedRow = {
  id: string;
  extracted_fields: Record<string, unknown>;
  extraction_confidence_overall: number | null;
  user_confirmation_status: string;
  user_confirmed_at: string | null;
};

export function ExtractionReview({ documentId }: { documentId: string }) {
  const supabase = useSupabaseBrowserClient();
  const [doc, setDoc] = useState<DocRow | null>(null);
  const [parsed, setParsed] = useState<ParsedRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: docData }, { data: parsedData }] = await Promise.all([
      supabase
        .from("income_documents")
        .select("id, filename, document_type, parse_status")
        .eq("id", documentId)
        .maybeSingle(),
      supabase
        .from("parsed_document_fields")
        .select(
          "id, extracted_fields, extraction_confidence_overall, user_confirmation_status, user_confirmed_at"
        )
        .eq("income_document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setDoc((docData as DocRow) ?? null);
    setParsed((parsedData as ParsedRow) ?? null);
    if (parsedData) {
      const initial: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        ((parsedData as ParsedRow).extracted_fields as Record<string, unknown>) ?? {}
      )) {
        initial[k] = v == null ? "" : String(v);
      }
      setEdits(initial);
    }
    setLoading(false);
  }, [supabase, documentId]);

  useEffect(() => {
    load();
  }, [load]);

  const callConfirm = async (
    status: "confirmed" | "corrected" | "rejected"
  ) => {
    if (!parsed) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    const correctedFields =
      status === "corrected"
        ? Object.fromEntries(
            Object.entries(edits).filter(([, v]) => v !== "")
          )
        : undefined;
    const res = await confirmExtraction({
      parsedFieldId: parsed.id,
      status,
      correctedFields,
    });
    if (!res.ok) {
      setErr(res.error);
    } else {
      setMsg(`Saved (${status}).`);
      await load();
    }
    setBusy(false);
  };

  if (loading) return <p style={{ color: "#888" }}>Loading…</p>;
  if (!doc) {
    return (
      <p style={{ color: "#b91c1c" }}>
        Document not found.{" "}
        <Link href="/documents" style={{ color: "#1d4ed8" }}>
          Back to documents
        </Link>
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "#666" }}>
        <div>
          <strong>File:</strong> {doc.filename}
        </div>
        <div>
          <strong>Type:</strong> {doc.document_type.replace("_", " ")}
        </div>
        <div>
          <strong>Parse status:</strong> {doc.parse_status}
        </div>
      </div>

      {doc.parse_status !== "completed" || !parsed ? (
        <div
          style={{
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 6,
            background: "#fafafa",
          }}
        >
          <p style={{ marginBottom: 8 }}>
            {doc.parse_status === "failed"
              ? "Extraction failed. You can retry by re-uploading from /documents."
              : "Extraction is still in progress."}
          </p>
          <button
            onClick={load}
            disabled={busy}
            style={{
              padding: "6px 12px",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "#444" }}>
            Overall confidence:{" "}
            {parsed.extraction_confidence_overall != null
              ? parsed.extraction_confidence_overall.toFixed(2)
              : "—"}{" "}
            · Status: <strong>{parsed.user_confirmation_status}</strong>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 16,
              border: "1px solid #eee",
              borderRadius: 8,
            }}
          >
            {Object.keys(edits).length === 0 ? (
              <p style={{ color: "#888" }}>
                No fields were extracted from this document.
              </p>
            ) : (
              Object.entries(edits).map(([k, v]) => (
                <label
                  key={k}
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <span style={{ fontSize: 12, color: "#555" }}>{k}</span>
                  <input
                    value={v}
                    onChange={(e) =>
                      setEdits((prev) => ({ ...prev, [k]: e.target.value }))
                    }
                    disabled={busy}
                    style={{
                      padding: "6px 8px",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                    }}
                  />
                </label>
              ))
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => callConfirm("confirmed")}
              disabled={busy}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid #166534",
                background: "#166534",
                color: "#fff",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Confirm
            </button>
            <button
              onClick={() => callConfirm("corrected")}
              disabled={busy}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid #1d4ed8",
                background: "#fff",
                color: "#1d4ed8",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Save corrections
            </button>
            <button
              onClick={() => callConfirm("rejected")}
              disabled={busy}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid #b91c1c",
                background: "#fff",
                color: "#b91c1c",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Reject
            </button>
          </div>
          {msg ? (
            <p style={{ color: "#166534", fontSize: 13 }}>{msg}</p>
          ) : null}
          {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}
        </>
      )}
      <Link
        href="/documents"
        style={{ fontSize: 13, color: "#1d4ed8" }}
      >
        ← Back to documents
      </Link>
    </div>
  );
}
