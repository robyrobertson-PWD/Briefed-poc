-- ============================================================
-- Briefed POC — Initial Schema
-- Migration: 20260519000000_initial_schema
-- Drafted by: Engineering Architect agent
-- Companion: regulatory-architecture-v1.md, privacy-notice-work-list-v1.md
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- profiles
-- Extends Clerk user identity with app-specific fields.
-- One row per user. Clerk user_id is the canonical identifier.
-- ============================================================
create table public.profiles (
  id uuid primary key default uuid_generate_v4(),
  clerk_user_id text unique not null,
  email text,
  employment_type text check (employment_type in ('w2', '1099', 'sole_prop', 's_corp', 'partnership', 'mixed', 'unspecified')),
  state_residence text check (length(state_residence) = 2),
  status text not null default 'active' check (status in ('active', 'closed', 'deleted_pending')),
  -- Former-customer state per GLBA §1016.6(a)(5). We do not hard-delete profiles
  -- on account closure; we transition them to status='closed' and continue applying
  -- the privacy-notice terms in force at signup. Hard delete is initiated via a
  -- separate deletion flow that goes through 'deleted_pending' first.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  deletion_requested_at timestamptz
);
create index profiles_clerk_user_id_idx on public.profiles(clerk_user_id);
create index profiles_status_idx on public.profiles(status);

-- ============================================================
-- notice_versions
-- Registry of every privacy notice version that has been live.
-- Consent grants reference these so every consent record is permanently
-- bound to the notice text in effect at the moment of the grant.
-- ============================================================
create table public.notice_versions (
  id uuid primary key default uuid_generate_v4(),
  version text unique not null,                -- e.g., 'v0.2', 'v1.0'
  effective_at timestamptz not null,
  superseded_at timestamptz,                   -- null = current
  notice_url text,                             -- public URL where the notice was live
  notice_sha256 text not null,                 -- hash of the rendered notice content for tamper-evidence
  created_at timestamptz not null default now()
);
create index notice_versions_effective_at_idx on public.notice_versions(effective_at);

-- The POC operates under a 'DEMO-v0' notice version. Real notice goes live at MVP.
insert into public.notice_versions (version, effective_at, notice_sha256)
values ('DEMO-v0', now(), 'demo-poc-no-real-notice-in-effect');

-- ============================================================
-- consent_categories
-- The eight consent categories enumerated in privacy-notice-work-list-v1.md §3.
-- Each is a separate toggle in the consent UI. No bundled "I agree to all."
-- ============================================================
create table public.consent_categories (
  id text primary key,                         -- stable slug
  display_name text not null,
  description text not null,
  is_sensitive boolean not null default false,
  introduced_in_version text not null references public.notice_versions(version),
  retired_in_version text references public.notice_versions(version)
);

insert into public.consent_categories (id, display_name, description, is_sensitive, introduced_in_version) values
  ('identifiers',      'Identifiers',                  'Name, email, phone, account ID.',                                  false, 'DEMO-v0'),
  ('bank',             'Bank account data',            'Transaction and balance data from your bank, via Plaid.',          false, 'DEMO-v0'),
  ('payroll',          'Payroll data',                 'Pay stub and employment data from your payroll provider.',        false, 'DEMO-v0'),
  ('tax_return',       'Tax return data',              'Income and deduction data parsed from your uploaded tax returns.',true,  'DEMO-v0'),
  ('bureau_v15',       'Credit bureau data (v1.5)',    'Credit-report data from a consumer reporting agency. Not yet in use.', true, 'DEMO-v0'),
  ('ssn_identity',     'SSN for identity verification','Last 4 of your SSN, used only to confirm identity, then discarded.', true, 'DEMO-v0'),
  ('derived_income',   'Derived income calculation',   'Our calculated qualifying-income output, retained on your behalf.', false, 'DEMO-v0'),
  ('marketing',        'Marketing communications',     'Product updates and educational emails. You can opt out anytime.', false, 'DEMO-v0');

-- ============================================================
-- consents
-- IMMUTABLE, APPEND-ONLY audit log of every consent grant and revocation.
-- No UPDATE, no DELETE. The current consent state for a (user, category) pair
-- is derived by selecting the most recent row.
-- Counsel item: privacy-notice-work-list-v1.md §1 (consent audit log).
-- Architectural rule: enforced via RLS plus application-level discipline.
-- ============================================================
create table public.consents (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  category_id text not null references public.consent_categories(id),
  action text not null check (action in ('grant', 'revoke')),
  notice_version text not null references public.notice_versions(version),
  -- The exact UI surface and rendered text the user saw when consenting.
  -- Hash of the rendered consent string is captured for tamper-evidence.
  ui_surface text not null,                    -- e.g., 'signup_flow', 'settings_privacy_page'
  consent_text_sha256 text not null,
  ip_address inet,
  user_agent text,
  gpc_signal_present boolean not null default false,
  created_at timestamptz not null default now()
);
create index consents_profile_category_idx on public.consents(profile_id, category_id, created_at desc);
create index consents_created_at_idx on public.consents(created_at);

