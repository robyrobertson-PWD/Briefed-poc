-- ============================================================
-- Briefed POC — Generalize income documents (spec v4)
-- Migration: 20260522000000_generalize_income_documents
-- Drafted by: Engineering Architect agent; executed by Cody per spec v4.
-- ============================================================
-- Forward-only. Generalizes the tax-return-centric schema to the document-
-- scanning-first income model (CPO directive, 2026-05): paystubs, W-2s, 1099s,
-- tax returns, and bank statements are all first-class inputs. Adds SCHEMA-ONLY
-- scaffolding (no business logic this spec) for document fraud signals and the
-- human-in-the-loop review queue the directive's guardrails require.
--
-- DO NOT edit the already-applied migrations (initial_schema, rls_policies).
-- Companion: spec-v4-schema-generalization.md, Briefed CPO/project-instructions.md.
-- ============================================================

-- ============================================================
-- 1. tax_documents -> income_documents
-- ============================================================
alter table public.tax_documents rename to income_documents;

-- document_type: what kind of income evidence this file is. Table is expected to
-- be EMPTY (no upload flow shipped), so the NOT NULL add is safe. If db push
-- errors on pre-existing rows, backfill document_type first, then re-run.
alter table public.income_documents
  add column document_type text not null
  check (document_type in ('paystub','w2','form_1099','tax_return','bank_statement','other'));

-- tax_year only applies to tax returns; relax it for the other document types.
alter table public.income_documents alter column tax_year drop not null;

-- Period the document covers (paystub pay period, bank-statement period).
alter table public.income_documents add column period_start date;
alter table public.income_documents add column period_end date;

-- Rename indexes to match the new table name.
alter index public.tax_documents_profile_idx rename to income_documents_profile_idx;
alter index public.tax_documents_delete_after_idx rename to income_documents_delete_after_idx;

-- New: query documents by type.
create index income_documents_type_idx on public.income_documents(document_type);

comment on table public.income_documents is
  'Raw uploaded income-evidence files (paystubs, W-2s, 1099s, tax returns, bank statements). Blob lives in Supabase Storage; this table tracks lifecycle + retention. Generalized from tax_documents in spec v4.';

-- ============================================================
-- 2. parsed_tax_fields -> parsed_document_fields
-- ============================================================
alter table public.parsed_tax_fields rename to parsed_document_fields;

-- The FK column now points at any income document, not just tax returns.
alter table public.parsed_document_fields rename column tax_document_id to income_document_id;
alter table public.parsed_document_fields
  rename constraint parsed_tax_fields_tax_document_id_fkey
  to parsed_document_fields_income_document_id_fkey;

-- tax_year is tax-return-only; relax it. (filing_status is already nullable.)
alter table public.parsed_document_fields alter column tax_year drop not null;

-- Rename indexes + the updated_at trigger.
alter index public.parsed_tax_fields_profile_idx rename to parsed_document_fields_profile_idx;
alter index public.parsed_tax_fields_tax_document_idx rename to parsed_document_fields_document_idx;
alter trigger parsed_tax_fields_touch_updated_at on public.parsed_document_fields
  rename to parsed_document_fields_touch_updated_at;

-- SSN-OMISSION DISCIPLINE PRESERVED: filer_ssn, spouse_ssn, dependent_ssns,
-- dependent_names, dependent_dobs remain deliberately absent. No column exists
-- for them and none is added here.

comment on table public.parsed_document_fields is
  'Structured fields extracted by the Claude API from an income_documents row. Survives raw-document deletion at delete_after. extracted_fields jsonb taxonomy owned by the Income-Calc Specialist. Generalized from parsed_tax_fields in spec v4.';

