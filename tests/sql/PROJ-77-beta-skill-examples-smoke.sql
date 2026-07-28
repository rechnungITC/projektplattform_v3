-- PROJ-77-β — skill_examples RLS + audit smoke (run vs prod via MCP execute_sql).
-- Seeds as postgres, drops to `authenticated` + JWT-claim impersonation, aborts
-- with a rollback-marker → 0 residue. Result: 6/6 PASS (2026-07-27).
-- Examples are ADMIN-ONLY authoring aids (not PM-facing in V1).
--
-- M1 non-admin member SELECT → 0 (admin-only read). M2 member INSERT → blocked
-- (42501). M3 member UPDATE → 0 rows. M4 stranger SELECT → 0 (isolation).
-- M5 admin SELECT → 1. M6 admin UPDATE → 1 row + field-level audit row written.
do $smoke$
declare
  v_tenant uuid := '329f25e5-8b8d-42ac-9f11-4c529883f9a2';
  v_admin uuid := 'c31d4091-a087-430c-a02c-2d460d95fe18';
  v_member uuid := '00000000-0000-0000-0000-000000000e2e';
  v_stranger uuid := '00000000-0000-0000-0000-0000000000ff';
  v_skill uuid; v_ex uuid; v_cnt int; v_rc int; v_audit int;
  v_log text := E'\n=== PROJ-77-β skill_examples SMOKE ===\n';
begin
  insert into public.tenant_memberships (tenant_id, user_id, role) values (v_tenant, v_member, 'member');
  insert into public.skills (tenant_id, name, slug, category, created_by)
    values (v_tenant, 'S', 'proj77b-smoke', 'method', v_admin) returning id into v_skill;
  insert into public.skill_examples (skill_id, tenant_id, title, input, expected_output, created_by)
    values (v_skill, v_tenant, 'Ex1', 'in', 'out', v_admin) returning id into v_ex;

  perform set_config('role','authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role','authenticated')::text, true);
  select count(*) into v_cnt from public.skill_examples where skill_id=v_skill;
  v_log := v_log || format('M1 member SELECT (expect 0, admin-only): %s -> %s%s', v_cnt, case when v_cnt=0 then 'PASS' else 'FAIL' end, E'\n');
  begin
    insert into public.skill_examples (skill_id, tenant_id, title, input, expected_output, created_by) values (v_skill, v_tenant, 'H','i','o', v_member);
    v_log := v_log || 'M2 member INSERT: NOT blocked -> FAIL'||E'\n';
  exception when others then v_log := v_log || format('M2 member INSERT blocked (%s) -> PASS%s', sqlstate, E'\n'); end;
  update public.skill_examples set title='HACK' where id=v_ex;
  get diagnostics v_rc = row_count;
  v_log := v_log || format('M3 member UPDATE (expect 0 rows): %s -> %s%s', v_rc, case when v_rc=0 then 'PASS' else 'FAIL' end, E'\n');

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role','authenticated')::text, true);
  select count(*) into v_cnt from public.skill_examples;
  v_log := v_log || format('M4 stranger SELECT any (expect 0): %s -> %s%s', v_cnt, case when v_cnt=0 then 'PASS' else 'FAIL' end, E'\n');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  select count(*) into v_cnt from public.skill_examples where skill_id=v_skill;
  v_log := v_log || format('M5 admin SELECT (expect 1): %s -> %s%s', v_cnt, case when v_cnt=1 then 'PASS' else 'FAIL' end, E'\n');
  update public.skill_examples set title='Ex1-edited' where id=v_ex;
  get diagnostics v_rc = row_count;
  select count(*) into v_audit from public.audit_log_entries where entity_type='skill_examples' and entity_id=v_ex and field_name='title';
  v_log := v_log || format('M6 admin UPDATE + audit (expect 1 row, >=1 audit): rows=%s audit=%s -> %s%s', v_rc, v_audit, case when v_rc=1 and v_audit>=1 then 'PASS' else 'FAIL' end, E'\n');

  raise exception 'BETA_SMOKE_ROLLBACK %', v_log;
end
$smoke$;