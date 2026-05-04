-- =============================================================================
-- PROJ-32 Phase 32-c-γ — Fix nonempty-CHECK on tenant_ai_provider_priority
-- =============================================================================
-- The original CHECK used `array_length(provider_order, 1) >= 1`, but
-- Postgres returns NULL from `array_length` on an empty array, and NULL
-- comparisons are treated as pass by CHECK (the constraint only rejects
-- a row when the expression is explicitly FALSE).
--
-- Switching to `cardinality(provider_order) >= 1` — `cardinality` returns
-- 0 for empty arrays, so 0 >= 1 evaluates to FALSE and the CHECK
-- correctly rejects the row.
--
-- Caught by the 32-c-γ red-team smoke test.
-- =============================================================================
alter table public.tenant_ai_provider_priority
  drop constraint tenant_ai_provider_priority_nonempty;

alter table public.tenant_ai_provider_priority
  add constraint tenant_ai_provider_priority_nonempty
    check (cardinality(provider_order) >= 1);
