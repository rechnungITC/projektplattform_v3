-- =============================================================================
-- PROJ-32 Phase 32-c-α — Data-copy helper RPC
-- =============================================================================
-- Idempotent one-shot copy from `tenant_ai_keys` → `tenant_ai_providers`.
--
-- Why an RPC rather than a Node script?
--   * The data-copy is purely DB-internal: decrypt one row, re-encrypt
--     the same plaintext into a JSONB shape, insert into the new table.
--     Doing this round-trip via a Node client would require shipping
--     plaintext keys across process boundaries unnecessarily.
--   * As an RPC the caller can set the encryption-key GUC for exactly
--     one transaction and tear it down on commit; no env-var leakage.
--
-- Idempotency: skips any (tenant_id, provider) pair that already exists
-- in `tenant_ai_providers`. Safe to call multiple times. Returns a JSON
-- summary of {migrated, skipped}.
--
-- Auth: SECURITY DEFINER + the caller must be the postgres role OR an
-- explicit admin-marker GUC. Since this is an ops-only one-shot helper,
-- we restrict execute to `postgres` only — the user runs it via
-- supabase-mcp / SQL Editor with elevated rights.
-- =============================================================================

create or replace function public.migrate_tenant_ai_keys_to_providers()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_row record;
  v_plain text;
  v_jsonb jsonb;
  v_encrypted bytea;
  v_migrated int := 0;
  v_skipped int := 0;
  v_existing int;
begin
  v_key := nullif(current_setting('app.settings.encryption_key', true), '');
  if v_key is null then
    raise exception 'encryption_unavailable: app.settings.encryption_key not set'
      using errcode = 'P0001';
  end if;

  for v_row in
    select tenant_id, provider, encrypted_key, key_fingerprint,
           last_validated_at, last_validation_status, created_by
    from public.tenant_ai_keys
  loop
    -- Idempotency: skip if target row already exists
    select count(*) into v_existing
    from public.tenant_ai_providers
    where tenant_id = v_row.tenant_id and provider = v_row.provider;

    if v_existing > 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Decrypt plain key from old table, build provider-specific JSONB
    -- payload, re-encrypt into new bytea.
    v_plain := pgp_sym_decrypt(v_row.encrypted_key, v_key);
    v_jsonb := jsonb_build_object('api_key', v_plain);
    v_encrypted := pgp_sym_encrypt(v_jsonb::text, v_key);

    insert into public.tenant_ai_providers (
      tenant_id, provider, encrypted_config, key_fingerprint,
      last_validated_at, last_validation_status, created_by
    ) values (
      v_row.tenant_id, v_row.provider, v_encrypted,
      v_row.key_fingerprint,
      v_row.last_validated_at, v_row.last_validation_status,
      v_row.created_by
    );

    v_migrated := v_migrated + 1;
  end loop;

  return jsonb_build_object(
    'migrated', v_migrated,
    'skipped', v_skipped,
    'total_source_rows', v_migrated + v_skipped
  );
end;
$$;

-- Restrict execute to postgres role only — this is an ops one-shot, not
-- an end-user RPC. authenticated/anon explicitly denied.
revoke execute on function public.migrate_tenant_ai_keys_to_providers()
  from public, anon, authenticated;

comment on function public.migrate_tenant_ai_keys_to_providers() is
  'PROJ-32-c-α: one-shot idempotent data-copy from tenant_ai_keys to '
  'tenant_ai_providers. Requires the encryption-key GUC. Postgres-only.';
