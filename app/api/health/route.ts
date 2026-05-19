import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthStatus = {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  checks: {
    db: { status: "ok" | "error"; message?: string };
    env: { status: "ok" | "error"; missing?: string[] };
  };
  demo_mode: boolean;
};

export async function GET() {
  const checks: HealthStatus["checks"] = {
    db: { status: "ok" },
    env: { status: "ok" },
  };

  // DB check — confirm we can reach the notice_versions catalog (which is seeded
  // and world-readable). Using service-role client so RLS doesn't gate this.
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("notice_versions")
      .select("version")
      .limit(1);

    if (error) {
      checks.db = { status: "error", message: error.message };
    } else if (!data || data.length === 0) {
      checks.db = { status: "error", message: "notice_versions seed missing" };
    }
  } catch (err) {
    checks.db = {
      status: "error",
      message: err instanceof Error ? err.message : "unknown DB error",
    };
  }

  // Env check — surface which required vars are missing without revealing values.
  const requiredPublicVars = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const missing = requiredPublicVars.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    checks.env = { status: "error", missing };
  }

  const allOk = checks.db.status === "ok" && checks.env.status === "ok";
  const body: HealthStatus = {
    status: allOk ? "ok" : "error",
    timestamp: new Date().toISOString(),
    checks,
    demo_mode: publicEnv.NEXT_PUBLIC_DEMO_MODE === "true",
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
