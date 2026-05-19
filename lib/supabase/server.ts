import { createClient } from "@supabase/supabase-js";
import { serverEnv, publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Server-side Supabase client. Uses the service-role key.
 * - Bypasses Row Level Security.
 * - Never expose this to the browser.
 * - Use only from server components, route handlers, or server actions.
 */
export function createServerClient() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
