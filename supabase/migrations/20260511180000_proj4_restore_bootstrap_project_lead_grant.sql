-- =============================================================================
-- Restore EXECUTE on bootstrap_project_lead(uuid, uuid) to `authenticated`.
-- =============================================================================
--
-- Background. Migration 20260504500000_security_internal_functions_lockdown.sql
-- revoked EXECUTE on this function from `authenticated`, based on the (wrong)
-- assumption that the function is called only from triggers / admin code.
-- It is actually called from API routes via supabase.rpc(...):
--   - src/app/api/projects/route.ts                  (POST /api/projects)
--   - src/app/api/wizard-drafts/[id]/finalize/route.ts (wizard finalize)
--
-- Effect of the bug: every non-admin project creation surfaced
--   "permission denied for function bootstrap_project_lead"
-- after the project INSERT succeeded, leaving the new project without a lead.
--
-- Why it is safe to re-grant. The SECURITY DEFINER body enforces all
-- preconditions internally:
--   1. auth.uid() must be set                  (no anonymous bootstrap)
--   2. auth.uid() = p_user_id                  (no privilege escalation on others)
--   3. project exists and is not soft-deleted
--   4. caller is a tenant member of the project's tenant
--   5. one-shot: refuses if any project_memberships row exists already
-- Exposing the RPC to `authenticated` matches its API contract — the internal
-- guards are what justified `SECURITY DEFINER` in the first place.

grant execute on function public.bootstrap_project_lead(p_project_id uuid, p_user_id uuid)
  to authenticated;
