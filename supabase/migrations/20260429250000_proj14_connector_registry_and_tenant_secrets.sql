-- =============================================================================
-- PROJ-14: Connector Framework — tenant_secrets + pgcrypto helpers
-- =============================================================================
-- This migration delivers the "plumbing" slice (Option A in /architecture):
--
--   * `public.tenant_secrets` — encrypted credentials per (tenant × connector)
--   * RLS — tenant-admin only on every operation
--   * Two SECURITY DEFINER helper functions:
--       public.encrypt_tenant_secret(p_payload jsonb)
--       public.decrypt_tenant_secret(p_secret_id uuid)
--     They wrap pgcrypto so callers never touch the raw key. The key is
--     read from the GUC `app.settings.encryption_key`, which the API
--     route sets per-request via `SET LOCAL app.settings.encryption_key`.
--
-- Real adapters (Jira, MCP, Teams, real Slack) come in their own slices
-- and dock into this same `tenant_secrets` layer.
--
-- =============================================================================

-- pgcrypto is already installed since PROJ-1 (see 20260425120000_proj1_*).
-- Defensive idempotent check in case migrations are replayed:
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------------
-- tenant_secrets
-- ---------------------------------------------------------------------------
create table public.tenant_secrets (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  connector_key       text not null,
  payload_encrypted   bytea not null,
  created_by          uuid not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint tenant_secrets_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint tenant_secrets_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint tenant_secrets_connector_key_format
    check (connector_key ~ '^[a-z][a-z0-9_-]{1,63}$')
);

create unique index tenant_secrets_unique_per_connector
  on public.tenant_secrets (tenant_id, connector_key);

alter table public.tenant_secrets enable row level security;

-- Admin-only on every operation. The decrypt helper is SECURITY DEFINER and
-- still calls is_tenant_admin internally so privilege-escalation through
-- the function is impossible.
create policy "tenant_secrets_admin_select"
  on public.tenant_secrets for select
  using (public.is_tenant_admin(tenant_id));

create policy "tenant_secrets_admin_insert"
  on public.tenant_secrets for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_secrets_admin_update"
  on public.tenant_secrets for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "tenant_secrets_admin_delete"
  on public.tenant_secrets for delete
  using (public.is_tenant_admin(tenant_id));

create trigger tenant_secrets_set_updated_at
  before update on public.tenant_secrets
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- Encryption helpers
-- ---------------------------------------------------------------------------
-- Both functions read the symmetric key from the GUC
--   `app.settings.encryption_key`
-- which the API route sets per request via:
--   set local app.settings.encryption_key = '<env-var>';
--
-- Why a GUC and not a hardcoded session var?
--   - GUCs scoped with `set local` are cleaned up at txn end → no leak across
--     connection-pool reuse.
--   - The function is SECURITY DEFINER so it runs with elevated rights, but
--     the GUC is set by the calling session — function owner doesn't see the
--     key in its own session.
--
-- If the GUC is not set, both functions raise a clean error so the caller
-- can map it to a clear "encryption_unavailable" status in the UI.

create or replace function public.encrypt_tenant_secret(p_payload jsonb)
returns bytea
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  v_key := nullif(current_setting('app.settings.encryption_key', true), '');
  if v_key is null then
    raise exception 'encryption_unavailable: app.settings.encryption_key not set'
      using errcode = 'P0001';
  end if;
  return pgp_sym_encrypt(p_payload::text, v_key);
end;
$$;

revoke execute on function public.encrypt_tenant_secret(jsonb) from public, anon;

create or replace function public.decrypt_tenant_secret(p_secret_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.tenant_secrets%rowtype;
  v_key text;
  v_plain text;
begin
  select * into v_row from public.tenant_secrets where id = p_secret_id;
  if not found then
    raise exception 'not_found: tenant_secrets row %', p_secret_id
      using errcode = 'P0002';
  end if;

  -- Defense in depth: even though SECURITY DEFINER bypasses RLS,
  -- this function MUST verify the caller is a tenant admin of the
  -- target tenant before returning plaintext.
  if not public.is_tenant_admin(v_row.tenant_id) then
    raise exception 'forbidden: caller is not tenant admin'
      using errcode = 'P0003';
  end if;

  v_key := nullif(current_setting('app.settings.encryption_key', true), '');
  if v_key is null then
    raise exception 'encryption_unavailable: app.settings.encryption_key not set'
      using errcode = 'P0001';
  end if;

  v_plain := pgp_sym_decrypt(v_row.payload_encrypted, v_key);
  return v_plain::jsonb;
end;
$$;

revoke execute on function public.decrypt_tenant_secret(uuid) from public, anon;
grant execute on function public.decrypt_tenant_secret(uuid) to authenticated;
grant execute on function public.encrypt_tenant_secret(jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- public.set_session_encryption_key — wrapper so supabase-js RPC can bind
-- the encryption key per-request via `set_config('app.settings.encryption_key',
-- $1, true)`. The wrapper is needed because Supabase's REST RPC endpoint
-- only routes to functions in the `public` schema; the underlying
-- `pg_catalog.set_config` is callable but not REST-exposed.
-- ---------------------------------------------------------------------------
create or replace function public.set_session_encryption_key(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(p_key) = 0 then
    raise exception 'set_session_encryption_key: p_key must be non-empty'
      using errcode = 'P0001';
  end if;
  perform set_config('app.settings.encryption_key', p_key, true);
end;
$$;

revoke execute on function public.set_session_encryption_key(text) from public, anon;
grant execute on function public.set_session_encryption_key(text) to authenticated;
