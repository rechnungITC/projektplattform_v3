-- =============================================================================
-- Security cleanup — revoke EXECUTE FROM PUBLIC on actor-aware RPC overloads.
-- =============================================================================
-- Postgres CREATE FUNCTION grants EXECUTE TO PUBLIC by default. PUBLIC is
-- a meta-role that includes both `anon` and `authenticated`, so the earlier
-- `revoke from anon` / `revoke from authenticated` migrations did not move
-- the advisor needle for the new actor-aware overloads — the PUBLIC grant
-- still satisfied both roles.
--
-- Revoke EXECUTE FROM PUBLIC explicitly so only `service_role` retains it
-- (postgres superuser keeps EXECUTE inherently).
-- =============================================================================

revoke execute on function public.accept_ki_suggestion_risk(uuid, uuid)
  from public;

revoke execute on function public.convert_open_item_to_decision(
  uuid, text, text, uuid, uuid, uuid, uuid
) from public;

revoke execute on function public.convert_open_item_to_task(uuid, uuid)
  from public;

revoke execute on function public.set_sprint_state(uuid, text, uuid)
  from public;

revoke execute on function public.transition_phase_status(uuid, text, text, uuid)
  from public;

revoke execute on function public.transition_project_status(uuid, text, text, uuid)
  from public;
