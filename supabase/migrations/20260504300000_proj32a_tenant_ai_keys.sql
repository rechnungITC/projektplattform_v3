-- =============================================================================
-- PROJ-32a: Tenant AI Provider Keys (Anthropic only — 32b/c will extend)
-- =============================================================================
-- Reuses the PROJ-14 encryption pattern:
--   * pgcrypto + GUC `app.settings.encryption_key` (SECRETS_ENCRYPTION_KEY env)
--   * encrypt_tenant_secret(jsonb) → bytea is reused 1:1 (returns bytea, no
--     side effects — perfect for storing into a different table)
--   * a parallel decrypt RPC for tenant_ai_keys is added because PROJ-14's
--     decrypt_tenant_secret is bound to the tenant_secrets table AND admin-
--     only, while AI routing is invoked by ANY tenant member during a
--     normal AI call. Admin direct-read of the encrypted column stays
--     blocked by the table-level RLS in this migration.
-- =============================================================================

-- pgcrypto already installed (PROJ-1, PROJ-14 idempotent checks).

-- ---------------------------------------------------------------------------
-- tenant_ai_keys
-- ---------------------------------------------------------------------------
create table public.tenant_ai_keys (
  tenant_id              uuid not null,
  provider               text not null,
  encrypted_key          bytea not null,
  key_fingerprint        text not null,
  last_validated_at      timestamptz,
  last_validation_status text,
  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  primary key (tenant_id, provider),
  constraint tenant_ai_keys_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint tenant_ai_keys_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null,
  -- Provider whitelist. 32b/c will ALTER this CHECK to add 'openai',
  -- 'google', 'ollama'. Single-Key-per-Provider via PK constraint.
  constraint tenant_ai_keys_provider_check
    check (provider in ('anthropic')),
  constraint tenant_ai_keys_status_check
    check (last_validation_status is null
           or last_validation_status in ('valid','invalid','rate_limited','unknown')),
  constraint tenant_ai_keys_fingerprint_format
    check (length(key_fingerprint) between 8 and 200)
);

create trigger tenant_ai_keys_set_updated_at
  before update on public.tenant_ai_keys
  for each row execute procedure extensions.moddatetime ('updated_at');

alter table public.tenant_ai_keys enable row level security;

-- ---------------------------------------------------------------------------
-- RLS — admin-only on every operation. The encrypted_key column never leaves
-- this table via SELECT for non-admins. AI routing uses the SECURITY DEFINER
-- function below, which has its own member-level gate.
-- ---------------------------------------------------------------------------
create policy "tenant_ai_keys_admin_select"
  on public.tenant_ai_keys for select
  using (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_keys_admin_insert"
  on public.tenant_ai_keys for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_keys_admin_update"
  on public.tenant_ai_keys for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_ai_keys_admin_delete"
  on public.tenant_ai_keys for delete
  using (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- decrypt_tenant_ai_key — member-callable, used by the AI router.
-- ---------------------------------------------------------------------------
-- Why a separate function (not reuse decrypt_tenant_secret)?
--   1. decrypt_tenant_secret is bound to tenant_secrets (different table)
--   2. decrypt_tenant_secret is admin-only — but AI routing is triggered
--      by any tenant member during a normal AI call (risk-suggestion,
--      narrative). They must NOT be able to read the encrypted column
--      directly (RLS blocks them on the table), but the routing function
--      may use it under a controlled SECURITY DEFINER context.
--
-- Returns:
--   * the decrypted plaintext key (text) when a row exists
--   * null when no row exists for (tenant, provider) — caller treats this
--     as "no tenant key set, use platform fallback"
--
-- Errors:
--   * P0001 — encryption_unavailable (GUC not set, caller bug)
--   * P0003 — forbidden (caller is not a tenant member; defense in depth)
-- ---------------------------------------------------------------------------
create or replace function public.decrypt_tenant_ai_key(
  p_tenant_id uuid,
  p_provider text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_encrypted bytea;
  v_key text;
begin
  -- Defense in depth: SECURITY DEFINER bypasses RLS, but we MUST verify
  -- the caller is at least a tenant member before returning plaintext.
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'forbidden: caller is not tenant member'
      using errcode = 'P0003';
  end if;

  select encrypted_key into v_encrypted
  from public.tenant_ai_keys
  where tenant_id = p_tenant_id and provider = p_provider;

  if not found then
    return null;
  end if;

  v_key := nullif(current_setting('app.settings.encryption_key', true), '');
  if v_key is null then
    raise exception 'encryption_unavailable: app.settings.encryption_key not set'
      using errcode = 'P0001';
  end if;

  return pgp_sym_decrypt(v_encrypted, v_key);
end;
$$;

revoke execute on function public.decrypt_tenant_ai_key(uuid, text) from public, anon;
grant execute on function public.decrypt_tenant_ai_key(uuid, text) to authenticated;

comment on function public.decrypt_tenant_ai_key(uuid, text) is
  'PROJ-32a: returns plaintext AI provider key for a (tenant, provider) pair. '
  'Caller MUST be a tenant member. The encryption-key GUC must be set first '
  'via public.set_session_encryption_key().';

comment on table public.tenant_ai_keys is
  'PROJ-32a: per-tenant per-provider AI API keys (encrypted via pgcrypto, '
  'reuses PROJ-14 encryption helpers). Admin-only direct access via RLS; '
  'AI routing reads via decrypt_tenant_ai_key() SECURITY DEFINER function.';

-- Index covers: (1) admin-page metadata fetch (tenant_id), (2) fast routing
-- lookup (tenant_id, provider) via the PK already.
-- The PK is (tenant_id, provider), so additional indexes are not needed.
