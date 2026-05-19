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

   Fill in:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from the Supabase dashboard (Project Settings → API).
   - Other keys (Clerk, Anthropic, Plaid, Pinwheel) as their respective accounts come online. They're optional for day 1.

4. Link the Supabase project (one time):
   ```
   pnpm supabase login
   pnpm supabase link --project-ref mpndtkpjmdvrcjsltmaw
   ```

5. Apply the initial migration:
   ```
   pnpm supabase db push
   ```

6. Generate the TypeScript types from the live schema:
   ```
   pnpm supabase:types
   ```

7. Run the dev server:
   ```
   pnpm dev
   ```

8. Verify health: open `http://localhost:3000/api/health` — should return `{"status":"ok",...}`.

## What's in this scaffold (day 1, week 1)

- Next.js 14 App Router with TypeScript and Tailwind
- Supabase clients for server and browser
- Initial schema with the eight consent categories, notice-version registry, profiles, tax-document lifecycle, parsed-tax-fields table with deliberate SSN omissions, immutable income-outputs table, vendor-terms-versions table, GPC-signal log
- Type-safe env loader (Zod) with required/optional validation
- `/api/health` endpoint exercising the DB connection
- Placeholder landing page

## What's NOT in this scaffold (added in later specs)

- Clerk authentication wiring (spec v2)
- DEMO banner in the root layout (spec v2)
- GPC detection middleware (spec v2)
- Dashboard scaffold (spec v3)
- Income-calc engine integration (spec v4)
- Plaid integration (week 3)
- Tax-return upload + LLM extraction (week 4)
- Pinwheel integration (week 6)

## Architecture references

- `../Briefed Engineering Architect/scaffold-spec-v1.md` — this scaffold spec
- `../Briefed CPO/regulatory-architecture-v1.md` — Path A/B framework
- `../Briefed CPO/privacy-notice-work-list-v1.md` — operational obligations the schema reflects
- `../Briefed CPO/poc-build-plan-v1.md` — week-by-week build sequence
