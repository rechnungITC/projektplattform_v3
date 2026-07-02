-- =============================================================================
-- PROJ-92 — Azure OpenAI as a fifth provider type (Class-1/2 only)
-- =============================================================================
-- Adds 'azure' to the same four whitelists PROJ-32b touched for OpenAI/Google,
-- in lockstep (pattern: 20260505100000 + 20260505100200):
--   1. tenant_ai_providers.provider          CHECK
--   2. tenant_ai_provider_priority known-providers CHECK
--   3. ki_runs.provider                       CHECK
--   4. record_tenant_ai_provider_audit        RPC validator
--
-- Class-3 invariant #3 stays EXACTLY as-is: the
-- tenant_ai_provider_priority_class3_local_only CHECK
-- ((data_class <> 3) OR (provider_order <@ ARRAY['ollama'])) is deliberately
-- NOT touched. Azure is cloud-resident and remains structurally unselectable
-- for Class-3 — it is not in the local-only set. (PROJ-93 will handle the
-- attested-EU Class-3 path separately.)
--
-- Idempotent: drop-if-exists + add on each CHECK; create-or-replace on the RPC.
-- =============================================================================

-- 1. tenant_ai_providers provider whitelist -------------------------------
alter table public.tenant_ai_providers
  drop constraint if exists tenant_ai_providers_provider_check;

alter table public.tenant_ai_providers
  add constraint tenant_ai_providers_provider_check
    check (provider in ('anthropic', 'ollama', 'openai', 'google', 'azure'));

-- 2. tenant_ai_provider_priority known-providers whitelist ----------------
-- class3_local_only CHECK stays unchanged (azure is cloud → blocked for
-- data_class 3 by the same mechanism as openai/google).
alter table public.tenant_ai_provider_priority
  drop constraint if exists tenant_ai_provider_priority_known_providers;

alter table public.tenant_ai_provider_priority
  add constraint tenant_ai_provider_priority_known_providers
    check (provider_order <@ array['anthropic','ollama','openai','google','azure']::text[]);

-- 3. ki_runs provider CHECK ------------------------------------------------
alter table public.ki_runs
  drop constraint if exists ki_runs_provider_check;

alter table public.ki_runs
  add constraint ki_runs_provider_check
    check (provider = any(array['anthropic','stub','ollama','openai','google','azure']));

-- 4. record_tenant_ai_provider_audit — accept 'azure' ---------------------
-- Body is otherwise byte-identical to the live definition (verified against
-- prod 2026-07-02); only the provider whitelist gains 'azure'.
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

  if p_provider not in ('anthropic', 'ollama', 'openai', 'google', 'azure') then
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