-- ============================================================
-- 3. income_review_queue (human-in-the-loop scaffolding)
-- ============================================================
-- Guardrail: every customer-facing income decision must stay reviewable
-- (modeled 5% manual-review rate). Holds candidate calculations awaiting human
-- approval. SCHEMA ONLY this spec — no review UI, no promotion logic.
-- INTERNAL: not user-facing (no RLS read policy added below).
create table public.income_review_queue (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  parsed_document_field_id uuid references public.parsed_document_fields(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','needs_correction')),
  candidate_payload jsonb not null default '{}'::jsonb,  -- proposed calc awaiting review
  reviewer_id text,            -- internal reviewer identity (free text for POC; not a profile)
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index income_review_queue_status_idx on public.income_review_queue(status, created_at);
create index income_review_queue_profile_idx on public.income_review_queue(profile_id);

create trigger income_review_queue_touch_updated_at before update on public.income_review_queue
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 4. document_fraud_signals (tamper / consistency scaffolding)
-- ============================================================
-- Reserves a home for tamper checks, cross-document consistency findings, and
-- fraud scores. SCHEMA ONLY this spec — detection logic deferred to MVP.
-- INTERNAL: not user-facing (no RLS read policy added below). Append-only by convention.
create table public.document_fraud_signals (
  id uuid primary key default uuid_generate_v4(),
  income_document_id uuid not null references public.income_documents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  signal_type text not null,   -- e.g. 'metadata_tamper','cross_document_consistency','font_anomaly','duplicate_detection'
  signal_result jsonb not null default '{}'::jsonb,
  severity text not null default 'info'
    check (severity in ('info','low','medium','high','critical')),
  detector_version text,
  created_at timestamptz not null default now()
);
create index document_fraud_signals_document_idx on public.document_fraud_signals(income_document_id);
create index document_fraud_signals_profile_idx on public.document_fraud_signals(profile_id);

-- ============================================================
-- 5. income_outputs — generalize inputs + link to review
-- ============================================================
alter table public.income_outputs rename column input_tax_document_ids to input_document_ids;

-- Which review approved this output (null until the review workflow is built).
-- income_outputs remains IMMUTABLE / append-only; this column is set at insert.
alter table public.income_outputs
  add column source_review_id uuid references public.income_review_queue(id);

-- ============================================================
-- 6. consent_categories — uploaded income documents (PLACEHOLDER)
-- ============================================================
-- Document-first lets users upload paystubs/1099s/bank statements, which the
-- existing 'tax_return' and provider-based 'payroll'/'bank' categories don't
-- cover. STRUCTURAL PLACEHOLDER so the upload flow has a category to record
-- consent against. FINAL taxonomy + wording (whether to split by doc type, exact
-- display text, sensitivity) is owned by CPO + Regulatory (see spec-v4 §9).
-- Do NOT treat this copy as notice-ready.
insert into public.consent_categories
  (id, display_name, description, is_sensitive, introduced_in_version)
values
  ('income_docs_uploaded',
   'Uploaded income documents',
   'PLACEHOLDER (CPO + Regulatory own final wording): documents you upload — paystubs, 1099s, tax returns, bank statements — that we parse to calculate your income.',
   true, 'DEMO-v0');

-- ============================================================
-- 7. RLS — fix renamed policies + posture for new tables
-- ============================================================
-- Renamed tables keep their policies (attached by OID) but the policy NAMES are
-- now stale. Recreate them with correct names; the using() clause is unchanged.
drop policy "tax_documents: read own" on public.income_documents;
create policy "income_documents: read own" on public.income_documents
  for select using (profile_id = public.current_profile_id());

drop policy "parsed_tax_fields: read own" on public.parsed_document_fields;
create policy "parsed_document_fields: read own" on public.parsed_document_fields
  for select using (profile_id = public.current_profile_id());

-- income_outputs policy is unaffected (table name unchanged; the column rename
-- does not touch its profile_id-based using() clause).

-- New tables are INTERNAL-ONLY: enable RLS, add NO permissive policy. With no
-- policy the anon/user role gets zero rows; only the service-role client (which
-- bypasses RLS) reads/writes them. Deliberate — fraud signals and the review
-- queue must never be reachable through the browser client.
alter table public.income_review_queue enable row level security;
alter table public.document_fraud_signals enable row level security;

-- ============================================================
-- End of migration 20260522000000_generalize_income_documents
-- ============================================================
