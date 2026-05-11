-- =============================================================================
-- Security Hardening — REST-RPC lockdown for 14 internal SECURITY DEFINER
-- functions (mirrors the PROJ-36-α function-lockdown pattern from
-- 20260504410000_proj36a_function_lockdown_redeploy.sql).
-- =============================================================================
--
-- Background. Supabase auto-exposes every public-schema function via
-- /rest/v1/rpc/<name>. SECURITY DEFINER functions execute with the
-- function-owner's privileges (postgres) and therefore bypass RLS — that's
-- intended when the function is the API surface (e.g. transition_project_status,
-- accept_ki_suggestion_risk). It is NOT intended when the function is an
-- internal helper that was made SECURITY DEFINER only so that it can be
-- called from RLS policies, triggers, or other functions.
--
-- The Supabase security advisor (lint 0028 + 0029) flagged 35 such functions
-- as "callable by anon/authenticated via /rest/v1/rpc/". For each, we asked:
-- is this function called via supabase.rpc(...) from the application code?
--   - YES → keep callable (REST is its API contract).
--   - NO  → revoke EXECUTE so the REST-RPC surface is closed.
--
-- The 14 functions in this migration fell into the "NO" bucket. They are:
--   - 7 RLS / membership helpers (is_*, has_*) called from SQL policies only.
--   - 4 tenant-secret crypto helpers — privilege-escalation surface if a
--     signed-in user can call decrypt_tenant_secret / encrypt_tenant_secret /
--     decrypt_tenant_ai_key / record_tenant_ai_*_audit directly.
--   - 1 method-keys validator (_valid_method_keys) used inside CHECK constraints.
--   - 1 audit-readability gate (can_read_audit_entry) used inside RLS.
--   - 1 method-keys validator stand-in (the bootstrap_project_lead revoke
--     listed below was a misclassification — see correction note).
--
-- CORRECTION (2026-05-11): bootstrap_project_lead WAS revoked here, but it is
-- in fact called from API routes via supabase.rpc(...) — POST /api/projects
-- and POST /api/wizard-drafts/[id]/finalize. The revoke broke every non-admin
-- project creation with "permission denied for function bootstrap_project_lead".
-- A follow-up migration (20260511180000_proj4_restore_bootstrap_project_lead_grant.sql)
-- re-grants EXECUTE to `authenticated`. The revoke line below has been removed
-- from this file so a fresh DB replay no longer re-introduces the bug.
-- The function's SECURITY DEFINER body enforces caller=p_user_id, tenant
-- membership, and one-shot-only — exposing it to `authenticated` is safe.
--
-- IMPORTANT — what REVOKE EXECUTE does NOT change:
--   Trigger execution and inter-function calls are unaffected. SECURITY
--   DEFINER functions inherit the function-owner's (postgres) execute right;
--   REVOKE only closes the REST-RPC surface that anon/authenticated would
--   reach via PostgREST.
--
-- decrypt_tenant_ai_provider stays callable: PROJ-32-a invokes it via
-- supabase.rpc("decrypt_tenant_ai_provider", ...) to fetch a tenant API
-- key for an AI call. Internal access checks (tenant_admin) live inside
-- the function itself.
-- =============================================================================

-- RLS / membership helpers (7) — called from policies, never from clients.
revoke execute on function public.is_tenant_member(p_tenant_id uuid)
  from public, anon, authenticated;
revoke execute on function public.is_tenant_admin(p_tenant_id uuid)
  from public, anon, authenticated;
revoke execute on function public.is_project_member(p_project_id uuid)
  from public, anon, authenticated;
revoke execute on function public.is_project_lead(p_project_id uuid)
  from public, anon, authenticated;
revoke execute on function public.has_tenant_role(p_tenant_id uuid, p_role text)
  from public, anon, authenticated;
revoke execute on function public.has_project_role(p_project_id uuid, p_role text)
  from public, anon, authenticated;
revoke execute on function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
  from public, anon, authenticated;

-- Tenant-secret crypto helpers (4) — privilege-escalation surface if exposed.
revoke execute on function public.encrypt_tenant_secret(p_payload jsonb)
  from public, anon, authenticated;
revoke execute on function public.decrypt_tenant_secret(p_secret_id uuid)
  from public, anon, authenticated;
revoke execute on function public.decrypt_tenant_ai_key(p_tenant_id uuid, p_provider text)
  from public, anon, authenticated;
revoke execute on function public.record_tenant_ai_key_audit(p_tenant_id uuid, p_provider text, p_action text, p_old_fingerprint text, p_new_fingerprint text)
  from public, anon, authenticated;
revoke execute on function public.record_tenant_ai_provider_audit(p_tenant_id uuid, p_provider text, p_action text, p_old_fingerprint text, p_new_fingerprint text)
  from public, anon, authenticated;

-- Validator (1).
revoke execute on function public._valid_method_keys()
  from public, anon, authenticated;
-- bootstrap_project_lead revoke removed (see CORRECTION note above). Re-grant
-- is restored by 20260511180000_proj4_restore_bootstrap_project_lead_grant.sql.
