-- =============================================================================
-- PROJ-65 ε.3c.α — Plan-Mutate Lock + Audit Hardening
-- =============================================================================
-- Pre-Pilot-Gate before multi-editor activation. Fixes 2 Medium-severity bugs
-- found in /qa ε.3b (Section BB):
--
--   F-PROJ-65-50: Empty `if_updated_at` skipped lock-check for all nodes.
--     A frontend bug or hostile client could send `if_updated_at: []` and
--     the RPC would mutate without optimistic-lock protection.
--     Fix: require `if_updated_at` to contain at minimum an entry for the
--     `p_source_node_id` of matching kind. Return 422 with explicit error
--     when missing.
--
--   F-PROJ-65-51: `plan_mutate_undo_atomic` only filtered audit rows by
--     `tenant_id`, not by `p_project_id`. A user with editor-role in both
--     project P1 and P2 of the same tenant could call undo with a
--     causation_id from P1 while passing `p_project_id = P2`, and the RPC
--     would reverse-apply rows that don't belong to P2.
--     Fix: for each audit row, resolve the entity's project_id and require
--     it equals `p_project_id`. Return 403 with `cross_project_undo_forbidden`
--     when any audit row's project_id doesn't match.
--
-- Both fixes are CREATE OR REPLACE of the existing RPCs from migration
-- 20260522170000. Function signature unchanged; GRANTs unchanged
-- (anon already revoked via 20260522170100).
-- =============================================================================

