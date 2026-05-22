import { ensureProfile } from "@/lib/profile";
import { ExtractionReview } from "@/components/extraction-review";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: { id: string };
}) {
  await ensureProfile();

  return (
    <main style={{ padding: "32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Review extracted fields</h1>
      <p style={{ color: "#666", marginTop: 8, marginBottom: 24 }}>
        Confirm what we read from the document, correct any value that&rsquo;s
        wrong, or reject the extraction. (DEMO — placeholder taxonomy; final
        field set owned by the Income-Calc Specialist.)
      </p>
      <ExtractionReview documentId={params.id} />
    </main>
  );
}
