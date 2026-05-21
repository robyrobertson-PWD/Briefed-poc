import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// NOTE: deliberately does NOT import "@/lib/supabase/server" (that client is
// tuned for Node route handlers and carries `server-only`). This is a minimal
// Edge-compatible service-role client for fire-and-forget GPC logging.

type GpcLogInput = {
  requestPath: string;
  gpcHeaderValue: string;
  clerkUserId: string | null;
  ip: string | null;
  userAgent: string | null;
};

export async function logGpcSignal(input: GpcLogInput): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return;

    const supabase = createClient<Database>(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabase.from("gpc_signals").insert({
      profile_id: null,
      session_id: input.clerkUserId,
      request_path: input.requestPath,
      gpc_header_value: input.gpcHeaderValue,
      ip_address: input.ip,
      user_agent: input.userAgent,
    });
  } catch {
    // Swallow — GPC logging must never break a request.
  }
}
