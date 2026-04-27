-- =============================================================================
-- M1 hardening: revoke EXECUTE on trigger-only SECURITY DEFINER functions
-- =============================================================================
-- Supabase advisor flagged these as `anon_security_definer_function_executable`
-- and `authenticated_security_definer_function_executable`. They are designed
-- to run only from BEFORE/AFTER triggers — not callable as RPC. Outside trigger
-- context they no-op (NEW/OLD are null), but the public RPC surface is still
-- attacker-reachable. Lock it down: REVOKE EXECUTE from public, anon, and
-- authenticated. Triggers continue to invoke these because the trigger system
-- runs them as the table's owner, bypassing the EXECUTE grant.
--
-- Helper functions (`is_*`, `has_*`) and RPC state machines
-- (`set_sprint_state`, `transition_phase_status`, `transition_project_status`)
-- are intentionally callable by `authenticated` — NOT covered by this migration.

revoke execute on function public.enforce_admin_invariant() from public, anon, authenticated;
revoke execute on function public.enforce_dependency_same_project() from public, anon, authenticated;
revoke execute on function public.enforce_last_lead() from public, anon, authenticated;
revoke execute on function public.enforce_project_membership_user_in_tenant() from public, anon, authenticated;
revoke execute on function public.enforce_project_responsible_user_in_tenant() from public, anon, authenticated;
revoke execute on function public.prevent_dependency_cycle() from public, anon, authenticated;
revoke execute on function public.prevent_work_item_parent_cycle() from public, anon, authenticated;

-- Helpers (`is_*`, `has_*`) — intentionally callable by `authenticated`
-- (RLS policies invoke them and clients may need them). Revoke from
-- PUBLIC + anon — anonymous users have no business asking about tenant/
-- project roles. PUBLIC is the pseudo-role that grants EXECUTE to every
-- role by default; without revoking it, the explicit anon revoke above
-- would still leave anon executing through the PUBLIC grant.
revoke execute on function public.is_tenant_admin(uuid) from public, anon;
revoke execute on function public.is_tenant_member(uuid) from public, anon;
revoke execute on function public.has_tenant_role(uuid, text) from public, anon;
revoke execute on function public.is_project_member(uuid) from public, anon;
revoke execute on function public.is_project_lead(uuid) from public, anon;
revoke execute on function public.has_project_role(uuid, text) from public, anon;
