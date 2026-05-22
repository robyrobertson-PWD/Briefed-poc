import { ensureProfile } from "@/lib/profile";
import { DocumentsClient } from "@/components/documents-client";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await ensureProfile();

  return (
    <main style={{ padding: "32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Income documents</h1>
      <p style={{ color: "#666", marginTop: 8, marginBottom: 24 }}>
        Upload a paystub, W-2, 1099, tax return, or bank statement. We&rsquo;ll
        parse the income-relevant fields and ask you to confirm them. (DEMO — do
        not upload real PII.)
      </p>
      <DocumentsClient />
    </main>
  );
}
