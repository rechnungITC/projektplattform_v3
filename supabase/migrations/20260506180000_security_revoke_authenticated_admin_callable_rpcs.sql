-- =============================================================================
-- Security hardening — revoke EXECUTE from `authenticated` on RPCs whose
-- API-route callers were switched to the service-role admin client.
-- =============================================================================
-- Companion migration to the route changes in this slice. Closes 4 of the
-- WARN findings reported by the Supabase advisor (lint 0029):
--
--   compute_critical_path_phases(uuid)
--     - Pure read; no auth.uid() inside.
--     - Callers switched to admin client:
--         src/app/api/projects/[id]/critical-path/route.ts
--         src/app/api/projects/[id]/stakeholder-health/route.ts
--       Both gate by `requireProjectAccess(... 'view')` before invoking.
--
--   audit_undo_field(uuid)
--     - No auth.uid() inside; SECURITY DEFINER for cross-table audit log
--       reads/writes.
--     - Caller switched to admin client:
--         src/app/api/audit/entries/[id]/undo/route.ts
--       Gates by `requireProjectAccess(... 'edit')` first.
--
--   audit_restore_entity(text, uuid, timestamp with time zone)
--     - No auth.uid() inside.
--     - Caller switched to admin client:
--         src/app/api/audit/[entity_type]/[entity_id]/restore/route.ts
--       Gates by `requireProjectAccess(... 'edit')` first.
--
--   tenant_ai_monthly_usage(uuid, integer, integer)
--     - Pure aggregate over ki_runs; no auth.uid() inside.
--     - Caller hardened in `src/lib/ai/cost-cap.ts` to dynamically import
--       and use the admin client for the RPC (with fallback to the
--       supplied user-context client for the test path that injects
--       its own rpc mock).
--
-- Out of scope (still WARN, require larger refactor — they call auth.uid()
-- internally so callers must accept an explicit p_actor_user_id arg first):
--   accept_ki_suggestion_risk, convert_open_item_to_decision,
--   convert_open_item_to_task, record_tenant_ai_cost_cap_audit,
--   record_tenant_ai_priority_audit, record_approval_response,
--   set_sprint_state, transition_phase_status, transition_project_status.
--
-- Out of scope (require careful GUC/session pattern check):
--   decrypt_tenant_ai_provider, set_session_encryption_key.
--
-- Out of scope (must stay open for RLS policy evaluation):
--   is_tenant_member, is_tenant_admin, has_tenant_role, is_project_member,
--   has_project_role, is_project_lead.
--
-- Idempotent: REVOKE on a privilege that is not granted is a no-op.
-- =============================================================================

revoke execute on function public.compute_critical_path_phases(uuid)
  from authenticated;

revoke execute on function public.audit_undo_field(uuid)
  from authenticated;

revoke execute on function public.audit_restore_entity(
  text, uuid, timestamp with time zone
) from authenticated;

revoke execute on function public.tenant_ai_monthly_usage(
  uuid, integer, integer
) from authenticated;
