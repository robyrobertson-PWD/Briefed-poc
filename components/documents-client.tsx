"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  createDocumentUpload,
  runExtraction,
} from "@/lib/actions/documents";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/extraction/taxonomy";

const STORAGE_BUCKET = "income-documents-raw";

type DocumentRow = {
  id: string;
  filename: string;
  document_type: string;
  parse_status: string;
  uploaded_at: string;
};

export function DocumentsClient() {
  const supabase = useSupabaseBrowserClient();
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocumentType>("paystub");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const reload = useCallback(async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from("income_documents")
      .select("id, filename, document_type, parse_status, uploaded_at")
      .order("uploaded_at", { ascending: false });
    setDocs(((data ?? []) as DocumentRow[]) ?? []);
    setLoadingList(false);
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (!file) {
      setErrorMsg("pick a file first");
      return;
    }
    setBusy(true);
    try {
      setStatusMsg("Requesting upload URL…");
      const created = await createDocumentUpload({
        documentType,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!created.ok) {
        setErrorMsg(created.error);
        setBusy(false);
        return;
      }

      setStatusMsg("Uploading…");
      const upload = await supabase.storage
        .from(STORAGE_BUCKET)
        .uploadToSignedUrl(created.storagePath, created.token, file, {
          contentType: file.type,
        });
      if (upload.error) {
        setErrorMsg(`upload failed: ${upload.error.message}`);
        setBusy(false);
        return;
      }

      setStatusMsg("Extracting fields with Claude…");
      const extraction = await runExtraction(created.documentId);
      if (!extraction.ok) {
        setErrorMsg(`extraction failed: ${extraction.error}`);
        setBusy(false);
        return;
      }

      router.push(`/documents/${created.documentId}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "unknown error");
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 16,
          border: "1px solid #eee",
          borderRadius: 8,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Document type</span>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocumentType)}
            disabled={busy}
            style={{ padding: "6px 8px" }}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>File</span>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          <span style={{ fontSize: 12, color: "#888" }}>
            PDF / PNG / JPEG / WEBP, up to 20 MB. DEMO only — do not upload real
            PII.
          </span>
        </label>
        <button
          type="submit"
          disabled={busy || !file}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #166534",
            background: busy ? "#a3a3a3" : "#166534",
            color: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
            alignSelf: "flex-start",
          }}
        >
          {busy ? "Working…" : "Upload + extract"}
        </button>
        {statusMsg ? <p style={{ fontSize: 13, color: "#444" }}>{statusMsg}</p> : null}
        {errorMsg ? (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>{errorMsg}</p>
        ) : null}
      </form>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Your documents
        </h2>
        {loadingList ? (
          <p style={{ color: "#888" }}>Loading…</p>
        ) : docs.length === 0 ? (
          <p style={{ color: "#888" }}>No uploads yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {docs.map((d) => (
              <li
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #eee",
                  padding: "10px 0",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{d.filename}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {d.document_type.replace("_", " ")} ·{" "}
                    {new Date(d.uploaded_at).toLocaleString()}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color:
                        d.parse_status === "completed"
                          ? "#166534"
                          : d.parse_status === "failed"
                            ? "#b91c1c"
                            : "#a16207",
                    }}
                  >
                    {d.parse_status}
                  </span>
                  <Link
                    href={`/documents/${d.id}`}
                    style={{ fontSize: 13, color: "#1d4ed8" }}
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
