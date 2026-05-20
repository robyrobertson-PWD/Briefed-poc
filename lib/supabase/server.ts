import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { clientEnv } from "@/lib/env/client";
import type { Database } from "@/lib/supabase/types";

/**
 * Server-side Supabase client. Uses the service-role key.
 * - Bypasses Row Level Security.
 * - Never expose this to the browser.
 * - Use only from server components, route handlers, or server actions.
 */
export function createServerClient() {
  return createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