-- ============================================================
-- vendor_terms_versions
-- Tracks the reuse-limitation posture in effect with each vendor at the time
-- of any data ingestion. When a user's bank data flows from Plaid to us, the
-- bank_connections row references the vendor_terms_versions row that was
-- active for Plaid at the moment of connection. This is how we answer
-- "what reuse posture were we under when this user's data was ingested" in a
-- regulator-readable way.
-- Companion: privacy-notice-work-list-v1.md §4 (vendor agreement work).
-- ============================================================
create table public.vendor_terms_versions (
  id uuid primary key default uuid_generate_v4(),
  vendor text not null check (vendor in ('plaid', 'pinwheel', 'anthropic', 'tax_doc_vendor')),
  terms_version text not null,                 -- our internal naming, e.g., 'plaid-2026-05-19'
  effective_at timestamptz not null,
  superseded_at timestamptz,
  reuse_posture text not null,                 -- short label, e.g., 'service-provider-no-model-training'
  terms_doc_url text,                          -- internal pointer to the executed agreement
  created_at timestamptz not null default now(),
  unique (vendor, terms_version)
);

-- Seed a DEMO posture so POC ingestions reference a real row.
insert into public.vendor_terms_versions (vendor, terms_version, effective_at, reuse_posture)
values
  ('plaid',          'demo-sandbox-default',    now(), 'sandbox-no-real-data'),
  ('pinwheel',       'demo-sandbox-default',    now(), 'sandbox-no-real-data'),
  ('anthropic',      'demo-default',            now(), 'service-provider-no-training'),
  ('tax_doc_vendor', 'demo-default',            now(), 'service-provider-not-selected');

-- ============================================================
-- bank_connections
-- One row per Plaid Item linked by a user. Populated in week 3.
-- ============================================================
create table public.bank_connections (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  plaid_item_id text unique not null,
  plaid_access_token_encrypted text not null,  -- encrypted at rest; never logged
  institution_name text,
  account_type text,
  vendor_terms_version_id uuid not null references public.vendor_terms_versions(id),
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz
);
create index bank_connections_profile_idx on public.bank_connections(profile_id);

-- ============================================================
-- tax_documents
-- Raw uploaded tax-return file metadata. The actual file blob lives in Supabase
-- Storage (bucket: 'tax-documents-raw'); this table tracks the lifecycle.
-- Default retention: 30 days after parse_completed_at. A scheduled job (out of
-- scope for this spec) reads delete_after and removes the storage blob.
-- Companion: regulatory-architecture-v1.md (tax return ingestion section).
-- ============================================================
create table public.tax_documents (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null,                  -- path in Supabase Storage
  filename text not null,
  size_bytes bigint not null,
  mime_type text not null,
  tax_year integer not null,
  vendor_terms_version_id uuid not null references public.vendor_terms_versions(id),
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsing', 'completed', 'failed')),
  uploaded_at timestamptz not null default now(),
  parse_completed_at timestamptz,
  delete_after timestamptz not null default (now() + interval '30 days'),
  deleted_at timestamptz                       -- set when the raw blob is purged
);
create index tax_documents_profile_idx on public.tax_documents(profile_id);
create index tax_documents_delete_after_idx on public.tax_documents(delete_after) where deleted_at is null;

