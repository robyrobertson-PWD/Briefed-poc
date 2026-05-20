# Briefed POC

Pre-launch POC for Briefed, a consumer income-verification platform.

**DEMO — NOT FOR PRODUCTION USE.** Sandbox vendor connections, synthetic data, hand-picked beta testers only.

## Local setup

### Prerequisites
- Node.js 24.x (Active LTS as of May 2026; use `nvm use` if you have nvm installed)
- pnpm 9.x — install with `npm install -g pnpm` if needed
- Supabase CLI — installed as a dev dependency, accessed via `pnpm supabase`

### First-time setup

1. Clone the repo:
   ```
   git clone https://github.com/robyrobertson-PWD/Briefed-poc.git
   cd Briefed-poc
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

3. Copy the example env file and populate with real values:
   ```
   cp .env.example .env.local
   ```

   Required for spec v2 (auth):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API.
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk dashboard → API Keys (Briefed POC application).

   Optional until their respective specs land:
   - Anthropic, Plaid, Pinwheel keys.

4. Configure Clerk as a Supabase third-party auth provider (one time, dashboard work):

   This is what lets a Clerk-issued session token authorize Supabase queries and makes `auth.jwt() ->> 'sub'` inside RLS resolve to the Clerk user ID. Verified against the current Clerk + Supabase native-integration docs at spec-v2 implementation time.

   a. **Clerk side.** Open the Clerk dashboard, navigate to the Supabase integration setup at <https://dashboard.clerk.com/setup/supabase>, choose your configuration options, and click **Activate Supabase integration**. This configures Clerk's session token to include the `role` claim with value `authenticated` that Supabase requires.

   b. **Supabase side.** In the Supabase dashboard, go to **Authentication → Sign In / Providers** (URL pattern: <https://supabase.com/dashboard/project/_/auth/third-party>), click **Add provider**, and select **Clerk** from the list. Enter your Clerk Frontend API domain (looks like `something.clerk.accounts.dev` for development instances) when prompted. Save.

   c. Smoke test: after step 9 below, sign up via `/sign-up`, hit `/dashboard`, and confirm it renders your Clerk user ID and a Supabase-provisioned profile ID. If the page errors with an RLS or JWT issue, recheck steps a and b — the integration is what binds the two sides.

5. Link the Supabase project (one time):
   ```
   pnpm supabase login
   pnpm supabase link --project-ref mpndtkpjmdvrcjsltmaw
   ```

6. Apply migrations:
   ```
   pnpm supabase db push
   ```

   The migrations applied are:
   - `20260519000000_initial_schema.sql` — tables, seeds, RLS enabled (no policies on user-data tables yet).
   - `20260520000000_rls_policies.sql` — SELECT-only RLS policies on the seven user-data tables, plus the `current_profile_id()` helper. Reads scoped to the authenticated user's own profile; writes flow through the server-side service-role client.

7. Regenerate the TypeScript types from the live schema:
   ```
   pnpm supabase:types
   ```

8. Run the dev server:
   ```
   pnpm dev
   ```

9. Verify:
   - `http://localhost:3000/` — landing page renders with DEMO banner.
   - `http://localhost:3000/api/health` — returns `{"status":"ok",...}`.
   - `http://localhost:3000/dashboard` (signed out) — redirects to Clerk sign-in.
   - After sign-up → `/dashboard` renders your `clerk_user_id` and `profile_id`.

## What's in the app (through spec v2)

- Next.js 14 App Router with TypeScript and Tailwind
- Supabase clients: service-role for server writes/health; Clerk-aware browser client (`useSupabaseBrowserClient`) for user-scoped reads
- Initial schema with the eight consent categories, notice-version registry, profiles, tax-document lifecycle, parsed-tax-fields table with deliberate SSN omissions, immutable income-outputs table, vendor-terms-versions table, GPC-signal log
- RLS policies on the seven user-data tables, scoped to the authenticated user
- Clerk authentication: provider, middleware (`middleware.ts`), `/sign-in` and `/sign-up` routes
- DEMO banner pinned in the root layout
- Lazy profile provisioning on first authenticated request (`lib/profile.ts`)
- Protected `/dashboard` route proving the chain end to end
- Type-safe env loader split into server-only (`lib/env/server.ts`, guarded by `import "server-only"`) and client-safe (`lib/env/client.ts`)
- `/api/health` endpoint exercising the DB connection

## What's NOT in the app yet (added in later specs)

- GPC detection middleware writing to `gpc_signals` (spec v3)
- Consent-grant UI and consent-logging server action (spec v3)
- Dashboard content — capacity pillar, borrowing-power read, weekly action (design-led, later)
- Income-calc engine integration (spec v4)
- Plaid integration (week 3)
- Tax-return upload + LLM extraction (week 4)
- Pinwheel integration (week 6)

## Architecture references

- `../Briefed Engineering Architect/scaffold-spec-v1.md` — initial scaffold spec
- `../Briefed Engineering Architect/spec-v2-auth-and-rls.md` — auth + RLS
- `../Briefed CPO/regulatory-architecture-v1.md` — Path A/B framework
- `../Briefed CPO/privacy-notice-work-list-v1.md` — operational obligations the schema reflects
- `../Briefed CPO/poc-build-plan-v1.md` — week-by-week build sequence
