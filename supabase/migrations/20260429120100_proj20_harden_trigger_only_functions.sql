-- =============================================================================
-- PROJ-20 hardening: revoke EXECUTE on the new trigger-only SECURITY DEFINER
-- functions. Same rationale as 20260428120000 (PROJ-10): trigger context still
-- runs as table-owner, so triggers continue working — only the RPC surface is
-- closed. Convert RPCs `convert_open_item_to_*` are intentionally callable by
-- `authenticated` (auth check is internal) and are NOT revoked here.
-- =============================================================================

revoke execute on function public.record_decision_insert() from public, anon, authenticated;
revoke execute on function public.decisions_after_insert_flip_predecessor() from public, anon, authenticated;
