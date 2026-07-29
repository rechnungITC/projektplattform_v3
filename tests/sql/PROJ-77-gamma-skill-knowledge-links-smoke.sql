-- PROJ-77-γ — skill_knowledge_links RLS + tenant-consistency + audit smoke
-- (run vs prod via MCP execute_sql). Seeds as postgres (incl. two DMS nodes,
-- one per tenant), drops to `authenticated` + JWT-claim impersonation, aborts
-- with a rollback-marker → 0 residue. Result: 7/7 PASS (2026-07-28).
-- Links are ADMIN-ONLY (skill authoring surface; consumed by PROJ-80/82 later).
--
-- G1 admin links a SAME-tenant node → allowed. G2 linking a CROSS-tenant node
--    → rejected by the tenant trigger (23514). G3 duplicate (skill,node) → 23505.
-- G6 admin toggles include_subtree → 1 row + field-level audit row.
-- G4 non-admin member SELECT → 0 (admin-only). G5 member INSERT → 42501.
-- G7 non-member stranger SELECT → 0 (isolation).
do $smoke$
declare
  v_tenant uuid := '329f25e5-8b8d-42ac-9f11-4c529883f9a2';
  v_proj_a uuid := '434eddc2-cff2-4d37-ab7d-1478a2d001a3';
  v_tenant_b uuid := '00000000-0000-0000-0000-000000000e20';
  v_proj_b uuid := 'f6564e78-7a9b-42a6-ab67-fa871657dfc5';
  v_admin uuid := 'c31d4091-a087-430c-a02c-2d460d95fe18';
  v_member uuid := '00000000-0000-0000-0000-000000000e2e';
  v_stranger uuid := '00000000-0000-0000-0000-0000000000ff';
  v_skill uuid; v_node_a uuid; v_node_b uuid; v_link uuid; v_cnt int; v_rc int; v_audit int;
  v_log text := E'\n=== PROJ-77-γ skill_knowledge_links SMOKE ===\n';
begin
  insert into public.tenant_memberships (tenant_id, user_id, role) values (v_tenant, v_member, 'member');
  insert into public.skills (tenant_id, name, slug, category, created_by) values (v_tenant, 'S', 'proj77g-smoke', 'method', v_admin) returning id into v_skill;
  insert into public.document_tree_nodes (tenant_id, project_id, node_type, name, slug) values (v_tenant, v_proj_a, 'folder', 'NodeA', 'node-a-p77g') returning id into v_node_a;
  insert into public.document_tree_nodes (tenant_id, project_id, node_type, name, slug) values (v_tenant_b, v_proj_b, 'folder', 'NodeB', 'node-b-p77g') returning id into v_node_b;

  perform set_config('role','authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  insert into public.skill_knowledge_links (skill_id, document_node_id, tenant_id, include_subtree, link_mode, created_by)
    values (v_skill, v_node_a, v_tenant, true, 'required', v_admin) returning id into v_link;
  v_log := v_log || 'G1 admin link same-tenant node: PASS'||E'\n';
  begin
    insert into public.skill_knowledge_links (skill_id, document_node_id, tenant_id, link_mode, created_by)
      values (v_skill, v_node_b, v_tenant, 'reference', v_admin);
    v_log := v_log || 'G2 cross-tenant node link: NOT blocked -> FAIL'||E'\n';
  exception when others then v_log := v_log || format('G2 cross-tenant node link blocked (%s) -> PASS%s', sqlstate, E'\n'); end;
  begin
    insert into public.skill_knowledge_links (skill_id, document_node_id, tenant_id, link_mode, created_by)
      values (v_skill, v_node_a, v_tenant, 'reference', v_admin);
    v_log := v_log || 'G3 duplicate link: NOT blocked -> FAIL'||E'\n';
  exception when others then v_log := v_log || format('G3 duplicate (skill,node) blocked (%s) -> PASS%s', sqlstate, E'\n'); end;
  update public.skill_knowledge_links set include_subtree=false where id=v_link;
  get diagnostics v_rc = row_count;
  select count(*) into v_audit from public.audit_log_entries where entity_type='skill_knowledge_links' and entity_id=v_link and field_name='include_subtree';
  v_log := v_log || format('G6 admin UPDATE + audit (1 row, >=1 audit): rows=%s audit=%s -> %s%s', v_rc, v_audit, case when v_rc=1 and v_audit>=1 then 'PASS' else 'FAIL' end, E'\n');

  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role','authenticated')::text, true);
  select count(*) into v_cnt from public.skill_knowledge_links where skill_id=v_skill;
  v_log := v_log || format('G4 member SELECT (expect 0, admin-only): %s -> %s%s', v_cnt, case when v_cnt=0 then 'PASS' else 'FAIL' end, E'\n');
  begin
    insert into public.skill_knowledge_links (skill_id, document_node_id, tenant_id, link_mode, created_by)
      values (v_skill, v_node_a, v_tenant, 'reference', v_member);
    v_log := v_log || 'G5 member INSERT: NOT blocked -> FAIL'||E'\n';
  exception when others then v_log := v_log || format('G5 member INSERT blocked (%s) -> PASS%s', sqlstate, E'\n'); end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role','authenticated')::text, true);
  select count(*) into v_cnt from public.skill_knowledge_links;
  v_log := v_log || format('G7 stranger SELECT any (expect 0): %s -> %s%s', v_cnt, case when v_cnt=0 then 'PASS' else 'FAIL' end, E'\n');

  raise exception 'GAMMA_SMOKE_ROLLBACK %', v_log;
end
$smoke$;
