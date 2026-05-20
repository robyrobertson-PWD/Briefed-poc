-- ============================================================
-- Briefed POC — RLS Policies (spec-v2-auth-and-rls)
-- Migration: 20260520000000_rls_policies
-- Drafted by: Engineering Architect agent; executed by Claude Code per spec v2 §7.
-- ============================================================
-- Reads scoped to the authenticated user's own profile.
-- Clerk identity arrives as auth.jwt() ->> 'sub' (the Clerk user ID), via the
-- native Supabase third-party auth integration with Clerk.
--
-- Writes are server-side via the service-role client (bypasses RLS), so this
-- migration adds SELECT policies only. INSERT/UPDATE/DELETE remain denied to
-- the anon/user role by default (no policy = no access under RLS).
--
-- Companion: spec-v2-auth-and-rls.md §7, regulatory-architecture-v1.md.
-- ============================================================

-- ============================================================
-- Helper: the profile id of the current Clerk user, or NULL if none.
-- SECURITY DEFINER so it can read profiles regardless of the caller's policies,
-- which keeps each child-table policy a simple equality check on profile_id.
-- ============================================================
create or replace function public.current_profile_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.profiles where clerk_user_id = (auth.jwt() ->> 'sub') limit 1;
$$;

-- ============================================================
-- profiles: a user can read their own row.
-- ============================================================
create policy "profiles: read own" on public.profiles
  for select using (clerk_user_id = (auth.jwt() ->> 'sub'));

-- ============================================================
-- Child tables: a user can read rows belonging to their profile.
-- ============================================================
create policy "consents: read own" on public.consents
  for select using (profile_id = public.current_profile_id());

create policy "bank_connections: read own" on public.bank_connections
  for select using (profile_id = public.current_profile_id());

create policy "tax_documents: read own" on public.tax_documents
  for select using (profile_id = public.current_profile_id());

create policy "parsed_tax_fields: read own" on public.parsed_tax_fields
  for select using (profile_id = public.current_profile_id());

create policy "income_outputs: read own" on public.income_outputs
  for select using (profile_id = public.current_profile_id());

create policy "gpc_signals: read own" on public.gpc_signals
  for select using (profile_id = public.current_profile_id());

-- ============================================================
-- End of migration 20260520000000_rls_policies
-- ============================================================
