"use server";

import "server-only";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profile";
import { CONSENT_COPY, sha256 } from "@/lib/consent/copy";

export async function recordConsent(
  categoryId: string,
  action: "grant" | "revoke",
  uiSurface: string = "settings_privacy_page"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not authenticated" };

  if (!(categoryId in CONSENT_COPY)) {
    return { ok: false, error: "unknown consent category" };
  }

  const { profileId } = await ensureProfile();
  const supabase = createServerClient();

  // Current notice version (the one in effect now).
  const { data: notice } = await supabase
    .from("notice_versions")
    .select("version")
    .is("superseded_at", null)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const noticeVersion = (notice?.version as string) ?? "DEMO-v0";

  // Hash the exact explanation string the user saw, scoped by category and
  // notice version so a category-level copy change in a future notice produces
  // a different hash and the audit trail stays intelligible.
  const consentTextHash = await sha256(
    `${categoryId}|${noticeVersion}|${CONSENT_COPY[categoryId].explanation}`
  );

  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");
  const gpcPresent = h.get("sec-gpc") != null;

  const { error } = await supabase.from("consents").insert({
    profile_id: profileId,
    category_id: categoryId,
    action,
    notice_version: noticeVersion,
    ui_surface: uiSurface,
    consent_text_sha256: consentTextHash,
    ip_address: ip,
    user_agent: userAgent,
    gpc_signal_present: gpcPresent,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
