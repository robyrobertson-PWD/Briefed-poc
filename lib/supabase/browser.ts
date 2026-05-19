"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Browser-side Supabase client. Uses the anon key.
 * - All queries respect Row Level Security.
 * - Safe to use in client components.
 * - Authentication context will be wired in spec v2 (Clerk → JWT → Supabase).
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
