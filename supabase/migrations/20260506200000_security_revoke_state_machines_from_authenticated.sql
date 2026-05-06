-- =============================================================================
-- Security hardening — revoke EXECUTE from `authenticated` on the 3 state-
-- machine RPCs once their API-route callers have been switched to the
-- service-role admin client.
-- =============================================================================
-- Companion to `20260506190000_security_state_machines_actor_param.sql`,
-- which extended the function signatures with `p_actor_user_id default null`
-- and replaced the `auth.uid()`-bound authz helpers with direct
-- `tenant_memberships` / `project_memberships` lookups against the param.
--
-- Routes already migrated:
--   src/app/api/projects/[id]/transition/route.ts
--   src/app/api/projects/[id]/phases/[pid]/transition/route.ts
--   src/app/api/projects/[id]/sprints/[sid]/state/route.ts
--
-- Effect: REST callers via /rest/v1/rpc/<fn> with an `authenticated` JWT now
-- get 403. The API routes (admin-client) keep working because service_role
-- inherits EXECUTE from the function-creator pattern.
-- =============================================================================

revoke execute on function public.transition_project_status(uuid, text, text, uuid)
  from authenticated;
revoke execute on function public.transition_phase_status(uuid, text, text, uuid)
  from authenticated;
revoke execute on function public.set_sprint_state(uuid, text, uuid)
  from authenticated;
