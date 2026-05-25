-- =============================================================================
-- PROJ-65 ε.3c.β — Plan-Mutate Bulk Multi-Source
-- =============================================================================
-- Backwards-compat extension of ε.3b/α plan_mutate_atomic. The existing
-- 5-arg signature (single-source) stays untouched (route still calls it).
-- This migration adds a NEW 4-arg overload, plan_mutate_atomic_bulk, that
-- takes an array of sources `[{ node_id, node_kind }, ...]` and applies the
-- same atomic shift_dates intent across all of them under ONE causation_id,
-- with a SHARED visited-set across all BFS walks (R-D4 dedupe overlap).
--
-- Critical guarantees (from CIA + ε.3c.α-hardening, locks L29-L36):
--
--   * L30 atomicity: ANY permission/cycle/lock failure across ALL sources
--     aborts the entire operation. No partial-apply. We return early with
--     the same envelope shape used by the single-source RPC.
--
--   * F-50 multi-source extension: every source_node_id MUST appear in
--     `p_if_updated_at` with a matching node_kind. If ANY is missing,
--     return 422 `source_node_lock_missing` with a hint listing the
--     missing IDs.
--
--   * Shared visited-set: a single `v_visited uuid[]` is threaded across
--     all per-source BFS walks. This prevents double-traversal of nodes
--     reachable from multiple sources and dedupes the UPDATE row-set.
--
--   * 422-cycle source attribution: when a cycle is detected during a
--     source-walk, the response carries `cycle.source_node_id` so the FE
--     can highlight WHICH source triggered the failure.
--
--   * One causation_id for the bulk: the single GUC value groups all
--     audit entries from all source-walks → Single-Step Undo via
--     plan_mutate_undo_atomic naturally reverses the entire bulk.
--
--   * R-H3 bulk-UPDATE pattern preserved: phase_ids / sprint_ids
--     accumulate across all source-walks, then two UPDATE statements
--     fire (one per target table).
--
--   * Risk Top-3 is done ONCE per project (project-level rollup),
--     not per source.
--
-- Permissions/grants: REVOKE from public/anon, GRANT EXECUTE to authenticated.
-- =============================================================================

create or replace function public.plan_mutate_atomic_bulk(
  p_project_id uuid,
  p_sources jsonb,
  p_intent jsonb,
  p_if_updated_at jsonb
)
returns jsonb
language plpgsql security definer volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_flag boolean;
  v_can_edit boolean;
  v_cost_clear boolean;
  v_intent_kind text;
  v_shift_days int;
  v_causation uuid := gen_random_uuid();

  -- Source iteration state
  v_source_entry jsonb;
  v_source_id uuid;
  v_source_kind text;
  v_sources_array uuid[] := array[]::uuid[];
  v_sources_kinds text[] := array[]::text[];
  v_sources_n int;
  v_si int;

  -- Lock-check state
  v_lock_entry jsonb;
  v_lock_node uuid;
  v_lock_kind text;
  v_lock_ts timestamptz;
  v_db_ts timestamptz;
  v_conflicts uuid[] := array[]::uuid[];
  v_missing_sources jsonb := '[]'::jsonb;
  v_source_found boolean;

  -- Shared BFS state (across ALL sources — R-D4 dedupe overlap)
  v_visited uuid[] := array[]::uuid[];
  v_queue uuid[] := array[]::uuid[];
  v_queue_kinds text[] := array[]::text[];
  v_depth int := 0;
  v_max_depth int := 10;
  v_cur_id uuid;
  v_cur_kind text;
  v_next_ids uuid[];
  v_next_kinds text[];
  v_idx int;
  v_phase_ids uuid[] := array[]::uuid[];
  v_sprint_ids uuid[] := array[]::uuid[];

  -- Diff state
  v_diff jsonb := '[]'::jsonb;
  v_row record;
  v_old_start date;
  v_old_end date;
  v_new_start date;
  v_new_end date;
