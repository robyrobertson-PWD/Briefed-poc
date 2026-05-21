import { ensureProfile } from "@/lib/profile";
import { ConsentSettings } from "@/components/consent-settings";

export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage() {
  // Provision the profile (also gates: middleware already requires auth here).
  await ensureProfile();

  return (
    <main style={{ padding: "32px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Privacy & consent</h1>
      <p style={{ color: "#666", marginTop: 8, marginBottom: 24 }}>
        Control how Briefed uses each category of your data. Each choice is
        recorded with the date and the notice version in effect. (Placeholder
        copy — final wording owned by Design + Regulatory.)
      </p>
      <ConsentSettings />
    </main>
  );
}
