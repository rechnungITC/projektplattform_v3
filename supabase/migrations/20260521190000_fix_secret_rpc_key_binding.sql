-- =============================================================================
-- Fix secret encryption key binding across Supabase REST RPC calls.
-- =============================================================================
-- The original pattern was:
--   1. rpc('set_session_encryption_key', { p_key })
--   2. rpc('encrypt_tenant_secret' / 'decrypt_tenant_ai_provider', ...)
--
-- `set_session_encryption_key` uses set_config(..., is_local := true). That is
-- correct for connection-pool safety, but it only lives for the current
-- Postgres transaction. Supabase/PostgREST executes each RPC request in its own
-- transaction, so the second RPC cannot see the GUC and raises:
--   encryption_unavailable: app.settings.encryption_key not set
--
-- These wrappers bind the key and perform the crypto operation inside one
-- SECURITY DEFINER function call. Public/anon remain blocked; authenticated is
-- enough because the existing functions still enforce tenant-member/admin
-- gates and table writes remain RLS protected.
-- =============================================================================

create or replace function public.encrypt_tenant_secret_with_key(
  p_payload jsonb,
  p_key text
)
returns bytea
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(p_key) = 0 then
    raise exception 'encryption_unavailable: p_key must be non-empty'
      using errcode = 'P0001';
  end if;

  perform set_config('app.settings.encryption_key', p_key, true);
  return public.encrypt_tenant_secret(p_payload);
end;
$$;

revoke execute on function public.encrypt_tenant_secret_with_key(jsonb, text)
  from public, anon;
grant execute on function public.encrypt_tenant_secret_with_key(jsonb, text)
  to authenticated;

create or replace function public.decrypt_tenant_secret_with_key(
  p_secret_id uuid,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(p_key) = 0 then
    raise exception 'encryption_unavailable: p_key must be non-empty'
      using errcode = 'P0001';
  end if;

  perform set_config('app.settings.encryption_key', p_key, true);
  return public.decrypt_tenant_secret(p_secret_id);
end;
$$;

revoke execute on function public.decrypt_tenant_secret_with_key(uuid, text)
  from public, anon;
grant execute on function public.decrypt_tenant_secret_with_key(uuid, text)
  to authenticated;

create or replace function public.decrypt_tenant_ai_provider_with_key(
  p_tenant_id uuid,
  p_provider text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(p_key) = 0 then
    raise exception 'encryption_unavailable: p_key must be non-empty'
      using errcode = 'P0001';
  end if;

  perform set_config('app.settings.encryption_key', p_key, true);
  return public.decrypt_tenant_ai_provider(p_tenant_id, p_provider);
end;
$$;

revoke execute on function public.decrypt_tenant_ai_provider_with_key(
  uuid, text, text
) from public, anon;
grant execute on function public.decrypt_tenant_ai_provider_with_key(
  uuid, text, text
) to authenticated;
