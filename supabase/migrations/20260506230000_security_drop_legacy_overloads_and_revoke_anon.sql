-- =============================================================================
-- Security cleanup — drop legacy state-machine overloads + revoke anon EXECUTE
-- on the new actor-aware signatures.
-- =============================================================================
--
-- Two issues caught by the post-refactor advisor run:
--
-- 1) Legacy state-machine signatures (no p_actor_user_id) survived the
--    20260506190000 refactor: Postgres treats different argument lists as
--    distinct functions, so `CREATE OR REPLACE FUNCTION foo(a,b,c)` next to
--    an existing `foo(a,b,c)` simply added an overload. The legacy 3-arg
--    `transition_*_status` and 2-arg `set_sprint_state` are still callable
--    and still flagged. Drop them — all known callers (the API routes)
--    were already migrated to pass the 4-arg version.
--
-- 2) The new actor-aware overloads inherit the default `EXECUTE TO PUBLIC`
--    grant on creation, which makes them anon-callable. The original anon
--    revoke migration (20260506160000) only covered the legacy signatures.
--    Revoke EXECUTE from `anon` on the 6 new signatures.
-- =============================================================================

drop function if exists public.set_sprint_state(uuid, text);
drop function if exists public.transition_phase_status(uuid, text, text);
drop function if exists public.transition_project_status(uuid, text, text);

revoke execute on function public.accept_ki_suggestion_risk(uuid, uuid)
  from anon;
revoke execute on function public.convert_open_item_to_decision(
  uuid, text, text, uuid, uuid, uuid, uuid
) from anon;
revoke execute on function public.convert_open_item_to_task(uuid, uuid)
  from anon;
revoke execute on function public.set_sprint_state(uuid, text, uuid)
  from anon;
revoke execute on function public.transition_phase_status(uuid, text, text, uuid)
  from anon;
revoke execute on function public.transition_project_status(uuid, text, text, uuid)
  from anon;
