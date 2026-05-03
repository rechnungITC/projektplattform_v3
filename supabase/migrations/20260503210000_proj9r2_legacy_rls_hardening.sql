-- =============================================================================
-- PROJ-9-Round-2 follow-up — harden the legacy snapshot
-- =============================================================================
-- The `dependencies_legacy` table is the rollback anchor created by the polymorphic
-- migration (`20260503200000_proj9r2_polymorphic_dependencies.sql`). It contains a
-- snapshot of the deployed Round-1 `dependencies` table so we can restore the
-- pre-PROJ-9-R2 state if needed. No application code reads it.
--
-- Supabase advisor (lint 0013) flags the table because RLS is disabled on a public
-- schema table. We comply with the linter by enabling RLS but creating NO policies
-- — that means no role can read or write the table via PostgREST or supabase-js.
-- Service-role bypasses RLS as designed and can still snapshot/restore.
--
-- After we are confident that PROJ-9-R2 is stable (~4 weeks of production runtime),
-- a follow-up migration can DROP the legacy table entirely.
-- =============================================================================

alter table public.dependencies_legacy enable row level security;
revoke select on public.dependencies_legacy from anon, authenticated;

comment on table public.dependencies_legacy is
  'PROJ-9-R2 rollback anchor. RLS enabled with no policies — only service-role can access. Drop after confidence window.';
