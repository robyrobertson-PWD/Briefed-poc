import { z } from "zod";

// Server-side env vars — required at runtime, never exposed to browser
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().optional(), // Required after spec v2
  ANTHROPIC_API_KEY: z.string().optional(), // Required after spec v4
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET_SANDBOX: z.string().optional(),
  PINWHEEL_API_KEY_SANDBOX: z.string().optional(),
});

// Client-safe env vars — exposed to browser
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEMO_MODE: z.string().default("true"),
});

export const serverEnv = serverSchema.parse(process.env);
export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
});
