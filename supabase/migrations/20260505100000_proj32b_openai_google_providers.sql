-- =============================================================================
-- PROJ-32 Phase 32-b — OpenAI + Google AI Studio providers
-- =============================================================================
-- Extends three CHECK constraints + one RPC validator in lockstep so that
-- 'openai' and 'google' become first-class providers alongside the
-- existing 'anthropic' and 'ollama' from 32-a/32-c.
--
-- Class-3 stays strictly Ollama-only (CIA-locked decision): the Class-3
-- defense-in-depth CHECK on tenant_ai_provider_priority continues to
-- block any cloud provider — both OpenAI and Google are cloud-resident
-- and must never carry Class-3 traffic.
--
-- Locked decisions (/requirements 2026-05-05):
--   * Both providers in one slice (Recommended)
--   * OpenAI validation: GET /v1/models (analog Anthropic)
--   * Google: Gemini API (api_key) — generativelanguage.googleapis.com
--   * Class-3: cloud-only providers blocked (consistent with 32-a/c)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the provider whitelist on tenant_ai_providers
-- ---------------------------------------------------------------------------
alter table public.tenant_ai_providers
  drop constraint tenant_ai_providers_provider_check;

alter table public.tenant_ai_providers
  add constraint tenant_ai_providers_provider_check
    check (provider in ('anthropic', 'ollama', 'openai', 'google'));

-- ---------------------------------------------------------------------------
-- 2. Extend the known-providers whitelist on tenant_ai_provider_priority
-- ---------------------------------------------------------------------------
-- The Class-3 local-only check stays unchanged — both 'openai' and
-- 'google' are cloud providers and remain implicitly blocked because
-- only 'ollama' is in LOCAL_PROVIDERS at the route + DB level.
alter table public.tenant_ai_provider_priority
  drop constraint tenant_ai_provider_priority_known_providers;

alter table public.tenant_ai_provider_priority
  add constraint tenant_ai_provider_priority_known_providers
    check (provider_order <@ array['anthropic','ollama','openai','google']::text[]);

-- ---------------------------------------------------------------------------
-- 3. Update record_tenant_ai_provider_audit to accept the new providers
-- ---------------------------------------------------------------------------
create or replace function public.record_tenant_ai_provider_audit(
  p_tenant_id        uuid,
  p_provider         text,
  p_action           text,
  p_old_fingerprint  text,
  p_new_fingerprint  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  if not public.is_tenant_admin(p_tenant_id) then
    raise exception 'forbidden: caller is not tenant admin'
      using errcode = 'P0003';
  end if;

  if p_action not in ('create','rotate','delete','validate') then
    raise exception 'invalid_action: %', p_action
      using errcode = 'P0001';
  end if;

  if p_provider not in ('anthropic', 'ollama', 'openai', 'google') then
    raise exception 'invalid_provider: %', p_provider
      using errcode = 'P0001';
  end if;

  v_actor := auth.uid();

  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  )
  values (
    p_tenant_id, 'tenant_ai_providers', p_tenant_id,
    p_provider || '_provider',
    case when p_old_fingerprint is null then null
         else jsonb_build_object('fingerprint', p_old_fingerprint) end,
    case when p_new_fingerprint is null then null
         else jsonb_build_object('fingerprint', p_new_fingerprint) end,
    v_actor, p_action
  );
end;
$$;
