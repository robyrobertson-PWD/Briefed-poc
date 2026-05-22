import "server-only";
import { z } from "zod";

// Importing this module from any client component is a BUILD-TIME error because
// of the `server-only` import above. That converts the old runtime footgun
// (Finding 1, review-001) into a compile-time guarantee.

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET_SANDBOX: z.string().optional(),
  PINWHEEL_API_KEY_SANDBOX: z.string().optional(),
});

export const serverEnv = serverSchema.parse(process.env);
