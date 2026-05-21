-- =============================================================================
-- Fix PROJ-14/PROJ-32 secret RPC grants after the internal-function lockdown.
-- =============================================================================
-- 20260504500000_security_internal_functions_lockdown revoked EXECUTE on
-- encrypt_tenant_secret/decrypt_tenant_secret and the tenant AI audit RPC from
-- authenticated. That broke the server-side API routes that intentionally use
-- the user's Supabase session so RLS, auth.uid(), and tenant-admin checks keep
-- their caller context.
--
-- Keep anon/public blocked, but restore authenticated for the RPCs that are
-- invoked from authenticated server routes. The sensitive read/write gates are
-- still enforced by RLS and by the SECURITY DEFINER functions themselves:
--   - decrypt_tenant_secret checks public.is_tenant_admin(...)
--   - decrypt_tenant_ai_provider checks public.is_tenant_member(...)
--   - record_tenant_ai_provider_audit checks public.is_tenant_admin(...)
--   - table writes remain RLS-protected admin-only
-- =============================================================================

revoke execute on function public.set_session_encryption_key(text)
  from public, anon;
grant execute on function public.set_session_encryption_key(text)
  to authenticated;

revoke execute on function public.encrypt_tenant_secret(jsonb)
  from public, anon;
grant execute on function public.encrypt_tenant_secret(jsonb)
  to authenticated;

revoke execute on function public.decrypt_tenant_secret(uuid)
  from public, anon;
grant execute on function public.decrypt_tenant_secret(uuid)
  to authenticated;

revoke execute on function public.decrypt_tenant_ai_provider(uuid, text)
  from public, anon;
grant execute on function public.decrypt_tenant_ai_provider(uuid, text)
  to authenticated;

revoke execute on function public.record_tenant_ai_provider_audit(
  uuid, text, text, text, text
) from public, anon;
grant execute on function public.record_tenant_ai_provider_audit(
  uuid, text, text, text, text
) to authenticated;
