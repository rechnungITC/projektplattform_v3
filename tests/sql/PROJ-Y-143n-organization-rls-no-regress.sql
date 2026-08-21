-- PROJ-Y-143n — Live check: the organization surface's *pre-existing* rights
-- are untouched by the module gate.
--
-- The slice is a TS-layer change: twelve route handlers gained
-- `requireModuleActive`. Nothing in RLS, `route-helpers.ts` or any policy was
-- edited. This block proves that at the layer the change cannot reach, so the
-- claim "no rights regress" rests on measurement rather than on a diff being
-- small: a non-admin member may still READ organization units and locations,
-- and still cannot WRITE them (42501 from the admin-only policies).
--
-- Runs against prod and ENDS IN A RAISE, so everything rolls back — the final
-- error message is the report. Zero residue by construction.
--
-- The member has to be SYNTHESIZED inside the transaction: every membership in
-- the prod seed is `admin` (see docs/production/prod-test-fixtures.md), and
-- under an admin the write vectors would be false-green because the policies
-- grant admins exactly what is being tested for absence.
--
-- Result 2026-08-19 (prod): 6/6 PASS, 0 residue.
do $pt$
declare
  v_tenant uuid; v_admin uuid; v_member uuid;
  v_unit uuid; v_loc uuid;
  v_r text := ''; v_n int;
begin
  -- A tenant that actually holds organization data, so the read vectors are
  -- not vacuously green on an empty table.
  select ou.tenant_id into v_tenant
    from public.organization_units ou group by ou.tenant_id order by count(*) desc limit 1;
  select tm.user_id into v_admin from public.tenant_memberships tm
    where tm.tenant_id = v_tenant and tm.role = 'admin' limit 1;
  select pr.id into v_member from public.profiles pr
    where pr.id <> v_admin
      and not exists (select 1 from public.tenant_memberships m
                       where m.tenant_id = v_tenant and m.user_id = pr.id)
    limit 1;
  insert into public.tenant_memberships (tenant_id, user_id, role)
    values (v_tenant, v_member, 'member');

  select ou.id into v_unit from public.organization_units ou where ou.tenant_id = v_tenant limit 1;
  select l.id into v_loc from public.locations l where l.tenant_id = v_tenant limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_member)::text, true);

  -- V1 — member READ still works (the module gate lives in TS, not in RLS;
  -- had it been pushed into a policy, this is where that would show up).
  select count(*) into v_n from public.organization_units where tenant_id = v_tenant;
  v_r := v_r || format('V1_member_reads_units=%s(n=%s); ',
                       case when v_n > 0 then 'PASS' else 'FAIL' end, v_n);

  select count(*) into v_n from public.locations where tenant_id = v_tenant;
  v_r := v_r || format('V2_member_reads_locations=%s(n=%s); ',
                       case when v_n > 0 then 'PASS' else 'FAIL' end, v_n);

  -- V3 — member INSERT still refused.
  begin
    insert into public.organization_units (tenant_id, name, type)
      values (v_tenant, '143n probe', 'team');
    v_r := v_r || 'V3_member_insert_unit=FAIL(allowed); ';
  exception when insufficient_privilege then
    v_r := v_r || 'V3_member_insert_unit=PASS(42501); ';
  end;

  -- V4 — member UPDATE still refused (RLS makes it a no-op, not an error).
  update public.organization_units set name = '143n probe' where id = v_unit;
  get diagnostics v_n = row_count;
  v_r := v_r || format('V4_member_update_unit=%s(rows=%s); ',
                       case when v_n = 0 then 'PASS' else 'FAIL' end, v_n);

  -- V5 — member DELETE on a location still refused.
  delete from public.locations where id = v_loc;
  get diagnostics v_n = row_count;
  v_r := v_r || format('V5_member_delete_location=%s(rows=%s); ',
                       case when v_n = 0 then 'PASS' else 'FAIL' end, v_n);

  -- V6 — the member is genuinely not an admin. Without this the four vectors
  -- above could all be false-green on an admin identity.
  v_r := v_r || format('V6_not_admin=%s; ',
    case when public.is_tenant_admin(v_tenant) then 'FAIL(is_admin)' else 'PASS' end);

  reset role;
  raise exception 'ROLLBACK_MARKER PROJ-Y-143n: %', v_r;
end $pt$;
