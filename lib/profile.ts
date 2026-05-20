import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Ensures a profiles row exists for the current Clerk user and returns its id.
 * Uses the service-role client (bypasses RLS) because this is the row-creation
 * path. Idempotent — safe to call on every authenticated request.
 */
export async function ensureProfile(): Promise<{ profileId: string; clerkUserId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("ensureProfile called without an authenticated user");

  const supabase = createServerClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existing) return { profileId: existing.id as string, clerkUserId: userId };

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ clerk_user_id: userId, email, status: "active" })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to provision profile: ${error.message}`);
  return { profileId: created.id as string, clerkUserId: userId };
}
