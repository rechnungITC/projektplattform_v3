-- =============================================================================
-- PROJ-32 Phase 32-c-α — Generic AI Provider Schema
-- =============================================================================
-- This migration introduces the generic `tenant_ai_providers` table that
-- replaces 32a's `tenant_ai_keys`. It is purely additive: the old table
-- stays in place. Phase 32-c-β switches the API + resolver to read from
-- the new table; Phase 32-c-γ adds the priority matrix and drops the
-- legacy table.
--
-- Locked decisions (CIA-Review 2026-05-04):
--   * Fork B: dual-write within same slice → α adds tables only, β/γ do
--     the cutover. App code in α is unchanged.
--   * Fork C: own table for priority (forward-compat: this migration
--     extends the audit CHECK with both new entity_types so γ doesn't
--     need to touch it).
--   * encrypted_config bytea uses the SAME pgcrypto helpers as PROJ-14
--     (`encrypt_tenant_secret(jsonb) → bytea` returns plain bytea — no
--     side effect on tenant_secrets table — so it's safely reusable).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tenant_ai_providers — generic per-tenant per-provider config storage
-- ---------------------------------------------------------------------------
create table public.tenant_ai_providers (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  provider               text not null,
  encrypted_config       bytea not null,
  key_fingerprint        text not null,
  last_validated_at      timestamptz,
  last_validation_status text,
  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint tenant_ai_providers_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint tenant_ai_providers_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null,
  -- Provider whitelist; 32-c-β extends to add 'ollama' (now). 32b extends
  -- to add 'openai' / 'google' in a later slice.
  constraint tenant_ai_providers_provider_check
    check (provider in ('anthropic', 'ollama')),
  -- Validation status — extends 32a's 4-state model with 'unreachable' +
  -- 'model_missing' for Ollama-specific failure modes.
  constraint tenant_ai_providers_status_check
    check (last_validation_status is null
           or last_validation_status in (
             'valid', 'invalid', 'rate_limited',
             'unreachable', 'model_missing', 'unknown'
           )),
  constraint tenant_ai_providers_fingerprint_format
    check (length(key_fingerprint) between 8 and 200),
  -- Single provider per tenant (matches 32a's Single-Key-per-Provider
  -- decision). Rotation = upsert on this conflict target.
  constraint tenant_ai_providers_unique_per_tenant_provider
    unique (tenant_id, provider)
);

create trigger tenant_ai_providers_set_updated_at
  before update on public.tenant_ai_providers
  for each row execute procedure extensions.moddatetime ('updated_at');

alter table public.tenant_ai_providers enable row level security;

-- ---------------------------------------------------------------------------
-- RLS — admin-only on every operation. The encrypted_config column never
-- leaves this table via SELECT for non-admins. AI routing uses the
-- SECURITY DEFINER decrypt function below, which has its own member-level
-- gate.
-- ---------------------------------------------------------------------------
create policy "tenant_ai_providers_admin_select"
  on public.tenant_ai_providers for select
  using (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_providers_admin_insert"
  on public.tenant_ai_providers for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_providers_admin_update"
  on public.tenant_ai_providers for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_providers_admin_delete"
  on public.tenant_ai_providers for delete
  using (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- 2. decrypt_tenant_ai_provider — member-callable, used by the AI router
-- ---------------------------------------------------------------------------
-- Mirrors 32a's `decrypt_tenant_ai_key` pattern but returns the full
-- JSONB config (provider-specific shape) instead of a single string.
--
-- Returns:
--   * jsonb config when row exists (e.g. {api_key: '...'} for anthropic;
--     {endpoint_url: '...', model_id: '...', bearer_token?: '...'} for ollama)
--   * NULL when no row exists for (tenant, provider)
--
-- Errors:
--   * P0001 — encryption_unavailable (GUC not set)
--   * P0003 — forbidden (caller is not a tenant member)
-- ---------------------------------------------------------------------------
create or replace function public.decrypt_tenant_ai_provider(
  p_tenant_id uuid,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_encrypted bytea;
  v_key text;
  v_plain text;
begin
  -- Defense in depth: SECURITY DEFINER bypasses RLS, but we MUST verify
  -- the caller is at least a tenant member before returning plaintext.
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'forbidden: caller is not tenant member'
      using errcode = 'P0003';
  end if;

  select encrypted_config into v_encrypted
  from public.tenant_ai_providers
  where tenant_id = p_tenant_id and provider = p_provider;

  if not found then
    return null;
  end if;

  v_key := nullif(current_setting('app.settings.encryption_key', true), '');
  if v_key is null then
    raise exception 'encryption_unavailable: app.settings.encryption_key not set'
      using errcode = 'P0001';
  end if;

  v_plain := pgp_sym_decrypt(v_encrypted, v_key);
  return v_plain::jsonb;
end;
$$;

revoke execute on function public.decrypt_tenant_ai_provider(uuid, text) from public, anon;
grant execute on function public.decrypt_tenant_ai_provider(uuid, text) to authenticated;

comment on function public.decrypt_tenant_ai_provider(uuid, text) is
  'PROJ-32-c: returns plaintext JSONB config for a (tenant, provider) pair. '
  'Caller MUST be a tenant member. The encryption-key GUC must be set first '
  'via public.set_session_encryption_key().';

comment on table public.tenant_ai_providers is
  'PROJ-32-c-α: per-tenant per-provider AI configuration (encrypted JSONB). '
  'Replaces 32a tenant_ai_keys; the legacy table stays in place until 32-c-γ '
  'cleanup migration. Admin-only direct access via RLS; AI routing reads '
  'via decrypt_tenant_ai_provider() SECURITY DEFINER function.';

-- ---------------------------------------------------------------------------
-- 3. Extend audit_log_entries CHECK with the two new entity_types
--    (forward-compat: γ does not need to touch the constraint)
-- ---------------------------------------------------------------------------
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items','tenants','tenant_settings',
      'communication_outbox','resources','work_item_resources',
      'tenant_project_type_overrides','tenant_method_overrides',
      'vendors','vendor_project_assignments','vendor_evaluations',
      'vendor_documents','compliance_tags','work_item_documents',
      'budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates',
      'work_item_cost_lines','dependencies',
      'tenant_ai_keys',
      'tenant_ai_providers',
      'tenant_ai_provider_priority'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. record_tenant_ai_provider_audit — admin-only audit-write RPC
-- ---------------------------------------------------------------------------
-- Mirrors 32a's record_tenant_ai_key_audit. Provider whitelist matches
-- the table's CHECK constraint and will be extended in lockstep with the
-- table CHECK in 32b.
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

  if p_provider not in ('anthropic', 'ollama') then
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

revoke execute on function public.record_tenant_ai_provider_audit(
  uuid, text, text, text, text
) from public, anon;
grant execute on function public.record_tenant_ai_provider_audit(
  uuid, text, text, text, text
) to authenticated;

comment on function public.record_tenant_ai_provider_audit(
  uuid, text, text, text, text
) is
  'PROJ-32-c-α: write one audit_log_entries row for an AI-provider admin '
  'action. Admin-gated. Stores fingerprints (never plaintext config). '
  'Action in (create, rotate, delete, validate).';

-- ---------------------------------------------------------------------------
-- NOTE on data migration:
--   The CIA-locked Fork B (dual-write) means the data-copy from
--   tenant_ai_keys → tenant_ai_providers is performed by a separate
--   one-shot script that runs with SECRETS_ENCRYPTION_KEY in env
--   (scripts/proj32c_alpha_data_copy.ts), NOT inside this migration.
--   Reason: migrations have no access to env vars, and embedding the
--   key here would be a security violation.
--
--   At deploy time of 32-c-α, prod tenant_ai_keys has 0 rows so the
--   data-copy is a no-op. The script remains in repo for any rows that
--   appear between α deploy and β cutover.
-- ---------------------------------------------------------------------------
