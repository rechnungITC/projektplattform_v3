-- PROJ-76 — state-machine RPC + immutability smoke (run via MCP execute_sql).
-- Seeds a skill + two draft versions in a real tenant as postgres, impersonates
-- the tenant admin via JWT claims, exercises activate/rollback, and aborts with
-- a rollback-marker → 0 residue. Result: 8/8 PASS (2026-07-23).
--
-- A activate v1; B activate v2 → single active + v1 archived + pointer moved;
-- C direct content UPDATE blocked (23514); D direct status UPDATE blocked
-- (23514); E rollback v1 → new v3 with copied content, active, single active;
-- E2 re-activate active version is idempotent; F stranger (non-admin) activate
-- blocked (42501); G audit rows for status + current_version_id changes.
do $smoke$
declare
  v_tenant uuid := '329f25e5-8b8d-42ac-9f11-4c529883f9a2';
  v_admin  uuid := 'c31d4091-a087-430c-a02c-2d460d95fe18';
  v_stranger uuid := '00000000-0000-0000-0000-0000000000ff';
  v_skill uuid; v_v1 uuid; v_v2 uuid; v_v3 uuid;
  v_active_count int; v_status text; v_cur uuid; v_num int; v_content text; v_audit int;
  v_log text := E'\n=== PROJ-76 RPC SMOKE ===\n';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  insert into public.skills (tenant_id, name, slug, description, category, method_tags, project_type_tags, created_by)
    values (v_tenant, 'Smoke Skill', 'smoke-skill-proj76', 'tmp', 'method', array['scrum'], array['erp'], v_admin) returning id into v_skill;
  insert into public.skill_versions (skill_id, tenant_id, version_number, markdown_content, frontmatter, status, created_by)
    values (v_skill, v_tenant, 1, 'BODY-ONE', '{"name":"Smoke Skill"}'::jsonb, 'draft', v_admin) returning id into v_v1;
  insert into public.skill_versions (skill_id, tenant_id, version_number, markdown_content, frontmatter, status, created_by)
    values (v_skill, v_tenant, 2, 'BODY-TWO', '{"name":"Smoke Skill"}'::jsonb, 'draft', v_admin) returning id into v_v2;

  perform public.activate_skill_version(v_v1);
  select status into v_status from public.skill_versions where id = v_v1;
  select current_version_id into v_cur from public.skills where id = v_skill;
  v_log := v_log || format('A activate v1: %s%s', case when v_status='active' and v_cur=v_v1 then 'PASS' else 'FAIL' end, E'\n');

  perform public.activate_skill_version(v_v2);
  select count(*) into v_active_count from public.skill_versions where skill_id=v_skill and status='active';
  select status into v_status from public.skill_versions where id=v_v1;
  select current_version_id into v_cur from public.skills where id=v_skill;
  v_log := v_log || format('B activate v2 (single active + v1 archived + pointer): %s%s', case when v_active_count=1 and v_status='archived' and v_cur=v_v2 then 'PASS' else 'FAIL' end, E'\n');

  begin
    update public.skill_versions set markdown_content='HACK' where id=v_v1;
    v_log := v_log || 'C content immutability: FAIL'||E'\n';
  exception when others then v_log := v_log || format('C content immutability blocked (%s): PASS%s', sqlstate, E'\n'); end;
  begin
    update public.skill_versions set status='active' where id=v_v1;
    v_log := v_log || 'D status immutability: FAIL'||E'\n';
  exception when others then v_log := v_log || format('D status immutability blocked (%s): PASS%s', sqlstate, E'\n'); end;

  v_v3 := public.rollback_skill_version(v_v1);
  select version_number, markdown_content, status into v_num, v_content, v_status from public.skill_versions where id=v_v3;
  select count(*) into v_active_count from public.skill_versions where skill_id=v_skill and status='active';
  select current_version_id into v_cur from public.skills where id=v_skill;
  v_log := v_log || format('E rollback v1 -> v3 copied+active+single (num=%s content=%s): %s%s', v_num, v_content, case when v_num=3 and v_content='BODY-ONE' and v_status='active' and v_active_count=1 and v_cur=v_v3 then 'PASS' else 'FAIL' end, E'\n');

  perform public.activate_skill_version(v_v3);
  select count(*) into v_active_count from public.skill_versions where skill_id=v_skill and status='active';
  v_log := v_log || format('E2 idempotent re-activate: %s%s', case when v_active_count=1 then 'PASS' else 'FAIL' end, E'\n');

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role','authenticated')::text, true);
  begin
    perform public.activate_skill_version(v_v1);
    v_log := v_log || 'F stranger activate: FAIL'||E'\n';
  exception when others then v_log := v_log || format('F stranger activate blocked (%s): PASS%s', sqlstate, E'\n'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);

  select count(*) into v_audit from public.audit_log_entries
   where tenant_id=v_tenant
     and ((entity_type='skill_versions' and entity_id in (v_v1,v_v2,v_v3) and field_name='status')
       or (entity_type='skills' and entity_id=v_skill and field_name='current_version_id'));
  v_log := v_log || format('G audit rows (status + current_version_id) = %s: %s%s', v_audit, case when v_audit >= 3 then 'PASS' else 'FAIL' end, E'\n');

  raise exception 'SMOKE_ROLLBACK %', v_log;
end
$smoke$;
