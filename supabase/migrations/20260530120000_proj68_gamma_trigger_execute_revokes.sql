-- =============================================================================
-- PROJ-68 γ — Trigger function EXECUTE revokes (3 functions)
-- =============================================================================
-- These three SECURITY DEFINER functions are PG triggers — they exist
-- only to be fired by AFTER INSERT/DELETE or BEFORE INSERT/UPDATE on
-- their parent tables, never to be called directly by application code.
-- The default EXECUTE grant exposes them as PostgREST RPC endpoints
-- (`/rest/v1/rpc/<name>`) callable by `anon` and `authenticated`.
--
-- That's the Supabase advisor `anon_security_definer_function_executable`
-- finding (and its `authenticated_*` sibling). The functions are RLS
-- bypasses by design (audit + sync work), so an attacker calling them
-- directly could inject arbitrary audit rows / lane assignments. Revoke
-- EXECUTE from both roles; the trigger mechanism runs as the function
-- owner regardless of session-user grants, so behaviour is unchanged.
-- =============================================================================


revoke execute on function public.record_risk_link_delete_audit() from anon, authenticated, public;
revoke execute on function public.record_risk_link_insert_audit() from anon, authenticated, public;
revoke execute on function public.tg_sync_work_item_compliance_lane_fn() from anon, authenticated, public;


-- =============================================================================
-- Smoke checks
-- =============================================================================
do $smoke$
declare
  v_count int;
begin
  -- After revoke, anon should have 0 grants on these 3 functions.
  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and routine_name in (
      'record_risk_link_delete_audit',
      'record_risk_link_insert_audit',
      'tg_sync_work_item_compliance_lane_fn'
    )
    and grantee = 'anon'
    and privilege_type = 'EXECUTE';
  if v_count <> 0 then
    raise exception 'smoke-fail: anon still has EXECUTE on % trigger functions', v_count;
  end if;

  select count(*) into v_count
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and routine_name in (
      'record_risk_link_delete_audit',
      'record_risk_link_insert_audit',
      'tg_sync_work_item_compliance_lane_fn'
    )
    and grantee = 'authenticated'
    and privilege_type = 'EXECUTE';
  if v_count <> 0 then
    raise exception 'smoke-fail: authenticated still has EXECUTE on % trigger functions', v_count;
  end if;

  raise notice 'PROJ-68 gamma smoke checks passed (3 trigger functions no longer anon/authenticated callable)';
end
$smoke$;