create or replace function public.plan_mutate_atomic(
  p_project_id uuid,
  p_source_node_id uuid,
  p_source_node_kind text,
  p_intent jsonb,
  p_if_updated_at jsonb
)
returns jsonb
language plpgsql security definer volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid; v_actor uuid; v_flag boolean; v_can_edit boolean; v_cost_clear boolean;
  v_intent_kind text; v_shift_days int; v_causation uuid := gen_random_uuid();
  v_visited uuid[] := array[]::uuid[]; v_queue uuid[] := array[]::uuid[];
  v_queue_kinds text[] := array[]::text[]; v_depth int := 0; v_max_depth int := 10;
  v_cur_id uuid; v_cur_kind text; v_next_ids uuid[]; v_next_kinds text[]; v_idx int;
  v_phase_ids uuid[] := array[]::uuid[]; v_sprint_ids uuid[] := array[]::uuid[];
  v_lock_entry jsonb; v_lock_node uuid; v_lock_kind text; v_lock_ts timestamptz; v_db_ts timestamptz;
  v_conflicts uuid[] := array[]::uuid[]; v_diff jsonb := '[]'::jsonb; v_row record;
  v_old_start date; v_old_end date; v_new_start date; v_new_end date;
  -- F-50 helper:
  v_source_lock_seen boolean := false;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'project_not_found');
  end if;
  select trajectory_plan_mutate_enabled into v_flag
    from public.tenant_settings where tenant_id = v_tenant;
  if not coalesce(v_flag, false) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'feature_disabled');
  end if;
  v_can_edit := public.is_tenant_admin(v_tenant)
             or public.has_project_role(p_project_id, 'lead')
             or public.has_project_role(p_project_id, 'editor');
  if not v_can_edit then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  end if;
  v_cost_clear := public.is_tenant_admin(v_tenant)
               or public.has_project_role(p_project_id, 'lead');

  v_intent_kind := p_intent->>'kind';
  if v_intent_kind is null or v_intent_kind <> 'shift_dates' then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'unsupported_intent_kind');
  end if;
  v_shift_days := coalesce((p_intent->>'days')::int, 0);
  if v_shift_days = 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'shift_days_required_nonzero');
  end if;
  if p_source_node_kind not in ('phase','sprint') then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'unsupported_source_node_kind');
  end if;

  -- ---------------------------------------------------------------------------
  -- F-PROJ-65-50: Enforce that `if_updated_at` is a non-empty array that
  -- contains at minimum an entry for the source_node. A bug or hostile client
  -- sending an empty array would otherwise bypass the optimistic-lock branch.
  -- ---------------------------------------------------------------------------
  if jsonb_typeof(p_if_updated_at) <> 'array' or jsonb_array_length(p_if_updated_at) = 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'if_updated_at_required',
      'hint', 'Array must contain at minimum the source_node entry with current updated_at.');
  end if;

  for v_lock_entry in select * from jsonb_array_elements(p_if_updated_at) loop
    if (v_lock_entry->>'node_id')::uuid = p_source_node_id
       and (v_lock_entry->>'node_kind') = p_source_node_kind then
      v_source_lock_seen := true;
      exit;
    end if;
  end loop;
  if not v_source_lock_seen then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'source_node_lock_missing',
      'hint', 'if_updated_at must include an entry for the source_node.');
  end if;

  -- ---------------------------------------------------------------------------
  -- BFS cycle detection (unchanged from ε.3b).
  -- ---------------------------------------------------------------------------
  v_queue := array[p_source_node_id];
  v_queue_kinds := array[p_source_node_kind];
  v_visited := array[p_source_node_id];

  while array_length(v_queue, 1) > 0 and v_depth < v_max_depth loop
    v_next_ids := array[]::uuid[];
    v_next_kinds := array[]::text[];
    for v_idx in 1..array_length(v_queue, 1) loop
      v_cur_id := v_queue[v_idx];
      v_cur_kind := v_queue_kinds[v_idx];
      if v_cur_kind = 'phase' then
        v_phase_ids := array_append(v_phase_ids, v_cur_id);
      elsif v_cur_kind = 'sprint' then
        v_sprint_ids := array_append(v_sprint_ids, v_cur_id);
      end if;
      if v_cur_kind = 'phase' then
        for v_row in
          select d.to_id, d.to_type
            from public.dependencies d
           where d.project_id = p_project_id
             and d.from_type = 'phase'
             and d.from_id = v_cur_id
        loop
          if v_row.to_id = p_source_node_id then
            return jsonb_build_object('ok', false, 'status', 422,
              'cycle', jsonb_build_object(
                'detected_at_node_id', v_cur_id,
                'path', to_jsonb(v_visited)));
          end if;
          if not (v_row.to_id = any(v_visited)) then
            v_visited := array_append(v_visited, v_row.to_id);
            v_next_ids := array_append(v_next_ids, v_row.to_id);
            v_next_kinds := array_append(v_next_kinds, v_row.to_type);
          end if;
        end loop;
      end if;
    end loop;
    v_queue := v_next_ids;
    v_queue_kinds := v_next_kinds;
    v_depth := v_depth + 1;
  end loop;

  -- Optimistic-lock check (per-node updated_at). Unchanged from ε.3b.
  for v_lock_entry in select * from jsonb_array_elements(p_if_updated_at) loop
    v_lock_node := (v_lock_entry->>'node_id')::uuid;
    v_lock_kind := v_lock_entry->>'node_kind';
    v_lock_ts := (v_lock_entry->>'updated_at')::timestamptz;
    v_db_ts := null;
    if v_lock_kind = 'phase' then
      select updated_at into v_db_ts from public.phases where id = v_lock_node;
    elsif v_lock_kind = 'sprint' then
      select updated_at into v_db_ts from public.sprints where id = v_lock_node;
    elsif v_lock_kind = 'milestone' then
      select updated_at into v_db_ts from public.milestones where id = v_lock_node;
    elsif v_lock_kind in ('work_item','work_package','todo','epic','feature','story','task','subtask','bug') then
      select updated_at into v_db_ts from public.work_items where id = v_lock_node;
    end if;
    if v_db_ts is null then
      v_conflicts := array_append(v_conflicts, v_lock_node);
    elsif v_db_ts is distinct from v_lock_ts then
      v_conflicts := array_append(v_conflicts, v_lock_node);
    end if;
  end loop;

  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object('ok', false, 'status', 409,
      'conflict', jsonb_build_object(
        'conflicted_node_ids', to_jsonb(v_conflicts),
        'current_snapshot_hint', jsonb_build_object('updated_at', now())));
  end if;

  perform set_config('audit.causation_id', v_causation::text, true);
  perform set_config('audit.change_reason', 'plan_mutate', true);

  v_diff := '[]'::jsonb;
  if array_length(v_phase_ids, 1) > 0 then
    for v_row in
      select p.id, p.name, p.planned_start, p.planned_end
        from public.phases p
       where p.id = any(v_phase_ids)
         and p.project_id = p_project_id
         and p.is_deleted = false
    loop
      v_old_start := v_row.planned_start;
      v_old_end := v_row.planned_end;
      v_new_start := v_old_start + (v_shift_days || ' days')::interval;
      v_new_end := v_old_end + (v_shift_days || ' days')::interval;
      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'phase', 'node_label', v_row.name,
          'field', 'start_date',
          'before', jsonb_build_object('kind','exact','value', v_old_start),
          'after',  jsonb_build_object('kind','exact','value', v_new_start),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false),
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'phase', 'node_label', v_row.name,
          'field', 'end_date',
          'before', jsonb_build_object('kind','exact','value', v_old_end),
          'after',  jsonb_build_object('kind','exact','value', v_new_end),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false));
    end loop;
    update public.phases p
       set planned_start = p.planned_start + (v_shift_days || ' days')::interval,
           planned_end   = p.planned_end   + (v_shift_days || ' days')::interval
     where p.id = any(v_phase_ids)
       and p.project_id = p_project_id
       and p.is_deleted = false;
  end if;

  if array_length(v_sprint_ids, 1) > 0 then
    for v_row in
      select s.id, s.name, s.start_date, s.end_date
        from public.sprints s
       where s.id = any(v_sprint_ids)
         and s.project_id = p_project_id
    loop
      v_old_start := v_row.start_date;
      v_old_end := v_row.end_date;
      v_new_start := v_old_start + (v_shift_days || ' days')::interval;
      v_new_end := v_old_end + (v_shift_days || ' days')::interval;
      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'sprint', 'node_label', v_row.name,
          'field', 'start_date',
          'before', jsonb_build_object('kind','exact','value', v_old_start),
          'after',  jsonb_build_object('kind','exact','value', v_new_start),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false),
        jsonb_build_object('node_id', v_row.id, 'node_kind', 'sprint', 'node_label', v_row.name,
          'field', 'end_date',
          'before', jsonb_build_object('kind','exact','value', v_old_end),
          'after',  jsonb_build_object('kind','exact','value', v_new_end),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false));
    end loop;
    update public.sprints s
       set start_date = s.start_date + (v_shift_days || ' days')::interval,
           end_date   = s.end_date   + (v_shift_days || ' days')::interval
     where s.id = any(v_sprint_ids)
       and s.project_id = p_project_id;
  end if;

  if not v_cost_clear then
    v_diff := v_diff || jsonb_build_array(
      jsonb_build_object('node_id', p_source_node_id, 'node_kind', p_source_node_kind,
        'node_label', null, 'field', 'cost_estimate',
        'before', jsonb_build_object('kind','masked','value', null),
        'after',  jsonb_build_object('kind','aggregate','bucket', public._cost_aggregate_bucket(0)),
        'severity', 'neutral', 'masked', true));
  end if;

  declare
    v_top3 jsonb := '[]'::jsonb;
    v_max_score smallint := 0;
    v_max_bucket text := 'low';
  begin
    for v_row in
      select r.id, r.title, r.score
        from public.risks r
       where r.project_id = p_project_id and r.status = 'open'
       order by r.score desc nulls last limit 3
    loop
      v_top3 := v_top3 || jsonb_build_array(jsonb_build_object(
        'risk_id', v_row.id, 'title', v_row.title,
        'severity', public._risk_severity_bucket(v_row.score)));
      if v_row.score > v_max_score then
        v_max_score := v_row.score;
        v_max_bucket := public._risk_severity_bucket(v_row.score);
      end if;
    end loop;
    if jsonb_array_length(v_top3) > 0 then
      v_diff := v_diff || jsonb_build_array(
        jsonb_build_object('node_id', p_source_node_id, 'node_kind', p_source_node_kind,
          'node_label', null, 'field', 'risk_severity',
          'before', jsonb_build_object('kind','enum','value', v_max_bucket),
          'after',  jsonb_build_object('kind','enum','value', v_max_bucket),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false, 'top_3_risks', v_top3));
    end if;
  end;

  return jsonb_build_object('ok', true, 'causation_id', v_causation,
    'diff', jsonb_build_object('affected', v_diff));
