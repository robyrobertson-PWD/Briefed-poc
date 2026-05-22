-- ============================================================
-- Briefed POC — Private Storage bucket for raw income documents (spec v5)
-- Migration: 20260522010000_income_documents_storage
-- ============================================================
-- PRIVATE bucket. No policies are added on storage.objects for this bucket, so
-- under Storage RLS the anon/user role gets NO direct access. All reads/writes
-- go through the service-role client (which bypasses RLS) or short-lived signed
-- URLs minted server-side. This keeps raw paystubs / tax returns / bank
-- statements off any client-reachable path. Companion: spec-v5 §6 (security).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('income-documents-raw', 'income-documents-raw', false)
on conflict (id) do nothing;
