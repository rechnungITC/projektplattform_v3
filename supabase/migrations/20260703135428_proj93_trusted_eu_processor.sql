-- =============================================================================
-- PROJ-93 — Trusted-EU-Processor: controlled, opt-in Class-3 freigabe for
-- DPA-attested Azure OpenAI (EU-resident, tenant's own Azure tenant).
-- =============================================================================
-- Loosens Invariant #3 ONLY for attested Azure. Without an attest, NOTHING
-- changes: the resolver still returns ['ollama'] for Class-3.
--
-- Defense-in-depth (all three layers stay; only the DB layer becomes
-- DPA-conditional — architecture-CIA 2026-07-03):
--   * Layer 1+2 (TS resolver) is the AUTHORITATIVE gate at request time
--     (see key-resolver.ts). It checks attest AND EU-region and re-evaluates
--     on every call, so a revoked attest takes effect immediately without
--     touching tenant_ai_provider_priority (R-1).
--   * Layer 3 (DB) is a NECESSARY-BUT-NOT-SUFFICIENT prelude: a structural
--     anti-scope floor CHECK (only ollama/azure ever allowed for Class-3, so
--     openai/anthropic/google stay impossible even if the trigger fails — R-4)
--     PLUS a DPA-conditional write trigger. The DB cannot read azure_region
--     (it lives inside encrypted_config, bytea) — region-EU is guaranteed by
--     the PROJ-92 save-path and re-checked by the resolver.
--
-- Idempotent throughout (add-if-not-exists / drop-then-add / create-or-replace).
-- =============================================================================

-- 1. DPA attest columns on tenant_ai_providers (plaintext governance metadata,
--    NOT secret → must be plaintext so the trigger/helper can read them; the
--    Azure key + azure_region stay inside encrypted_config).
alter table public.tenant_ai_providers
  add column if not exists dpa_confirmed_at timestamptz,
  add column if not exists dpa_confirmed_by uuid,
  add column if not exists dpa_reference    text;

comment on column public.tenant_ai_providers.dpa_confirmed_at is
  'PROJ-93: when a tenant admin attested a DPA for this (azure) provider. NULL = no attest = Class-3 stays Ollama-only.';
comment on column public.tenant_ai_providers.dpa_confirmed_by is
  'PROJ-93: tenant admin (auth.uid) who recorded the DPA attest.';
comment on column public.tenant_ai_providers.dpa_reference is
  'PROJ-93: DPA contract reference/number (no document upload in MVP).';

-- Coherence: attest fields are all-or-nothing AND only Azure may carry a DPA.
alter table public.tenant_ai_providers
  drop constraint if exists tenant_ai_providers_dpa_coherent;
alter table public.tenant_ai_providers
  add constraint tenant_ai_providers_dpa_coherent
    check (
      ((dpa_confirmed_at is null) = (dpa_confirmed_by is null))
      and ((dpa_confirmed_at is null) = (dpa_reference is null))
      and (dpa_confirmed_at is null or provider = 'azure')
    );

-- 2. Member-callable eligibility helper (R-2 fix). SECURITY DEFINER so the
--    routing path (a tenant *member*, not admin — the providers table is
--    admin-only RLS) can learn the attest bit without the row being exposed.
--    Scoped to members of p_tenant_id to avoid cross-tenant boolean probing.
create or replace function public.tenant_has_class3_trusted_processor(p_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_tenant_member(p_tenant_id)
    and exists (
      select 1
      from public.tenant_ai_providers
      where tenant_id = p_tenant_id
        and provider = 'azure'
        and dpa_confirmed_at is not null
    );
$$;

revoke all on function public.tenant_has_class3_trusted_processor(uuid) from public;
revoke all on function public.tenant_has_class3_trusted_processor(uuid) from anon;
grant execute on function public.tenant_has_class3_trusted_processor(uuid) to authenticated;

comment on function public.tenant_has_class3_trusted_processor(uuid) is
  'PROJ-93: true iff the tenant has an attested Azure trusted processor. DB-side attest floor only — the TS resolver additionally enforces EU-region (single logical eligibility authority).';

-- 3. Class-3 DB layer: structural anti-scope floor CHECK + DPA-conditional
--    write trigger on tenant_ai_provider_priority.
--    The old class3_local_only CHECK (<@ ['ollama']) is replaced.
alter table public.tenant_ai_provider_priority
  drop constraint if exists tenant_ai_provider_priority_class3_local_only;
alter table public.tenant_ai_provider_priority
  drop constraint if exists tenant_ai_provider_priority_class3_trusted_floor;
alter table public.tenant_ai_provider_priority
  add constraint tenant_ai_provider_priority_class3_trusted_floor
    check ((data_class <> 3) or (provider_order <@ array['ollama','azure']::text[]));

create or replace function public.enforce_class3_trusted_processor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.data_class = 3
     and 'azure' = any(new.provider_order)
     and not public.tenant_has_class3_trusted_processor(new.tenant_id) then
    raise exception
      'class3_azure_requires_dpa_attest: tenant % has no attested EU trusted processor', new.tenant_id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_class3_trusted_processor
  on public.tenant_ai_provider_priority;
create trigger trg_enforce_class3_trusted_processor
  before insert or update on public.tenant_ai_provider_priority
  for each row execute function public.enforce_class3_trusted_processor();

-- 4. ki_runs region provenance (AC-93.5). Populated on azure runs, else NULL.
alter table public.ki_runs
  add column if not exists provider_region text;
comment on column public.ki_runs.provider_region is
  'PROJ-93: Azure region for trusted-processor Class-3 runs (DSGVO provenance). NULL for non-azure.';

-- 5. Audit RPC — accept the two DPA actions. Body otherwise byte-identical to
--    the live PROJ-92 definition (verified against prod 2026-07-03); only the
--    action whitelist gains 'dpa_attest' + 'dpa_revoke'.
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

  if p_action not in ('create','rotate','delete','validate','dpa_attest','dpa_revoke') then
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

-- 6. Attest / revoke RPCs (admin-gated, SECURITY DEFINER, append-only audit).
--    No direct UPDATE from the route (state-machine convention).
create or replace function public.attest_tenant_ai_provider_dpa(
  p_tenant_id uuid,
  p_reference text
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
    raise exception 'forbidden: caller is not tenant admin' using errcode = 'P0003';
  end if;
  if p_reference is null or length(btrim(p_reference)) = 0 then
    raise exception 'dpa_reference_required' using errcode = 'P0001';
  end if;

  v_actor := auth.uid();

  update public.tenant_ai_providers
     set dpa_confirmed_at = now(),
         dpa_confirmed_by = v_actor,
         dpa_reference    = btrim(p_reference),
         updated_at       = now()
   where tenant_id = p_tenant_id and provider = 'azure';

  if not found then
    raise exception 'no_azure_provider: configure an Azure provider before attesting a DPA'
      using errcode = 'P0002';
  end if;

  perform public.record_tenant_ai_provider_audit(
    p_tenant_id, 'azure', 'dpa_attest', null, btrim(p_reference)
  );
end;
$$;

create or replace function public.revoke_tenant_ai_provider_dpa(
  p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid;
  v_oldref text;
begin
  if not public.is_tenant_admin(p_tenant_id) then
    raise exception 'forbidden: caller is not tenant admin' using errcode = 'P0003';
  end if;

  v_actor := auth.uid();

  select dpa_reference into v_oldref
    from public.tenant_ai_providers
   where tenant_id = p_tenant_id and provider = 'azure';

  update public.tenant_ai_providers
     set dpa_confirmed_at = null,
         dpa_confirmed_by = null,
         dpa_reference    = null,
         updated_at       = now()
   where tenant_id = p_tenant_id and provider = 'azure';

  if not found then
    raise exception 'no_azure_provider' using errcode = 'P0002';
  end if;

  perform public.record_tenant_ai_provider_audit(
    p_tenant_id, 'azure', 'dpa_revoke', v_oldref, null
  );
end;
$$;

revoke all on function public.attest_tenant_ai_provider_dpa(uuid, text) from public;
revoke all on function public.attest_tenant_ai_provider_dpa(uuid, text) from anon;
grant execute on function public.attest_tenant_ai_provider_dpa(uuid, text) to authenticated;

revoke all on function public.revoke_tenant_ai_provider_dpa(uuid) from public;
revoke all on function public.revoke_tenant_ai_provider_dpa(uuid) from anon;
grant execute on function public.revoke_tenant_ai_provider_dpa(uuid) to authenticated;
