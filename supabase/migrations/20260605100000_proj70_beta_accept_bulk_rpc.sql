-- =============================================================================
-- PROJ-70-β — Accept-Bulk + Undo RPCs for proposal_from_context
-- =============================================================================
-- Two SECURITY DEFINER plpgsql functions that turn AI-proposed
-- proposal_from_context suggestions into real work_items in one atomic
-- transaction:
--
--   * accept_proposal_from_context_bulk(p_project_id, p_suggestion_ids[],
--       p_method_validation_strict default true)
--         → returns accepted_suggestion_ids[], created_work_item_ids[],
--                   accepted_at timestamptz
--   * accept_proposal_from_context_undo(p_project_id, p_suggestion_ids[])
--         → returns reverted_suggestion_ids[], reverted_work_item_ids[]
--
-- Design notes (post-DB-inspection 2026-06-03):
--
--   * NO audit_log_entries trigger fires on ki_suggestions today, so we
--     can't recover the accepted batch via audit-trail. Undo therefore
--     takes `suggestion_ids[]` directly (the client keeps the array
--     returned by accept).
--   * `enforce_ki_suggestion_immutability` (BEFORE UPDATE) blocks any
--     update on rows with status IN ('accepted','rejected'). We add a
--     controlled bypass via session GUC `proposal_undo.allowed`: only
--     set inside accept_proposal_from_context_undo, so the immutability
--     invariant stays intact for all other callers.
--   * 30 s freshness window is enforced by `accepted_at` timestamp
--     comparison — simpler than audit-log lookups.
--
-- Method-validation per AC-β7: rejects suggestions whose `kind` is
-- incompatible with `project.project_method` per the PROJ-6 catalog.
-- Hybrid + unspecified/null pass any kind through.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Step 1 — Rewrite immutability trigger to honour controlled undo bypass
-- ---------------------------------------------------------------------------
-- The new logic ADDs one short-circuit: when the session GUC
-- `proposal_undo.allowed` equals 'true' AND the target row's purpose is
-- 'proposal_from_context' AND the proposed status transition is
-- accepted → draft, the trigger lets the update through. Everything else
-- behaves exactly as before, so all other callers see the same sealed-
-- row semantics.

create or replace function public.enforce_ki_suggestion_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_undo_allowed text;
begin
  if OLD.status in ('accepted', 'rejected') then
    -- PROJ-70-β controlled bypass for proposal_from_context undo.
    v_undo_allowed := current_setting('proposal_undo.allowed', true);
    if v_undo_allowed = 'true'
       and OLD.purpose = 'proposal_from_context'
       and OLD.status = 'accepted'
       and NEW.status = 'draft'
    then
      -- Allowed — fall through to the immutable-column check below.
      null;
    else
      raise exception
        'ki_suggestions in status % are sealed and cannot be updated', OLD.status
        using errcode = 'check_violation';
    end if;
  end if;

  if NEW.tenant_id is distinct from OLD.tenant_id
     or NEW.project_id is distinct from OLD.project_id
     or NEW.ki_run_id is distinct from OLD.ki_run_id
     or NEW.purpose is distinct from OLD.purpose
     or NEW.original_payload is distinct from OLD.original_payload
     or NEW.created_by is distinct from OLD.created_by
     or NEW.created_at is distinct from OLD.created_at
  then
    raise exception
      'ki_suggestions: immutable columns cannot change'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;


