-- =============================================================================
-- PROJ-65 ε.3b — Revoke EXECUTE on plan_mutate RPCs from anon role
-- =============================================================================
-- Supabase's default ACL grants EXECUTE on new public-schema functions to
-- anon/authenticated/service_role. The plan_mutate RPCs already return 401
-- when auth.uid() is null, but the security advisor flags the open surface.
-- This migration closes the anon surface explicitly.
-- =============================================================================

revoke execute on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb)
  from anon;

revoke execute on function public.plan_mutate_undo_atomic(uuid, uuid)
  from anon;