-- ============================================================
-- parsed_tax_fields
-- Derived fields extracted from a tax_documents row by the LLM extraction step.
-- Survives the raw-document deletion at delete_after.
-- DELIBERATELY OMITTED COLUMNS:
--   - filer_ssn, spouse_ssn, dependent_ssns, dependent_names, dependent_dobs
-- These fields appear on the 1040 but are extracted only to verify document
-- authenticity at parse time and discarded immediately. They are never written
-- to this table, never logged, never persisted in any form. The schema makes
-- this architectural — there is no column they could land in.
-- Companion: regulatory-architecture-v1.md (SSN handling, COPPA exposure),
--            privacy-notice-work-list-v1.md §3 (SPI handling discipline).
-- ============================================================
create table public.parsed_tax_fields (
  id uuid primary key default uuid_generate_v4(),
  tax_document_id uuid not null references public.tax_documents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  tax_year integer not null,
  filing_status text,                          -- single, mfj, mfs, hoh, qw
  -- Income components — exhaustive enumeration deliberately deferred to spec v3
  -- (income-calc engine integration). For day 1, schema accepts a JSON blob of
  -- extracted fields keyed by a stable taxonomy the Income-Calc Specialist agent
  -- maintains. The blob shape is constrained by application-level validation,
  -- not by SQL schema, to allow iteration during week 2.
  extracted_fields jsonb not null default '{}'::jsonb,
  extraction_model text,                       -- e.g., 'claude-sonnet-4-6'
  extraction_confidence_overall numeric(3,2),  -- 0.00 to 1.00
  user_confirmation_status text not null default 'pending' check (user_confirmation_status in ('pending', 'confirmed', 'corrected', 'rejected')),
  user_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index parsed_tax_fields_profile_idx on public.parsed_tax_fields(profile_id);
create index parsed_tax_fields_tax_document_idx on public.parsed_tax_fields(tax_document_id);

-- ============================================================
-- income_outputs
-- Every verified-income calculation we have ever shown to a user.
-- IMMUTABLE — each new calculation creates a new row, never updates an existing
-- one. This supports the §1681g-style file-disclosure endpoint and the future
-- Path B reinvestigation surface.
-- Companion: regulatory-architecture-v1.md (Path B build, §1681g hook).
-- ============================================================
create table public.income_outputs (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  -- Inputs that produced this output, captured as references and a hash
  input_tax_document_ids uuid[] not null default '{}',
  input_bank_connection_ids uuid[] not null default '{}',
  input_snapshot_sha256 text not null,         -- hash of canonical input bundle for reproducibility

  -- Engine and rules versions in effect at calculation time
  engine_version text not null,                -- e.g., 'engine-v0.1.0'
  rules_version text not null,                 -- e.g., 'rules-v0.1.0'

  -- Output payload
  qualifying_income_monthly numeric(12,2) not null,
  qualifying_income_annual numeric(12,2) not null,
  applied_addbacks jsonb not null default '[]'::jsonb,  -- array of named add-back records
  applied_haircuts jsonb not null default '[]'::jsonb,
  output_explanation text,                     -- human-readable summary shown in the aha screen

  -- Display tracking — for the §1681g-style "what did we show you" disclosure
  displayed_to_user_at timestamptz not null default now(),
  display_surface text not null,               -- e.g., 'aha_screen', 'dashboard_capacity_pillar'

  created_at timestamptz not null default now()
);
create index income_outputs_profile_idx on public.income_outputs(profile_id, displayed_to_user_at desc);

-- ============================================================
-- gpc_signals
-- Append-only log of Global Privacy Control header detection at every Service
-- surface. Required by privacy-notice-work-list-v1.md §1 (GPC detection at
-- every Service surface) and counsel item 12(d).
-- Implementation of the GPC middleware that writes to this table is spec v2.
-- ============================================================
create table public.gpc_signals (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references public.profiles(id) on delete set null,  -- null for unauthenticated surfaces
  session_id text,                             -- best-effort session correlation
  request_path text not null,
  gpc_header_value text not null,              -- the raw Sec-GPC header value
  ip_address inet,
  user_agent text,
  observed_at timestamptz not null default now()
);
create index gpc_signals_profile_idx on public.gpc_signals(profile_id, observed_at desc);

-- ============================================================
-- Row Level Security (RLS) — enabled on every table that contains user data.
-- Policies will be authored in spec v2 alongside the Clerk JWT integration.
-- For day 1 we enable RLS but DO NOT add permissive policies — this means no
-- access at all from the anon key. The service-role key (server-only) bypasses
-- RLS and is what the /api/health endpoint uses for the connection check.
-- This is intentional: the app cannot leak data through the anon key on day 1
-- because there are no permissive policies and no real data anyway.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.bank_connections enable row level security;
alter table public.tax_documents enable row level security;
alter table public.parsed_tax_fields enable row level security;
alter table public.income_outputs enable row level security;
alter table public.gpc_signals enable row level security;

-- Reference tables (read-only catalogs) keep RLS enabled but with a permissive
-- read policy so the app can show the categories and notice versions to users.
alter table public.notice_versions enable row level security;
alter table public.consent_categories enable row level security;
alter table public.vendor_terms_versions enable row level security;

create policy "notice_versions are world-readable" on public.notice_versions for select using (true);
create policy "consent_categories are world-readable" on public.consent_categories for select using (true);
create policy "vendor_terms_versions are world-readable" on public.vendor_terms_versions for select using (true);

-- ============================================================
-- updated_at trigger helper
-- ============================================================
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger parsed_tax_fields_touch_updated_at before update on public.parsed_tax_fields
  for each row execute function public.touch_updated_at();

-- ============================================================
-- End of migration 20260519000000_initial_schema
-- ============================================================
