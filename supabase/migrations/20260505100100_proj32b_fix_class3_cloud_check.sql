-- =============================================================================
-- PROJ-32-b — fix: Class-3 cloud-block CHECK was hardcoded to 'anthropic'
-- =============================================================================
-- The original 32-c-γ CHECK used:
--   not (provider_order && array['anthropic']::text[])
-- which only rejects 'anthropic'. After 32-b extends the provider whitelist
-- with 'openai' and 'google' (also cloud providers), Class-3 rules with
-- those providers slipped through the CHECK.
--
-- Caught during 32-b red-team smoke test. Fix: change the rejection to
-- the inverse — Class-3 must contain ONLY local providers ({'ollama'}).
-- =============================================================================

alter table public.tenant_ai_provider_priority
  drop constraint tenant_ai_provider_priority_class3_local_only;

alter table public.tenant_ai_provider_priority
  add constraint tenant_ai_provider_priority_class3_local_only
    check (
      data_class <> 3
      or provider_order <@ array['ollama']::text[]
    );
