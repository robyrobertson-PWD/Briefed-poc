"use client";

import { createBrowserClient } from "@supabase/ssr";
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
 */
export function useSupabaseBrowserClient() {
  const { session } = useSession();

  return useMemo(() => {
    return createBrowserClient<Database>(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        accessToken: async () => (await session?.getToken()) ?? null,
      }
    );
  }, [session]);
}
