-- ============================================================
-- Briefed POC — Income-calc engine foundation (spec v6, PR 1)
-- Migration: 20260526010000_income_calc_engine_foundation
-- Drafted by: Engineering Architect agent; executed by Cody per spec v6.
-- ============================================================
-- Forward-only. Two additions, no rewrites:
--   1) ADD COLUMNs on income_outputs to carry the engine's full output shape
--      (missing_inputs, method_results, flags, income_components, reported_gross_1099).
--      All defaulted; income_outputs remains IMMUTABLE / append-only.
--   2) CREATE TABLE borrower_inputs — user-supplied values that did not come
--      from a parsed document (employment_type confirmation, variable-income
--      prior-year amounts, 1099 imputed-net estimates). Append-only by
--      convention; RLS-scoped read-own, writes via service-role.
--
-- DO NOT edit prior migrations. Companion: spec-v6-income-calc-engine.md,
-- /Briefed CPO/v6-rules-doc-rules-v0.1.0.md (rules-v0.1.0).
-- ============================================================

-- ============================================================
-- 1. income_outputs — engine output shape additions
-- ============================================================
-- All new columns are NULL-safe defaults so existing rows (if any) remain valid
-- without backfill. income_outputs is append-only; future engine runs write rows
-- with these columns populated. The numeric column reported_gross_1099 is
-- nullable on purpose: it's set only on 1099 paths and is INFORMATIONAL — never
-- qualifying income (see rules-v0.1.0 §6.17-6.19).
alter table public.income_outputs
  add column missing_inputs jsonb not null default '[]'::jsonb,
  add column method_results jsonb not null default '{}'::jsonb,
  add column flags jsonb not null default '[]'::jsonb,
  add column income_components jsonb,
  add column reported_gross_1099 numeric(12,2);

comment on column public.income_outputs.missing_inputs is
  'Structured list of inputs the engine expected but did not receive (rules-v0.1.0 §6.20). Each entry: {scope, field, severity: critical|informational, reason}. Informational — does NOT change the qualifying figure.';
comment on column public.income_outputs.method_results is
  'Dual-agency presentation (rules-v0.1.0 §6.21): {fannie_monthly, freddie_monthly, fannie_annual, freddie_annual}. Both shown, no lower-of selection.';
comment on column public.income_outputs.flags is
  'Informational flags: has_missing_inputs, pending_schedule_c, user_imputed_unverified, commission_ge_25pct_requires_tax_returns, 1099_accepted_as_supporting_document, 1099_income_derived_from_schedule_c, insufficient_history_self_employment, documentation_incomplete, employment_type_pending, not_yet_supported. NOT blockers.';
comment on column public.income_outputs.income_components is
  'Optional W-2 breakdown: [{name: base|overtime|bonus|commission, monthly: NUMERIC}]. Null for non-W-2 paths.';
comment on column public.income_outputs.reported_gross_1099 is
  'Gross 1099 nonemployee compensation, retained as a supporting-document figure. NEVER qualifying income (rules-v0.1.0 §6.17-6.19).';

-- ============================================================
-- 2. borrower_inputs — first-class home for user-supplied values
-- ============================================================
-- Append-only by convention. Engine reads the LATEST row per
-- (profile_id, scope, field, tax_year) at calc time. Revisions don't UPDATE;
-- they INSERT. Same invariant as income_outputs and consents.
--
-- scope/field share the namespace used by missing_inputs entries on
-- income_outputs (rules-v0.1.0 §6.20), so the UI uses one addressing scheme:
-- a missing_inputs entry like {scope: 'user_imputed:2024', field: 'estimated_net_profit'}
-- becomes a direct write target into this table when the borrower fills it in.
--
-- created_via is intentionally narrow for Phase 1: 'confirmation_step' (typed
-- in the confirmation UI) and 'manual_entry' (free-form, no prior extraction).
-- 'loan_officer_override' and 'underwriter_correction' are reserved for Phase 2
-- so this column doesn't need a migration when those roles land.
create table public.borrower_inputs (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete restrict,

  scope text not null,            -- e.g. 'profile', 'paystub', 'tax_return:2024', 'user_imputed:2024', 'variable_income.overtime'
  field text not null,            -- e.g. 'employment_type', 'estimated_net_profit', 'prior_year_amount'
  tax_year smallint,              -- nullable; populated when scope encodes a tax year
  value jsonb not null,           -- wrapped jsonb so numeric/string/boolean values all fit

  created_via text not null
    check (created_via in ('confirmation_step', 'manual_entry')),
  created_at timestamptz not null default now()
);

-- Lookup pattern: "latest value for (profile_id, scope, field, tax_year)".
-- Composite index ordered to match that scan; created_at desc lets the engine
-- pick the most recent row without sorting.
create index borrower_inputs_lookup_idx
  on public.borrower_inputs(profile_id, scope, field, tax_year, created_at desc);
create index borrower_inputs_profile_idx
  on public.borrower_inputs(profile_id);

comment on table public.borrower_inputs is
  'Append-only store of borrower-supplied values that did NOT come from a parsed document (employment_type confirmation, variable-income prior-year figures, 1099 imputed-net estimates). Engine reads latest row per (profile_id, scope, field, tax_year). Shares the scope/field namespace with income_outputs.missing_inputs so the UI uses one addressing scheme. Forward-compatible with MISMO 3.4 Layer 2 audit.';

-- ============================================================
-- 3. RLS — user-readable, service-role writes
-- ============================================================
-- Same posture as parsed_document_fields and income_documents: a user reads
-- their own rows; writes go server-side via the service-role client (bypasses
-- RLS). NO INSERT/UPDATE/DELETE policy is added — those remain denied to the
-- anon/user role.
alter table public.borrower_inputs enable row level security;
create policy "borrower_inputs: read own" on public.borrower_inputs
  for select using (profile_id = public.current_profile_id());

-- ============================================================
-- End of migration 20260526010000_income_calc_engine_foundation
-- ============================================================
