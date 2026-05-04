-- =============================================================================
-- HOTFIX — restore EXECUTE on the 6 RLS helper functions for `authenticated`.
-- =============================================================================
-- These SECURITY DEFINER helpers are referenced by RLS policies on most
-- tables in the schema. Postgres requires the calling role to hold
-- EXECUTE on a function before the SECURITY DEFINER elevation kicks in,
-- so when authenticated lost EXECUTE every RLS check that calls one of
-- these helpers fails with "permission denied for function ..." — most
-- visibly during onboarding (insert into tenant_members, etc.).
--
-- Anon stays revoked (these helpers must not be callable without auth).
--
-- How the regression happened (best guess): a downstream migration that
-- did CREATE FUNCTION (rather than CREATE OR REPLACE) on one of these
-- helpers reset the grant table for all six because they were re-created
-- as a group. Future helper updates must use CREATE OR REPLACE only.
-- =============================================================================

grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, text) to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_lead(uuid) to authenticated;
grant execute on function public.has_project_role(uuid, text) to authenticated;
