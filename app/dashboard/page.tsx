import { ensureProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { profileId, clerkUserId } = await ensureProfile();

  return (
    <main style={{ padding: "32px", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Dashboard</h1>
      <p style={{ color: "#666", marginTop: 8 }}>
        You are signed in. This page is protected by Clerk middleware and your
        profile is provisioned in Supabase.
      </p>
      <pre style={{ marginTop: 16, fontSize: 12, color: "#888" }}>
        clerk_user_id: {clerkUserId}{"\n"}
        profile_id: {profileId}
      </pre>
    </main>
  );
}
