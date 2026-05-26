import { defineConfig } from "vitest/config";
import path from "node:path";

// Inject placeholder env vars at config load — earlier than Vite's import
// graph resolution. lib/env/server.ts validates process.env with zod at
// module-load time, so the engine's transitive load chain
// (test → engine → @/lib/supabase/server → @/lib/env/server) would crash
// without these. NEVER put real secrets here; these are explicit
// 'test-only-not-real-*' placeholders the engine never reaches at runtime
// (compute() is pure; Supabase/Anthropic are only invoked inside the
// server-only assembleInput/runAndPersist functions, which the fixtures
// harness does not call).
const TEST_PLACEHOLDERS: Record<string, string> = {
  SUPABASE_SERVICE_ROLE_KEY: "test-only-not-real-svc-role",
  CLERK_SECRET_KEY: "test-only-not-real-clerk-secret",
  ANTHROPIC_API_KEY: "test-only-not-real-anthropic",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-only-not-real-anon",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_only_not_real",
};
for (const [k, v] of Object.entries(TEST_PLACEHOLDERS)) {
  if (!process.env[k]) process.env[k] = v;
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // No Next.js plugin — keeps tests fast and avoids pulling app code.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // The `server-only` package throws "cannot be imported from a Client
      // Component" at import time, which trips Vitest when it loads
      // lib/income-calc/engine.ts. Shim it with a no-op so we can test the
      // pure compute() path. The real package's protection still applies
      // during `next build`, which is what enforces the import-graph rule
      // (no "use client" file can import server-only modules).
      "server-only": path.resolve(__dirname, "tests/setup/server-only-shim.ts"),
    },
  },
});
