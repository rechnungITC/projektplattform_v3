-- =============================================================================
-- Security hardening — revoke EXECUTE from `authenticated` on
-- convert_open_item_to_decision / convert_open_item_to_task /
-- accept_ki_suggestion_risk now that the API-route callers have been
-- switched to the service-role admin client and pass `p_actor_user_id`
-- explicitly.
-- =============================================================================
-- Companion to `20260506210000_security_open_item_and_ki_actor_param.sql`.
--
-- Routes already migrated:
--   src/app/api/projects/[id]/open-items/[oid]/convert-to-decision/route.ts
--   src/app/api/projects/[id]/open-items/[oid]/convert-to-task/route.ts
--   src/app/api/ki/suggestions/[id]/accept/route.ts
-- =============================================================================

revoke execute on function public.convert_open_item_to_decision(
  uuid, text, text, uuid, uuid, uuid, uuid
) from authenticated;

revoke execute on function public.convert_open_item_to_task(uuid, uuid)
  from authenticated;

revoke execute on function public.accept_ki_suggestion_risk(uuid, uuid)
  from authenticated;
