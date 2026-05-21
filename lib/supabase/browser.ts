"use client";

import { createClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";
import { useMemo } from "react";
import { clientEnv } from "@/lib/env/client";
import type { Database } from "@/lib/supabase/types";

/**
 * Browser-side Supabase client bound to the current Clerk session.
 * Queries run as the authenticated user; RLS scopes results to their own rows.
 * Use inside client components via this hook.
 *
 * Per the Clerk + Supabase native third-party auth integration, the client
 * passes a per-request Clerk session token via the `accessToken` option;
 * Supabase validates the token and `auth.jwt() ->> 'sub'` inside RLS resolves
 * to the Clerk user ID.
 *
 * Uses `createClient` from @supabase/supabase-js directly rather than
 * `createBrowserClient` from @supabase/ssr. @supabase/ssr@0.3.0's type
 * surface is misaligned with @supabase/supabase-js@2.106.0's modern generic
 * order (5 generics now, with `__InternalSupabase` stripping baked in), which
 * collapsed browser-side row inference to never. We're not using @supabase/ssr's
 * cookie features — Clerk handles auth — so dropping it here is clean.
 */
export function useSupabaseBrowserClient() {
  const { session } = useSession();

  return useMemo(() => {
    return createClient<Database>(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        accessToken: async () => (await session?.getToken()) ?? null,
      }
    );
  }, [session]);
}
