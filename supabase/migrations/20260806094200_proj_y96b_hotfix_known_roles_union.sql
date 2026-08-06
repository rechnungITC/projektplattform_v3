-- PROJ-Y-96b HOTFIX — `apply_ma_project_template` referenced
-- `public.resources.role_key`, but `resources` was reworked earlier and no
-- longer carries a `role_key` column (only the PROJ-24 audit-tracked-column
-- whitelist still mentions it historically). Live pentest 2026-08-06 hit
-- `column "role_key" does not exist` on every apply → RPC was broken from
-- section 6 of 20260806093200_proj_y96b_ma_template_raci.
--
-- Fix: drop `resources` from the "known role_key" union. Authoritative
-- role_key catalogs are `role_rates.role_key` + `stakeholders.role_key`.
-- Base migration file is edited to match so schema-drift-CI sees the same
-- final RPC body on fresh apply.
--
-- Idempotent: `create or replace function` preserves grants.

create or replace function public.apply_ma_project_template(p_project_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_tenant uuid;
  v_type text;
  v_caller uuid := auth.uid();
  v_tpl public.ma_project_templates%rowtype;
  v_phase_result jsonb;
  v_ws_created int := 0;
  v_del_created int := 0;
  v_raci_created int := 0;
  v_known_roles text[];
  v_warnings jsonb := '[]'::jsonb;
  r record;
  v_target_id uuid;
  v_result jsonb;
begin
  select tenant_id, project_type into v_tenant, v_type
  from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if v_type is distinct from 'ma' then
    raise exception 'template apply is only allowed for M&A projects' using errcode = 'P0001';
  end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to apply a template to this project' using errcode = '42501';
  end if;

  select * into v_tpl from public.ma_project_templates
  where id = p_template_id and tenant_id = v_tenant and is_active = true;
  if not found then
    raise exception 'template not found or inactive in this tenant' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.workstreams where project_id = p_project_id) then
    raise exception 'project already has workstreams; template can only be applied to an empty M&A project'
      using errcode = 'P0001';
  end if;

  v_phase_result := public.activate_ma_phase_model(p_project_id);

  insert into public.workstreams
    (tenant_id, project_id, workstream_key, label, goal, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, tw.workstream_key, tw.label, tw.goal, tw.confidentiality_level, tw.sort_order,
         v_caller, v_tpl.id, v_tpl.version
  from public.ma_template_workstreams tw
  where tw.template_id = v_tpl.id;
  get diagnostics v_ws_created = row_count;

  insert into public.deliverables
    (tenant_id, project_id, workstream_id, name, description, status, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, w.id, td.name, td.description, td.status, td.confidentiality_level, td.sort_order,
         v_caller, v_tpl.id, v_tpl.version
  from public.ma_template_deliverables td
  join public.workstreams w
    on w.project_id = p_project_id and w.workstream_key = td.workstream_key
  where td.template_id = v_tpl.id;
  get diagnostics v_del_created = row_count;

  -- HOTFIX: drop resources from the union — the column was removed from the live schema.
  select coalesce(array_agg(distinct role_key), array[]::text[])
    into v_known_roles
    from (
      select role_key from public.role_rates   where tenant_id = v_tenant
      union
      select role_key from public.stakeholders where tenant_id = v_tenant
    ) roles
   where role_key is not null;

  for r in
    select mr.target_type, mr.target_key, trim(mr.role_key) as role_key, mr.raci_letter
      from public.ma_template_raci mr
     where mr.template_id = v_tpl.id
     order by mr.sort_order, mr.target_type, mr.target_key, mr.role_key
  loop
    v_target_id := null;
    if r.target_type = 'workstream' then
      select id into v_target_id
        from public.workstreams
       where project_id = p_project_id and workstream_key = r.target_key;
    elsif r.target_type = 'deliverable' then
      select d.id into v_target_id
        from public.deliverables d
        join public.ma_template_deliverables td
          on td.template_id = v_tpl.id and td.deliverable_key = r.target_key
       where d.project_id = p_project_id
         and d.source_template_id = v_tpl.id
         and d.name = td.name
       limit 1;
    end if;

    if v_target_id is null then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'raci_orphan_target',
        'target_type', r.target_type,
        'target_key', r.target_key,
        'role_key', r.role_key
      );
      continue;
    end if;

    if not (r.role_key = any (v_known_roles)) then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'raci_unknown_role_key',
        'target_type', r.target_type,
        'target_key', r.target_key,
        'role_key', r.role_key
      );
    end if;

    insert into public.raci_assignments
      (tenant_id, project_id, target_type, target_id, role_key, raci_letter,
       created_by, source_template_id, source_template_version)
    values
      (v_tenant, p_project_id, r.target_type, v_target_id, r.role_key, r.raci_letter,
       v_caller, v_tpl.id, v_tpl.version);
    v_raci_created := v_raci_created + 1;
  end loop;

  v_result := jsonb_build_object(
    'template_id', v_tpl.id,
    'template_version', v_tpl.version,
    'phase_model', v_phase_result,
    'workstreams_created', v_ws_created,
    'deliverables_created', v_del_created,
    'raci_created', v_raci_created
  );
  if jsonb_array_length(v_warnings) > 0 then
    v_result := v_result || jsonb_build_object('warnings', v_warnings);
  end if;
  return v_result;
end;
$$;

revoke all on function public.apply_ma_project_template(uuid, uuid) from public, anon;
grant execute on function public.apply_ma_project_template(uuid, uuid) to authenticated;
