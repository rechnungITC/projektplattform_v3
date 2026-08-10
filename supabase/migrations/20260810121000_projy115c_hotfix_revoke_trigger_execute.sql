-- ---------------------------------------------------------------------------
-- PROJ-Y-115c hotfix — revoke `authenticated` EXECUTE on the two DMS
-- trigger-internal functions.
--
-- Supabase grants EXECUTE to `authenticated` by default at role level (not via
-- PUBLIC), so the `revoke all ... from public` in the parent migration did not
-- remove it and the Supabase advisor flagged both functions as reachable via
-- `/rest/v1/rpc/...` (lint 0029). Postgres does NOT check EXECUTE on a trigger
-- function when a trigger fires it, so revoking is safe — PROJ-68 established
-- exactly this pattern for three trigger-internal SECURITY DEFINER functions.
--
-- The parent migration now carries these revokes as well, so a fresh apply is
-- correct on its own; this file exists to bring the already-migrated prod DB
-- in line. Both are idempotent.
--
-- Deliberately NOT revoked: `_dms_node_ctx` and `_dms_object_access`. RLS
-- policies evaluate them in the caller's context, so `authenticated` must keep
-- EXECUTE. Their advisor WARNs are by-design and match the precedent set by
-- `_comm_entry_visible` / `_comm_in_inner_circle` (PROJ-119).
-- ---------------------------------------------------------------------------

revoke execute on function public._dms_enforce_confidentiality_floor() from authenticated;
revoke execute on function public._dms_cascade_confidentiality_raise() from authenticated;
