-- =============================================================================
-- Security hardening — revoke EXECUTE on RPC paths that should never be open.
-- =============================================================================
-- Closes two classes of WARN findings reported by the Supabase advisor:
--
--   Class 1 — anon role can call SECURITY DEFINER (lint 0028)
--     Seven functions are currently REST-callable without sign-in. None of
--     them have any legitimate anon-caller; they are all invoked from
--     server-side API routes after `getAuthenticatedUserId()` succeeds.
--     We revoke EXECUTE from `anon` on all seven so the
--     `/rest/v1/rpc/<fn>` endpoint becomes 403 for un-authenticated callers.
--
--   Class 2 — trigger-only audit functions exposed to REST (lint 0028 + 0029)
--     `record_dependency_insert_audit()` and `record_dependency_delete_audit()`
--     are wired exclusively to AFTER INSERT / AFTER DELETE triggers on the
--     `dependencies` table. They take no arguments and do nothing useful
--     when called outside a trigger context. We revoke EXECUTE from
--     `public, anon, authenticated` so the only callers remain the
--     triggers themselves (the trigger executor inherits owner privileges).
--
-- Out of scope (separate, larger refactor):
--   - State-machine RPCs (transition_phase_status, transition_project_status,
--     set_sprint_state, record_approval_response): currently called from
--     server-side API routes via the user-context client. Revoking from
--     `authenticated` would break those routes; the proper fix is to
--     switch the routes to the service-role admin client, which is a
--     larger touch and warrants its own slice.
--   - decrypt_tenant_ai_provider, set_session_encryption_key: same story —
--     server-side `validate` route uses user-context client. Migrating
--     these to admin-client first, then revoking, is a separate slice.
--   - RLS helpers (is_tenant_member, has_tenant_role, has_project_role,
--     is_project_member, is_project_lead, is_tenant_admin): these MUST stay
--     EXECUTE-able by `authenticated` because RLS policies invoke them at
--     query time. Migration `20260504150013_hotfix_grant_rls_helpers_to_authenticated`
--     re-granted these after an earlier over-eager revoke. They are
--     SECURITY DEFINER but only return booleans derived from the caller's
--     JWT — no data leakage. Documented as accepted-risk.
--
-- Idempotent: REVOKE on a privilege that is not granted is a no-op.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Class 1 — revoke EXECUTE from anon on RPCs called only from authed routes
-- ---------------------------------------------------------------------------
revoke execute on function public.accept_ki_suggestion_risk(uuid) from anon;

revoke execute on function public.audit_restore_entity(
  text, uuid, timestamp with time zone
) from anon;

revoke execute on function public.audit_undo_field(uuid) from anon;

revoke execute on function public.convert_open_item_to_decision(
  uuid, text, text, uuid, uuid, uuid
) from anon;

revoke execute on function public.convert_open_item_to_task(uuid) from anon;


-- ---------------------------------------------------------------------------
-- Class 2 — trigger-only audit functions: lock down to triggers only
-- ---------------------------------------------------------------------------
-- These have empty argument lists; they are bound to AFTER INSERT / AFTER
-- DELETE triggers on `dependencies` and produce synthetic audit-log entries.
-- They have no use as a REST RPC.
revoke execute on function public.record_dependency_insert_audit()
  from public, anon, authenticated;

revoke execute on function public.record_dependency_delete_audit()
  from public, anon, authenticated;
