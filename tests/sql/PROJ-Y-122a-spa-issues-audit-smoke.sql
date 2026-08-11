-- PROJ-Y-122a — Live smoke for the PROJ-122 spa_issues audit wiring.
--
-- WHY THIS EXISTS
-- The defect class it guards against is invisible to every other gate:
--   * route/unit tests mock Supabase and never fire a real trigger,
--   * the Schema Drift Guard only compares SELECT columns,
--   * a silently no-op'd anchor-replace raises nothing at migration time.
-- The only reliable detector is asserting that an UPDATE of a tracked column
-- really produces a field-level audit row, and that the read gate really
-- resolves spa_issues instead of falling through to `else return false`.
-- (feedback_audit_fn_recreate_drops_grant: "Detect: a live smoke that asserts
-- audit >= 1 after an UPDATE of a tracked column".)
--
-- Run against prod after ANY migration that recreates `_tracked_audit_columns`
-- or `can_read_audit_entry` from their live definition.
--
-- Everything runs in one transaction that RAISEs at the end — the seeded
-- projects/issues/memberships/audit rows roll back. 0 residue.
--
-- TWO TRAPS THIS FILE ENCODES (both hit during authoring, 2026-08-11):
--  1. The signature is can_read_audit_entry(entity_type, ENTITY_ID, TENANT_ID).
--     Swapping the last two arguments yields a plausible-looking false FAIL.
--  2. The function opens with `if is_tenant_admin(p_tenant_id) then return
--     true; end if;`. Testing as a tenant admin NEVER reaches the spa_issues
--     branch and would pass even if the branch had been dropped — a
--     false green. C therefore impersonates a NON-admin project member, and
--     the raise echoes `admin_shortcircuit` so a future reader can see the
--     impersonation really took effect (must be `f`).
--
-- Vectors:
--   A  the whitelist resolves spa_issues to its tracked columns
--      (a dropped branch returns array[]::text[] -> FAIL)
--   B  UPDATE of a tracked column writes a field-level audit row
--      (catches the silent no-op; this is the core assertion)
--   C  non-admin project member CAN read the entry -> the CASE branch resolved
--   D  non-admin NON-member is denied -> proves C is not blanket-true
--
-- Result on 2026-08-11 (green):
--   A=PASS B=PASS(rows=1) C=PASS D=PASS admin_shortcircuit=f
--
-- Prod seed shape: see reference_prod_seed_shape.md. The non-admin identity is
-- synthesized inside the transaction (the seed has no non-admin user).

do $$
declare
  v_tenant   uuid := '329f25e5-8b8d-42ac-9f11-4c529883f9a2';
  v_admin    uuid := 'c31d4091-a087-430c-a02c-2d460d95fe18';
  v_outsider uuid := '00000000-0000-0000-0000-000000000e2e';

  v_proj   uuid; v_issue  uuid;   -- C: outsider is a project member here
  v_proj2  uuid; v_issue2 uuid;   -- D: outsider has no membership here

  v_cols text[];
  v_rows int;
  a text; b text; c text; d text;
begin
  -- A ----------------------------------------------------------------------
  v_cols := public._tracked_audit_columns('spa_issues');
  a := case
         when 'title' = any(v_cols) and 'status' = any(v_cols)
          and 'confidentiality_level' = any(v_cols)
         then 'PASS' else 'FAIL(' || coalesce(array_length(v_cols, 1), 0) || ')'
       end;

  insert into public.projects (tenant_id, name, project_type, created_by, responsible_user_id)
  values (v_tenant, 'PROJ-Y-122a smoke A', 'ma', v_admin, v_admin)
  returning id into v_proj;
  insert into public.spa_issues (tenant_id, project_id, issue_number, title, created_by)
  values (v_tenant, v_proj, 9901, 'smoke before', v_admin)
  returning id into v_issue;

  insert into public.projects (tenant_id, name, project_type, created_by, responsible_user_id)
  values (v_tenant, 'PROJ-Y-122a smoke D', 'ma', v_admin, v_admin)
  returning id into v_proj2;
  insert into public.spa_issues (tenant_id, project_id, issue_number, title, created_by)
  values (v_tenant, v_proj2, 9902, 'no access', v_admin)
  returning id into v_issue2;

  -- B ----------------------------------------------------------------------
  update public.spa_issues set title = 'smoke after' where id = v_issue;

  select count(*) into v_rows
    from public.audit_log_entries
   where entity_type = 'spa_issues'
     and entity_id   = v_issue
     and field_name  = 'title';
  b := case when v_rows >= 1 then 'PASS' else 'FAIL' end;

  -- C / D ------------------------------------------------------------------
  -- Synthesize a non-admin identity: member of the tenant, member of v_proj
  -- only. is_project_member() is satisfied by the project_memberships row, so
  -- the gate must go through the spa_issues CASE branch to succeed.
  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (v_tenant, v_outsider, 'member')
  on conflict do nothing;
  insert into public.project_memberships (project_id, user_id, role, created_by)
  values (v_proj, v_outsider, 'viewer', v_admin);

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_outsider::text, 'role', 'authenticated')::text,
    true
  );

  c := case when public.can_read_audit_entry('spa_issues', v_issue, v_tenant)
            then 'PASS' else 'FAIL' end;
  d := case when public.can_read_audit_entry('spa_issues', v_issue2, v_tenant)
            then 'FAIL(leak)' else 'PASS' end;

  raise exception
    'ROLLBACK MARKER — A_whitelist=% B_audit_on_update=%(rows=%) C_member_can_read=% D_nonmember_denied=% admin_shortcircuit=%',
    a, b, v_rows, c, d, public.is_tenant_admin(v_tenant);
end
$$;