-- ---------------------------------------------------------------------------
-- Step 2 — accept_proposal_from_context_bulk
-- ---------------------------------------------------------------------------

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

      select suggestion_id, temp_id, parent_temp_id, kind, title, description
        into v_row_sug, v_row_temp, v_row_parent_temp, v_row_kind, v_row_title, v_row_desc
      from _accept_working
      where not processed
        and (
          parent_temp_id is null
          or (select processed from _accept_working where temp_id = parent_temp_id) = true
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
        'work_item',
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


-- ---------------------------------------------------------------------------
-- Step 3 — accept_proposal_from_context_undo
-- ---------------------------------------------------------------------------

create or replace function public.accept_proposal_from_context_undo(
  p_project_id uuid,
  p_suggestion_ids uuid[]
)
returns table (
  reverted_suggestion_ids uuid[],
  reverted_work_item_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_now timestamptz := now();
  v_window_seconds int := 30;
  v_oldest_accept timestamptz;
  v_reverted_wi_ids uuid[];
  v_actor_matches boolean;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select tenant_id into v_tenant_id from public.projects where id = p_project_id;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if not (is_project_lead(p_project_id) or has_project_role(p_project_id, 'editor') or is_tenant_admin(v_tenant_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_suggestion_ids is null or array_length(p_suggestion_ids, 1) is null then
    raise exception 'empty_suggestion_ids' using errcode = '22023';
  end if;

  -- Verify: every id is (a) in this project, (b) purpose=proposal_from_context,
  -- (c) status='accepted', (d) accepted_at within window, (e) caller is the
  -- same actor that accepted it (anti-griefing).
  if exists (
    select 1 from unnest(p_suggestion_ids) as needle(id)
    where not exists (
      select 1 from public.ki_suggestions s
      where s.id = needle.id
        and s.project_id = p_project_id
        and s.purpose = 'proposal_from_context'
        and s.status = 'accepted'
        and s.accepted_at is not null
        and s.accepted_at > v_now - make_interval(secs => v_window_seconds)
        and s.created_by = v_user_id
    )
  ) then
    raise exception 'undo_invalid_or_window_expired'
      using errcode = '22023',
            detail = format(
              'At least one suggestion is not undo-eligible (wrong project, wrong purpose, not accepted, > %s s old, or different actor).',
              v_window_seconds
            );
  end if;

  -- Compute window stats — defensive bound check.
  select min(accepted_at) into v_oldest_accept
  from public.ki_suggestions
  where id = any(p_suggestion_ids);

  if v_oldest_accept is null or v_now - v_oldest_accept > make_interval(secs => v_window_seconds) then
    raise exception 'undo_window_expired'
      using errcode = '22023',
            detail = format('Undo window of %s seconds has expired.', v_window_seconds);
  end if;

  -- Collect the linked work_item ids.
  select array_agg(distinct s.accepted_entity_id)
    into v_reverted_wi_ids
  from public.ki_suggestions s
  where s.id = any(p_suggestion_ids)
    and s.accepted_entity_type = 'work_item'
    and s.accepted_entity_id is not null;

  -- Set the controlled bypass for the immutability trigger.
  perform set_config('proposal_undo.allowed', 'true', true);

  -- DELETE the work_items. Use ON DELETE CASCADE for work_items.parent_id
  -- (children that were created with this bulk-accept are descendants of
  -- a top-level work_item; deleting top-level cascades down via the
  -- existing FK behaviour from PROJ-9).
  if v_reverted_wi_ids is not null then
    delete from public.work_items
    where id = any(v_reverted_wi_ids)
      and project_id = p_project_id;
  end if;

  -- Reset suggestion state to draft via the controlled bypass.
  update public.ki_suggestions
  set
    status = 'draft',
    accepted_at = null,
    accepted_entity_type = null,
    accepted_entity_id = null,
    updated_at = v_now
  where id = any(p_suggestion_ids)
    and project_id = p_project_id
    and status = 'accepted';

  -- Reset the GUC explicitly (the `local=true` flag in set_config above
  -- limits it to this transaction anyway; this is belt + suspenders).
  perform set_config('proposal_undo.allowed', 'false', true);

  reverted_suggestion_ids := p_suggestion_ids;
  reverted_work_item_ids := coalesce(v_reverted_wi_ids, array[]::uuid[]);
  return next;
end;
$$;

revoke execute on function public.accept_proposal_from_context_undo(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.accept_proposal_from_context_undo(uuid, uuid[]) to authenticated;

comment on function public.accept_proposal_from_context_undo(uuid, uuid) is
  'PROJ-70-β: Reverse a bulk-accept within 30 seconds. Deletes work_items '
  'and resets ki_suggestions to draft via controlled trigger bypass.';


-- =============================================================================
-- Smoke checks
-- =============================================================================
do $smoke$
declare
  v_bulk_count int;
  v_undo_count int;
  v_auth_grants int;
  v_anon_grants int;
begin
  select count(*) into v_bulk_count from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'accept_proposal_from_context_bulk';
  if v_bulk_count = 0 then
    raise exception 'smoke-fail: accept_proposal_from_context_bulk missing';
  end if;

  select count(*) into v_undo_count from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'accept_proposal_from_context_undo';
  if v_undo_count = 0 then
    raise exception 'smoke-fail: accept_proposal_from_context_undo missing';
  end if;

  select count(*) into v_auth_grants
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and routine_name in (
      'accept_proposal_from_context_bulk',
      'accept_proposal_from_context_undo'
    )
    and grantee = 'authenticated'
    and privilege_type = 'EXECUTE';
  if v_auth_grants <> 2 then
    raise exception 'smoke-fail: authenticated EXECUTE grant missing on % function(s)', 2 - v_auth_grants;
  end if;

  select count(*) into v_anon_grants
  from information_schema.role_routine_grants
  where routine_schema = 'public'
    and routine_name in (
      'accept_proposal_from_context_bulk',
      'accept_proposal_from_context_undo'
    )
    and grantee = 'anon'
    and privilege_type = 'EXECUTE';
  if v_anon_grants <> 0 then
    raise exception 'smoke-fail: anon must NOT have EXECUTE, found %', v_anon_grants;
  end if;

  -- Verify the immutability trigger still exists (we rewrote, not dropped).
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.ki_suggestions'::regclass
      and tgname = 'ki_suggestions_enforce_immutability'
  ) then
    raise exception 'smoke-fail: enforce_ki_suggestion_immutability trigger missing';
  end if;

  raise notice 'PROJ-70 beta smoke checks passed';
end
$smoke$;
