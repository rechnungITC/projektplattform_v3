-- =============================================================================
-- PROJ-70-delta QA-Fix 2 — accept RPC topological-sort repair (H-3)
-- =============================================================================
-- H-3 (HIGH): the beta topological-sort ready-check used an uncorrelated
--   subquery (`where temp_id = parent_temp_id` binds BOTH columns to the
--   subquery row), so child rows were never ready and EVERY nested
--   hierarchy failed with topological_sort_failed. Found by the delta
--   AC-d9 E2E smoke immediately after the H-1 provenance fix unmasked it.
-- Also adds: parents outside the current batch resolve against
--   previously-accepted suggestions (fixes single-accept of a child after
--   its parent was accepted); unknown/draft parents raise
--   parent_not_accepted instead of a misleading toposort error.
-- Re-creates accept_proposal_from_context_bulk only (undo unchanged).
-- ============================================================================

create or replace function public.accept_proposal_from_context_bulk(
  p_project_id uuid,
  p_suggestion_ids uuid[],
  p_method_validation_strict boolean default true
)
returns table (
  accepted_suggestion_ids uuid[],
  created_work_item_ids uuid[],
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_project_method text;
  v_now timestamptz := now();
  v_accepted_ids uuid[] := array[]::uuid[];
  v_created_ids uuid[] := array[]::uuid[];
  v_expected_count int;
  v_loaded_count int;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select tenant_id, project_method
    into v_tenant_id, v_project_method
  from public.projects
  where id = p_project_id;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if not (is_project_lead(p_project_id) or has_project_role(p_project_id, 'editor') or is_tenant_admin(v_tenant_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_suggestion_ids is null or array_length(p_suggestion_ids, 1) is null then
    raise exception 'empty_suggestion_ids' using errcode = '22023';
  end if;
  v_expected_count := array_length(p_suggestion_ids, 1);

  -- Load suggestions into a working temp table.
  create temporary table _accept_working (
    suggestion_id uuid primary key,
    temp_id text not null,
    parent_temp_id text,
    kind text not null,
    title text not null,
    description text,
    work_item_id uuid,
    processed boolean default false
  ) on commit drop;

  insert into _accept_working (suggestion_id, temp_id, parent_temp_id, kind, title, description)
  select
    s.id,
    s.payload->>'temp_id',
    s.payload->>'parent_temp_id',
    s.payload->>'kind',
    s.payload->>'title',
    s.payload->>'description'
  from public.ki_suggestions s
  where s.id = any(p_suggestion_ids)
    and s.project_id = p_project_id
    and s.purpose = 'proposal_from_context'
    and s.status = 'draft';

  select count(*) into v_loaded_count from _accept_working;
  if v_loaded_count <> v_expected_count then
    raise exception 'some_suggestions_invalid_or_already_accepted'
      using errcode = '23514',
            detail = format('Expected %s draft proposal_from_context rows in project, found %s.',
                            v_expected_count, v_loaded_count);
  end if;

  -- Method-validation per AC-β7. Hybrid + unspecified/null pass through.
  if p_method_validation_strict then
    if v_project_method in ('waterfall', 'Wasserfall') then
      if exists (select 1 from _accept_working where kind not in ('phase','work_package','todo')) then
        raise exception 'method_kind_incompatible'
          using errcode = '23514',
                detail = 'Project method waterfall requires kind in (phase, work_package, todo).';
      end if;
    elsif v_project_method in ('scrum','agile','Scrum','Agile') then
      if exists (select 1 from _accept_working where kind not in ('epic','story','task','subtask','bug')) then
        raise exception 'method_kind_incompatible'
          using errcode = '23514',
                detail = 'Project method scrum requires kind in (epic, story, task, subtask, bug).';
      end if;
    elsif v_project_method = 'kanban' then
      if exists (select 1 from _accept_working where kind not in ('epic','story','task','subtask','bug')) then
        raise exception 'method_kind_incompatible'
          using errcode = '23514',
                detail = 'Project method kanban requires kind in (epic, story, task, subtask, bug).';
      end if;
    end if;
  end if;

  -- Topological-sort: one ready row per iteration (Kahn-style). Continue
  -- until either every row is processed OR a full pass yields nothing
  -- (cycle or orphan parent_temp_id reference).
  loop
    declare
      v_pending int;
      v_row_sug uuid;
      v_row_temp text;
      v_row_parent_temp text;
      v_row_kind text;
      v_row_title text;
      v_row_desc text;
      v_row_parent_wi uuid;
      v_new_wi uuid;
      v_unresolved jsonb;
    begin
      select count(*) into v_pending from _accept_working where not processed;
      exit when v_pending = 0;

      -- H-3 fix (PROJ-70-delta QA 2026-06-07): the beta version compared
      -- temp_id = parent_temp_id INSIDE the subquery (both bound to the
      -- subquery's row), so the correlation never matched and children
      -- were never "ready" -> topological_sort_failed for EVERY nested
      -- hierarchy. Alias-qualify the correlation; additionally treat a
      -- parent that is not part of this batch as ready (resolved below
      -- against previously-accepted suggestions).
      select w.suggestion_id, w.temp_id, w.parent_temp_id, w.kind, w.title, w.description
        into v_row_sug, v_row_temp, v_row_parent_temp, v_row_kind, v_row_title, v_row_desc
      from _accept_working w
      where not w.processed
        and (
          w.parent_temp_id is null
          or exists (
            select 1 from _accept_working p
            where p.temp_id = w.parent_temp_id and p.processed
          )
          or not exists (
            select 1 from _accept_working p
            where p.temp_id = w.parent_temp_id
          )
        )
      limit 1;

      if not found then
        v_unresolved := (
          select coalesce(jsonb_agg(jsonb_build_object(
            'suggestion_id', suggestion_id,
            'temp_id', temp_id,
            'parent_temp_id', parent_temp_id
          )), '[]'::jsonb)
          from _accept_working where not processed
        );
        raise exception 'topological_sort_failed'
          using errcode = '22023',
                detail = 'Cycle or dangling parent_temp_id detected in suggestion graph.',
                hint = v_unresolved::text;
      end if;

      if v_row_parent_temp is null then
        v_row_parent_wi := null;
      else
        select work_item_id into v_row_parent_wi
        from _accept_working where temp_id = v_row_parent_temp;
        if v_row_parent_wi is null then
          -- H-3 fix: the parent is not part of this batch — link to the
          -- work_item of a previously-accepted suggestion with that
          -- temp_id (single-accept of a child AFTER its parent was
          -- accepted). Still-draft/unknown parents stay an error.
          select s.accepted_entity_id into v_row_parent_wi
          from public.ki_suggestions s
          where s.project_id = p_project_id
            and s.purpose = 'proposal_from_context'
            and s.status = 'accepted'
            and s.payload->>'temp_id' = v_row_parent_temp
            and s.accepted_entity_id is not null
          order by s.accepted_at desc
          limit 1;
          if v_row_parent_wi is null then
            raise exception 'parent_not_accepted'
              using errcode = '23514',
                    detail = format('Parent temp_id %s is neither in this batch nor previously accepted.', v_row_parent_temp);
          end if;
        end if;
      end if;

      v_new_wi := gen_random_uuid();
      insert into public.work_items (
        id, tenant_id, project_id, kind, title, description, status,
        parent_id, created_by, created_at, updated_at
      )
      values (
        v_new_wi,
        v_tenant_id,
        p_project_id,
        v_row_kind,
        v_row_title,
        v_row_desc,
        'todo',
        v_row_parent_wi,
        v_user_id,
        v_now,
        v_now
      );

      -- ki_provenance per AC-β9. Schema (verified 2026-06-03):
      --   id (auto), tenant_id, entity_type, entity_id, ki_suggestion_id,
      --   was_modified, created_at (auto).
      -- The link back to ki_run_id flows transitively via ki_suggestions.
      insert into public.ki_provenance (
        tenant_id, entity_type, entity_id, ki_suggestion_id, was_modified
      )
      values (
        v_tenant_id,
        'work_items',
        v_new_wi,
        v_row_sug,
        false
      );

      -- Flip ki_suggestions to accepted (AC-β3 / β4). The immutability
      -- trigger lets this through because OLD.status='draft'.
      update public.ki_suggestions
      set
        status = 'accepted',
        accepted_at = v_now,
        accepted_entity_type = 'work_item',
        accepted_entity_id = v_new_wi,
        updated_at = v_now
      where id = v_row_sug
        and status = 'draft';

      update _accept_working
      set processed = true, work_item_id = v_new_wi
      where suggestion_id = v_row_sug;

      v_accepted_ids := array_append(v_accepted_ids, v_row_sug);
      v_created_ids := array_append(v_created_ids, v_new_wi);
    end;
  end loop;

  accepted_suggestion_ids := v_accepted_ids;
  created_work_item_ids := v_created_ids;
  accepted_at := v_now;
  return next;
end;
$$;

revoke execute on function public.accept_proposal_from_context_bulk(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.accept_proposal_from_context_bulk(uuid, uuid[], boolean) to authenticated;

comment on function public.accept_proposal_from_context_bulk(uuid, uuid[], boolean) is
  'PROJ-70-β: Accept N proposal_from_context suggestions atomically. '
  'Topological-sort by parent_temp_id, INSERT work_items + ki_provenance, '
  'flip ki_suggestions to accepted.';