begin
  -- ---------------------------------------------------------------------------
  -- Step 1 — auth, tenant, feature flag, RBAC.
  -- ---------------------------------------------------------------------------
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

  -- ---------------------------------------------------------------------------
  -- Step 2 — validate intent.
  -- ---------------------------------------------------------------------------
  v_intent_kind := p_intent->>'kind';
  if v_intent_kind is null or v_intent_kind <> 'shift_dates' then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'unsupported_intent_kind');
  end if;
  v_shift_days := coalesce((p_intent->>'days')::int, 0);
  if v_shift_days = 0 then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'shift_days_required_nonzero');
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 3 — validate sources array (non-empty + each kind in {phase,sprint}).
  -- L30 all-or-nothing: ANY invalid source aborts the entire op.
  -- ---------------------------------------------------------------------------
  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) = 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'sources_required',
      'hint', 'sources must be a non-empty array of {node_id, node_kind}.');
  end if;

  for v_source_entry in select * from jsonb_array_elements(p_sources) loop
    v_source_id := (v_source_entry->>'node_id')::uuid;
    v_source_kind := v_source_entry->>'node_kind';
    if v_source_id is null then
      return jsonb_build_object('ok', false, 'status', 422,
        'error', 'invalid_source_entry',
        'hint', 'Each source must have a non-null node_id (uuid).');
    end if;
    if v_source_kind not in ('phase','sprint') then
      return jsonb_build_object('ok', false, 'status', 422,
        'error', 'unsupported_source_node_kind',
        'hint', 'Each source.node_kind must be ''phase'' or ''sprint''.');
    end if;
    v_sources_array := array_append(v_sources_array, v_source_id);
    v_sources_kinds := array_append(v_sources_kinds, v_source_kind);
  end loop;
  v_sources_n := array_length(v_sources_array, 1);

  -- ---------------------------------------------------------------------------
  -- Step 4 — F-50 multi-source: enforce non-empty if_updated_at + entry
  -- present for EVERY source_node_id with matching kind. ANY missing → 422.
  -- ---------------------------------------------------------------------------
  if jsonb_typeof(p_if_updated_at) <> 'array' or jsonb_array_length(p_if_updated_at) = 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'if_updated_at_required',
      'hint', 'Array must contain at minimum one entry per source_node with current updated_at.');
  end if;

  for v_si in 1..v_sources_n loop
    v_source_id := v_sources_array[v_si];
    v_source_kind := v_sources_kinds[v_si];
    v_source_found := false;
    for v_lock_entry in select * from jsonb_array_elements(p_if_updated_at) loop
      if (v_lock_entry->>'node_id')::uuid = v_source_id
         and (v_lock_entry->>'node_kind') = v_source_kind then
        v_source_found := true;
        exit;
      end if;
    end loop;
    if not v_source_found then
      v_missing_sources := v_missing_sources || jsonb_build_array(
        jsonb_build_object('node_id', v_source_id, 'node_kind', v_source_kind));
    end if;
  end loop;

  if jsonb_array_length(v_missing_sources) > 0 then
    return jsonb_build_object('ok', false, 'status', 422,
      'error', 'source_node_lock_missing',
      'hint', 'if_updated_at must include an entry for every source_node.',
      'missing_sources', v_missing_sources);
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 5 — shared-visited-set BFS across ALL sources. ANY cycle → 422 with
  -- cycle.source_node_id pointing to the source from which the cycle was reached.
  -- ---------------------------------------------------------------------------
  for v_si in 1..v_sources_n loop
    v_source_id := v_sources_array[v_si];
    v_source_kind := v_sources_kinds[v_si];

    -- Seed the queue for this source. Skip nodes already in visited (overlap
    -- dedupe). Source-node itself is added to visited regardless so we still
    -- accumulate it for UPDATE.
    if not (v_source_id = any(v_visited)) then
      v_visited := array_append(v_visited, v_source_id);
    end if;
    v_queue := array[v_source_id];
    v_queue_kinds := array[v_source_kind];
    v_depth := 0;

    while array_length(v_queue, 1) > 0 and v_depth < v_max_depth loop
      v_next_ids := array[]::uuid[];
      v_next_kinds := array[]::text[];

      for v_idx in 1..array_length(v_queue, 1) loop
        v_cur_id := v_queue[v_idx];
        v_cur_kind := v_queue_kinds[v_idx];

        -- Accumulate target-table arrays. Dedupe so a node reachable from
        -- multiple sources is updated only once.
        if v_cur_kind = 'phase' then
          if not (v_cur_id = any(v_phase_ids)) then
            v_phase_ids := array_append(v_phase_ids, v_cur_id);
          end if;
        elsif v_cur_kind = 'sprint' then
          if not (v_cur_id = any(v_sprint_ids)) then
            v_sprint_ids := array_append(v_sprint_ids, v_cur_id);
          end if;
        end if;

        -- Walk dependencies only for phases (no sprint discriminator in
        -- polymorphic dependencies table).
        if v_cur_kind = 'phase' then
          for v_row in
            select d.to_id, d.to_type
              from public.dependencies d
             where d.project_id = p_project_id
               and d.from_type = 'phase'
               and d.from_id = v_cur_id
          loop
            -- Cycle: reaching the current source means we've looped.
            if v_row.to_id = v_source_id then
              return jsonb_build_object('ok', false, 'status', 422,
                'cycle', jsonb_build_object(
                  'detected_at_node_id', v_cur_id,
                  'path', to_jsonb(v_visited),
                  'source_node_id', v_source_id));
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
  end loop;

  -- ---------------------------------------------------------------------------
  -- Step 6 — optimistic-lock check per entry in if_updated_at.
  -- Same semantics as single-source: any drift / vanished entity → 409.
  -- ---------------------------------------------------------------------------
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

  -- ---------------------------------------------------------------------------
  -- Step 7 — set causation_id GUC ONCE before any UPDATE (R-H2).
  -- ---------------------------------------------------------------------------
  perform set_config('audit.causation_id', v_causation::text, true);
  perform set_config('audit.change_reason', 'plan_mutate_bulk', true);

  -- ---------------------------------------------------------------------------
  -- Step 8 — bulk UPDATE (R-H3). One statement per target table; v_phase_ids
  -- and v_sprint_ids carry the deduped union of all source-walk results.
  -- Diff payload is built from a pre-snapshot of old values.
  -- ---------------------------------------------------------------------------
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

  -- ---------------------------------------------------------------------------
  -- Step 9 — Class-3 cost masking attached to the FIRST source (deterministic
  -- anchor). Identical bucket logic to single-source.
  -- ---------------------------------------------------------------------------
  if not v_cost_clear then
    v_diff := v_diff || jsonb_build_array(
      jsonb_build_object(
        'node_id', v_sources_array[1],
        'node_kind', v_sources_kinds[1],
        'node_label', null,
        'field', 'cost_estimate',
        'before', jsonb_build_object('kind','masked','value', null),
        'after',  jsonb_build_object('kind','aggregate','bucket', public._cost_aggregate_bucket(0)),
        'severity', 'neutral',
        'masked', true));
  end if;

  -- ---------------------------------------------------------------------------
  -- Step 10 — Risk Top-3 ONCE for the project (project-level rollup, anchored
  -- on first source). Per-source rollup is deferred (matches single-source
  -- behaviour in ε.3b/α).
  -- ---------------------------------------------------------------------------
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
        jsonb_build_object(
          'node_id', v_sources_array[1],
          'node_kind', v_sources_kinds[1],
          'node_label', null,
          'field', 'risk_severity',
          'before', jsonb_build_object('kind','enum','value', v_max_bucket),
          'after',  jsonb_build_object('kind','enum','value', v_max_bucket),
          'severity', case when v_shift_days > 0 then 'delay' else 'neutral' end,
          'masked', false,
          'top_3_risks', v_top3));
    end if;
  end;

  return jsonb_build_object('ok', true, 'causation_id', v_causation,
    'diff', jsonb_build_object('affected', v_diff));
