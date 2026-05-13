-- ===========================================================================
-- PROJ-34 ε.β — CIA-L7 vollständig: Purpose-scoped Cost-Caps
-- ===========================================================================
-- Extends `tenant_ai_cost_caps` with a nullable `purpose` column so the
-- router can apply different caps per AI purpose (coaching, sentiment,
-- narrative, risks). Existing rows keep `purpose = NULL` and act as the
-- shared default — backwards-compatible: every existing AI path continues
-- working without configuration changes.
--
-- Locked 2026-05-13. Coaching is the first purpose with its own cap; other
-- purposes (sentiment, narrative, risks) opt in by inserting a row with
-- the matching purpose value.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Add nullable `purpose` column. Backfills NULL for existing rows.
-- ---------------------------------------------------------------------------
alter table public.tenant_ai_cost_caps
  add column if not exists purpose text;

alter table public.tenant_ai_cost_caps
  drop constraint if exists tenant_ai_cost_caps_purpose_check;
alter table public.tenant_ai_cost_caps
  add constraint tenant_ai_cost_caps_purpose_check
  check (
    purpose is null or purpose in (
      'risks','decisions','work_items','open_items',
      'narrative','sentiment','coaching'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Swap PK: from `tenant_id` (single-row-per-tenant) to synthetic `id`
--    plus a `(tenant_id, purpose) NULLS NOT DISTINCT` uniqueness constraint
--    so the NULL-purpose "default" row coexists with per-purpose rows.
-- ---------------------------------------------------------------------------
alter table public.tenant_ai_cost_caps
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.tenant_ai_cost_caps
  drop constraint if exists tenant_ai_cost_caps_pkey;

alter table public.tenant_ai_cost_caps
  add constraint tenant_ai_cost_caps_pkey primary key (id);

alter table public.tenant_ai_cost_caps
  drop constraint if exists tenant_ai_cost_caps_tenant_purpose_unique;
-- PG15+ allows NULLS NOT DISTINCT — Supabase runs PG17, fully supported.
alter table public.tenant_ai_cost_caps
  add constraint tenant_ai_cost_caps_tenant_purpose_unique
  unique nulls not distinct (tenant_id, purpose);

-- ---------------------------------------------------------------------------
-- 3. Index on (tenant_id, purpose) for the router lookup path
-- ---------------------------------------------------------------------------
create index if not exists tenant_ai_cost_caps_lookup_idx
  on public.tenant_ai_cost_caps (tenant_id, purpose);
