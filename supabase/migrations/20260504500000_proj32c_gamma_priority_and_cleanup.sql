-- =============================================================================
-- PROJ-32 Phase 32-c-γ — Priority Matrix + 32a Legacy Cleanup
-- =============================================================================
-- This migration finalizes 32-c:
--   1. Creates `tenant_ai_provider_priority` table — pro (tenant, purpose,
--      data_class) eine geordnete Provider-Liste (Fork C.1 lock).
--   2. Drops the legacy 32a artefacts (`tenant_ai_keys` table, 32a-shape
--      RPCs) — Hard-Cutover finalization (Fork B.3 + G.3).
--
-- The audit_log_entries CHECK constraint already includes both new
-- entity_types (added in 32-c-α as forward-compat). No CHECK changes here.
--
-- Note on legacy data: at deploy time of 32-c-γ, tenant_ai_keys MUST be
-- empty (β cutover wrote new tenant configs into tenant_ai_providers
-- only). The migration aborts if it finds rows in tenant_ai_keys —
-- defensive guard against accidental data loss. If the abort fires,
-- run migrate_tenant_ai_keys_to_providers() first, then re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Defensive guard — abort if legacy table still holds tenant data
-- ---------------------------------------------------------------------------
do $$
declare
  v_legacy_count int;
begin
  select count(*) into v_legacy_count from public.tenant_ai_keys;
  if v_legacy_count > 0 then
    raise exception
      'cleanup blocked: tenant_ai_keys has % row(s). Run public.migrate_tenant_ai_keys_to_providers() first to copy data into tenant_ai_providers, then re-run this migration.',
      v_legacy_count
      using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. tenant_ai_provider_priority — per-purpose × per-class provider order
-- ---------------------------------------------------------------------------
create table public.tenant_ai_provider_priority (
  tenant_id      uuid not null,
  purpose        text not null,
  data_class     smallint not null,
  provider_order text[] not null,
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, purpose, data_class),
  constraint tenant_ai_provider_priority_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint tenant_ai_provider_priority_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete set null,
  -- Purpose whitelist matches AIPurpose union in src/lib/ai/types.ts.
  -- Adding a new AI-purpose requires extending this CHECK in lockstep
  -- with the TS-side type to keep them aligned.
  constraint tenant_ai_provider_priority_purpose_check
    check (purpose in ('risks','decisions','work_items','open_items','narrative')),
  constraint tenant_ai_provider_priority_data_class_check
    check (data_class in (1, 2, 3)),
  -- Defense-in-depth (HIGH-risk Class-3 mitigation, also enforced in API
  -- route): for data_class = 3, the provider_order MUST NOT contain any
  -- cloud provider. Today the only local provider is 'ollama'; 32b will
  -- still keep cloud providers ('openai', 'google') out of Class-3 lists.
  constraint tenant_ai_provider_priority_class3_local_only
    check (
      data_class <> 3
      or not (provider_order && array['anthropic']::text[])
    ),
  -- Sanity: provider_order must contain at least one provider name
  -- (empty arrays would render the rule a no-op). Use cardinality()
  -- because array_length(empty, 1) returns NULL which CHECK treats
  -- as pass — classic Postgres pitfall caught in 32-c-γ red-team.
  constraint tenant_ai_provider_priority_nonempty
    check (cardinality(provider_order) >= 1),
  -- Sanity: every entry must be in the known provider set. Same
  -- whitelist as `tenant_ai_providers.provider`. Guards against
  -- typo / drift between table CHECKs.
  constraint tenant_ai_provider_priority_known_providers
    check (provider_order <@ array['anthropic','ollama']::text[])
);

create trigger tenant_ai_provider_priority_set_updated_at
  before update on public.tenant_ai_provider_priority
  for each row execute procedure extensions.moddatetime ('updated_at');

alter table public.tenant_ai_provider_priority enable row level security;

create policy "tenant_ai_provider_priority_admin_select"
  on public.tenant_ai_provider_priority for select
  using (public.is_tenant_admin(tenant_id));

-- AI routing needs to read priority — member-callable SELECT.
-- This is safe because the table contains no plaintext key material,
-- only references to provider names.
create policy "tenant_ai_provider_priority_member_select"
  on public.tenant_ai_provider_priority for select
  using (public.is_tenant_member(tenant_id));

create policy "tenant_ai_provider_priority_admin_insert"
  on public.tenant_ai_provider_priority for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_provider_priority_admin_update"
  on public.tenant_ai_provider_priority for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_provider_priority_admin_delete"
  on public.tenant_ai_provider_priority for delete
  using (public.is_tenant_admin(tenant_id));

-- Index on tenant_id alone for the bulk-fetch in getPriorityMatrix
-- (the resolver calls "where tenant_id = ?" and we want all 15 rows).
-- The PK already starts with tenant_id, so a separate index is not
-- needed.

comment on table public.tenant_ai_provider_priority is
  'PROJ-32-c-γ: per-tenant per-purpose per-class provider priority order. '
  'Up to 5 purposes × 3 data classes = 15 rows per tenant. Class-3 rules '
  'are enforced to contain only local providers via CHECK constraint '
  '(defense-in-depth alongside API-route validation).';

-- ---------------------------------------------------------------------------
-- 3. Audit RPC for priority-matrix changes
-- ---------------------------------------------------------------------------
-- One audit row per (purpose, data_class) cell that was changed.
-- old_value / new_value carry the provider_order arrays as jsonb.
-- ---------------------------------------------------------------------------
create or replace function public.record_tenant_ai_priority_audit(
  p_tenant_id   uuid,
  p_purpose     text,
  p_data_class  smallint,
  p_old_order   text[],
  p_new_order   text[]
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

  v_actor := auth.uid();

  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  )
  values (
    p_tenant_id,
    'tenant_ai_provider_priority',
    p_tenant_id,
    p_purpose || ':class' || p_data_class::text,
    case when p_old_order is null then null
         else to_jsonb(p_old_order) end,
    case when p_new_order is null then null
         else to_jsonb(p_new_order) end,
    v_actor,
    'priority_update'
  );
end;
$$;

revoke execute on function public.record_tenant_ai_priority_audit(
  uuid, text, smallint, text[], text[]
) from public, anon;
grant execute on function public.record_tenant_ai_priority_audit(
  uuid, text, smallint, text[], text[]
) to authenticated;

comment on function public.record_tenant_ai_priority_audit(
  uuid, text, smallint, text[], text[]
) is
  'PROJ-32-c-γ: write one audit_log_entries row for a priority-matrix cell '
  'change. Admin-gated. Stores provider_order arrays — no PII / key material.';

-- ---------------------------------------------------------------------------
-- 4. Legacy 32a cleanup — drop tenant_ai_keys + 32a-shape RPCs
-- ---------------------------------------------------------------------------
-- The defensive guard at the top of this migration ensures the table
-- is empty. Drops are atomic with the rest of the migration so a
-- rollback puts everything back.
--
-- Note on the migrator helper: migrate_tenant_ai_keys_to_providers()
-- references tenant_ai_keys, so it must be dropped before the table.
-- The data-copy is no longer needed once the legacy table is gone.
-- ---------------------------------------------------------------------------
drop function if exists public.migrate_tenant_ai_keys_to_providers();
drop function if exists public.decrypt_tenant_ai_key(uuid, text);
drop function if exists public.record_tenant_ai_key_audit(uuid, text, text, text, text);
drop table if exists public.tenant_ai_keys;