end;
$$;

revoke all on function public.plan_mutate_atomic_bulk(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.plan_mutate_atomic_bulk(uuid, jsonb, jsonb, jsonb) from anon;
grant execute on function public.plan_mutate_atomic_bulk(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on function public.plan_mutate_atomic_bulk(uuid, jsonb, jsonb, jsonb) is
  'PROJ-65 ε.3c.β — atomic Multi-Source Plan-Mutate. Accepts an array of {node_id, node_kind} sources and applies shift_dates with a shared-visited-set BFS across all walks (R-D4 overlap dedupe). L30 all-or-nothing: ANY cycle/lock/permission failure aborts entire op. 422-cycle response carries source_node_id. Returns {ok, status?, error?, causation_id?, diff?, conflict?, cycle?}. CIA-locked: L29-L36.';

-- =============================================================================
-- Smoke-test: confirm the new bulk RPC exists with the expected signature and
-- key F-50-multi-source / cycle.source_node_id markers are present in the body.
-- =============================================================================
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
   where n.nspname='public' and p.proname='plan_mutate_atomic_bulk';
  if v_def is null then
    raise exception 'smoke-fail: plan_mutate_atomic_bulk RPC not created';
  end if;
  if v_def not like '%source_node_lock_missing%' then
    raise exception 'smoke-fail: plan_mutate_atomic_bulk missing multi-source F-50 lock check';
  end if;
  if v_def not like '%''source_node_id''%' then
    raise exception 'smoke-fail: plan_mutate_atomic_bulk missing cycle.source_node_id attribution';
  end if;
  if v_def not like '%missing_sources%' then
    raise exception 'smoke-fail: plan_mutate_atomic_bulk missing missing_sources hint payload';
  end if;
  raise notice 'smoke: plan_mutate_atomic_bulk present with F-50 multi + cycle.source_node_id + missing_sources hint';
end$$;