end;
$$;

revoke all on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) from public;
revoke execute on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) from anon;
grant execute on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) to authenticated;

-- =============================================================================
-- F-PROJ-65-51: plan_mutate_undo_atomic validates entity → project_id matches.
-- =============================================================================
create or replace function public.plan_mutate_undo_atomic(
  p_project_id uuid,
  p_causation_id uuid
)
returns jsonb
language plpgsql security definer volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid; v_actor uuid; v_flag boolean; v_can_edit boolean;
  v_new_causation uuid := gen_random_uuid();
  v_conflicts uuid[] := array[]::uuid[]; v_diff jsonb := '[]'::jsonb;
  v_audit record; v_sql text; v_count int := 0;
  -- F-51 helpers:
  v_entity_project uuid;
  v_cross_project_ids uuid[] := array[]::uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'project_not_found');
  end if;
  select trajectory_plan_mutate_enabled into v_flag
    from public.tenant_settings where tenant_id = v_tenant;
  if not coalesce(v_flag, false) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'feature_disabled');
  end if;
  v_can_edit := public.is_tenant_admin(v_tenant)
             or public.has_project_role(p_project_id, 'lead')
             or public.has_project_role(p_project_id, 'editor');
  if not v_can_edit then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden');
  end if;

  -- ---------------------------------------------------------------------------
  -- F-PROJ-65-51: BEFORE undo, scan all audit rows for the causation_id and
  -- verify each entity_id belongs to p_project_id. If any cross-project rows
  -- are found, reject the entire undo with 403 cross_project_undo_forbidden.
  -- This blocks an editor with rights in multiple projects from undo-ing a
  -- causation_id that doesn't belong to the project they're claiming.
  -- ---------------------------------------------------------------------------
  for v_audit in
    select a.entity_type, a.entity_id
      from public.audit_log_entries a
     where a.causation_id = p_causation_id
       and a.tenant_id = v_tenant
       and a.entity_type in ('phases','sprints')
  loop
    v_entity_project := null;
    if v_audit.entity_type = 'phases' then
      select project_id into v_entity_project from public.phases where id = v_audit.entity_id;
    elsif v_audit.entity_type = 'sprints' then
      select project_id into v_entity_project from public.sprints where id = v_audit.entity_id;
    end if;
    if v_entity_project is null or v_entity_project is distinct from p_project_id then
      if not (v_audit.entity_id = any(v_cross_project_ids)) then
        v_cross_project_ids := array_append(v_cross_project_ids, v_audit.entity_id);
      end if;
    end if;
  end loop;

  if array_length(v_cross_project_ids, 1) > 0 then
    return jsonb_build_object('ok', false, 'status', 403,
      'error', 'cross_project_undo_forbidden',
      'hint', 'Causation_id contains audit rows for entities outside the given p_project_id.');
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 1 — per-row updated_at-check (unchanged from ε.3b).
  -- ---------------------------------------------------------------------------
  for v_audit in
    select a.id, a.entity_type, a.entity_id, a.field_name,
           a.old_value, a.new_value, a.changed_at
      from public.audit_log_entries a
     where a.causation_id = p_causation_id
       and a.tenant_id = v_tenant
       and a.entity_type in ('phases','sprints')
     order by a.changed_at asc
  loop
    if v_audit.entity_type = 'phases' then
      perform 1 from public.phases
        where id = v_audit.entity_id and updated_at > v_audit.changed_at;
      if found then v_conflicts := array_append(v_conflicts, v_audit.entity_id); end if;
    elsif v_audit.entity_type = 'sprints' then
      perform 1 from public.sprints
        where id = v_audit.entity_id and updated_at > v_audit.changed_at;
      if found then v_conflicts := array_append(v_conflicts, v_audit.entity_id); end if;
    end if;
  end loop;

  if array_length(v_conflicts, 1) > 0 then
    return jsonb_build_object('ok', false, 'status', 409,
      'conflict', jsonb_build_object(
        'conflicted_node_ids', to_jsonb(v_conflicts),
        'current_snapshot_hint', jsonb_build_object('updated_at', now())));
  end if;

  perform set_config('audit.causation_id', v_new_causation::text, true);
  perform set_config('audit.change_reason', 'plan_mutate_undo', true);

  for v_audit in
    select a.id, a.entity_type, a.entity_id, a.field_name,
           a.old_value, a.new_value
      from public.audit_log_entries a
     where a.causation_id = p_causation_id
       and a.tenant_id = v_tenant
       and a.entity_type in ('phases','sprints')
     order by a.changed_at asc
  loop
    if not (v_audit.field_name = any(public._tracked_audit_columns(v_audit.entity_type))) then
      continue;
    end if;
    v_sql := format('update public.%I set %I = $1 where id = $2',
      v_audit.entity_type, v_audit.field_name);
    if v_audit.entity_type = 'phases' and v_audit.field_name in ('planned_start','planned_end') then
      execute v_sql using (v_audit.old_value #>> '{}')::date, v_audit.entity_id;
    elsif v_audit.entity_type = 'sprints' and v_audit.field_name in ('start_date','end_date') then
      execute v_sql using (v_audit.old_value #>> '{}')::date, v_audit.entity_id;
    else
      execute v_sql using v_audit.old_value, v_audit.entity_id;
    end if;
    v_count := v_count + 1;
    v_diff := v_diff || jsonb_build_array(
      jsonb_build_object('node_id', v_audit.entity_id,
        'node_kind', case when v_audit.entity_type = 'phases' then 'phase' else 'sprint' end,
        'node_label', null,
        'field', case when v_audit.field_name in ('planned_start','start_date') then 'start_date' else 'end_date' end,
        'before', jsonb_build_object('kind','exact','value', v_audit.new_value),
        'after',  jsonb_build_object('kind','exact','value', v_audit.old_value),
        'severity', 'neutral', 'masked', false));
  end loop;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'causation_not_found');
  end if;
  return jsonb_build_object('ok', true, 'causation_id', v_new_causation,
    'diff', jsonb_build_object('affected', v_diff));
end;
$$;

revoke all on function public.plan_mutate_undo_atomic(uuid, uuid) from public;
revoke execute on function public.plan_mutate_undo_atomic(uuid, uuid) from anon;
grant execute on function public.plan_mutate_undo_atomic(uuid, uuid) to authenticated;

comment on function public.plan_mutate_atomic(uuid, uuid, text, jsonb, jsonb) is
  'PROJ-65 ε.3c.α — atomic Plan-Mutate with mandatory source_node lock-check (F-50). Returns 422 if_updated_at_required or source_node_lock_missing when array is empty or lacks source_node entry. CIA-locked: L21-L26 + L27 (Pre-Pilot-Gate).';
comment on function public.plan_mutate_undo_atomic(uuid, uuid) is
  'PROJ-65 ε.3c.α — Single-Step Undo via causation_id. Validates each audit row''s entity → project_id matches p_project_id; returns 403 cross_project_undo_forbidden otherwise (F-51).';

-- =============================================================================
-- Smoke-test: confirm function-body changes are picked up.
-- =============================================================================
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
   where n.nspname='public' and p.proname='plan_mutate_atomic';
  if v_def not like '%source_node_lock_missing%' then
    raise exception 'smoke-fail: plan_mutate_atomic missing F-50 check';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
   where n.nspname='public' and p.proname='plan_mutate_undo_atomic';
  if v_def not like '%cross_project_undo_forbidden%' then
    raise exception 'smoke-fail: plan_mutate_undo_atomic missing F-51 check';
  end if;

  raise notice 'smoke: F-50 + F-51 patches both present in deployed RPC bodies';
end$$;
