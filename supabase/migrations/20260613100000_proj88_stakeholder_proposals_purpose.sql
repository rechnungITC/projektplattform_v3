-- =============================================================================
-- PROJ-88 — `proposal_stakeholders_from_context` AI purpose
-- =============================================================================
-- Sibling of PROJ-70-α/β (proposal_from_context). Five pieces:
--   1. ki_runs / ki_suggestions / tenant_ai_cost_caps purpose CHECKs admit
--      the new purpose (lockstep pattern of 20260601100000).
--   2. ki_suggestions accepted-consistency keeps treating the purpose as
--      advisory-capable (accept sets entity links, but undo nulls them).
--   3. ki_provenance entity CHECK admits 'stakeholders' + 'resources'.
--   4. enforce_ki_suggestion_immutability allows the controlled undo
--      bypass for the new purpose (was hardcoded to proposal_from_context).
--   5. accept_stakeholder_proposals_bulk / accept_stakeholder_proposals_undo
--      RPC pair (SECURITY DEFINER, 30 s undo window, mirror of PROJ-70-β
--      incl. the delta-QA lessons H-1 plural entity_type / H-2 provenance
--      cleanup on undo).
--
-- Accept semantics (Tech-Design L2/L4):
--   * duplicate_of_stakeholder_id set → NO create; suggestion links to the
--     existing stakeholder (accepted_entity_type='stakeholder_link').
--   * otherwise → INSERT stakeholders (+ resources when the reviewer set
--     create_resource=true; bridged via source_stakeholder_id, PROJ-57).
--   * linked_user_id (reviewer-picked) must be a tenant member — never an
--     auto-created identity (invariant #4).
-- Undo deletes ONLY entities this accept created ('stakeholder'), never
-- pre-existing ones ('stakeholder_link').
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. ki_runs.purpose CHECK
-- ---------------------------------------------------------------------------
alter table public.ki_runs
  drop constraint if exists ki_runs_purpose_check;
alter table public.ki_runs
  add constraint ki_runs_purpose_check
  check (purpose = any (array[
    'risks'::text, 'decisions'::text, 'work_items'::text, 'open_items'::text,
    'narrative'::text,
    'trajectory_sequence'::text,
    'resource_swap'::text,
    'cross_project_links'::text,
    'proposal_from_context'::text,
    -- PROJ-88
    'proposal_stakeholders_from_context'::text
  ]));

-- ---------------------------------------------------------------------------
-- 1b. ki_suggestions.purpose CHECK
-- ---------------------------------------------------------------------------
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_purpose_check;
alter table public.ki_suggestions
  add constraint ki_suggestions_purpose_check
  check (purpose in (
    'risks','decisions','work_items','open_items',
    'trajectory_sequence',
    'resource_swap',
    'cross_project_links',
    'proposal_from_context',
    -- PROJ-88
    'proposal_stakeholders_from_context'
  ));

-- ---------------------------------------------------------------------------
-- 1c. tenant_ai_cost_caps.purpose CHECK
-- ---------------------------------------------------------------------------
alter table public.tenant_ai_cost_caps
  drop constraint if exists tenant_ai_cost_caps_purpose_check;
alter table public.tenant_ai_cost_caps
  add constraint tenant_ai_cost_caps_purpose_check
  check (
    purpose is null or purpose in (
      'risks','decisions','work_items','open_items',
      'narrative','sentiment','coaching',
      'trajectory_sequence',
      'resource_swap',
      'cross_project_links',
      'proposal_from_context',
      -- PROJ-88
      'proposal_stakeholders_from_context'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. ki_suggestions accepted-consistency — the new purpose sets real
--    entity links on accept, so the strict branch applies naturally; we
--    still add it to the advisory list because undo nulls the links while
--    the row transitions back to draft (status<>accepted branch covers
--    that). No change needed beyond keeping the constraint as-is — but we
--    re-create it verbatim so the migration is self-documenting about the
--    decision.
-- ---------------------------------------------------------------------------
alter table public.ki_suggestions
  drop constraint if exists ki_suggestions_accepted_consistency;
alter table public.ki_suggestions
  add constraint ki_suggestions_accepted_consistency
  check (
    (status = 'accepted' and (
      (accepted_entity_type is not null and accepted_entity_id is not null)
      or
      purpose in (
        'trajectory_sequence',
        'resource_swap',
        'cross_project_links',
        'proposal_from_context'
      )
    ))
    or
    (status <> 'accepted' and accepted_entity_type is null and accepted_entity_id is null)
  );

-- ---------------------------------------------------------------------------
-- 3. ki_provenance entity CHECK — admit stakeholders + resources
-- ---------------------------------------------------------------------------
alter table public.ki_provenance
  drop constraint if exists ki_provenance_entity_check;
alter table public.ki_provenance
  add constraint ki_provenance_entity_check
  check (entity_type = any (array[
    'risks'::text, 'decisions'::text, 'work_items'::text, 'open_items'::text,
    -- PROJ-88 (plural per H-1 lesson 2026-06-07)
    'stakeholders'::text, 'resources'::text
  ]));

-- ---------------------------------------------------------------------------
-- 4. Immutability-trigger bypass for the new purpose's undo
-- ---------------------------------------------------------------------------
create or replace function public.enforce_ki_suggestion_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_undo_allowed text;
begin
  if OLD.status in ('accepted', 'rejected') then
    -- PROJ-70-β / PROJ-88 controlled bypass for the 30 s undo RPCs.
    v_undo_allowed := current_setting('proposal_undo.allowed', true);
    if v_undo_allowed = 'true'
       and OLD.purpose in ('proposal_from_context', 'proposal_stakeholders_from_context')
       and OLD.status = 'accepted'
       and NEW.status = 'draft'
    then
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
-- 5a. accept_stakeholder_proposals_bulk
-- ---------------------------------------------------------------------------
create or replace function public.accept_stakeholder_proposals_bulk(
  p_project_id uuid,
  p_suggestion_ids uuid[]
)
returns table (
  accepted_suggestion_ids uuid[],
  created_stakeholder_ids uuid[],
  created_resource_ids uuid[],
  linked_stakeholder_ids uuid[],
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_now timestamptz := now();
  v_accepted_ids uuid[] := array[]::uuid[];
  v_created_sh_ids uuid[] := array[]::uuid[];
  v_created_res_ids uuid[] := array[]::uuid[];
  v_linked_sh_ids uuid[] := array[]::uuid[];
  v_expected_count int;
  v_loaded_count int;
  r record;
  v_dup_id uuid;
  v_linked_user uuid;
  v_new_sh uuid;
  v_new_res uuid;
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
  v_expected_count := array_length(p_suggestion_ids, 1);

  select count(*) into v_loaded_count
  from public.ki_suggestions s
  where s.id = any(p_suggestion_ids)
    and s.project_id = p_project_id
    and s.purpose = 'proposal_stakeholders_from_context'
    and s.status = 'draft';
  if v_loaded_count <> v_expected_count then
    raise exception 'some_suggestions_invalid_or_already_accepted'
      using errcode = '23514',
            detail = format('Expected %s draft stakeholder-proposal rows in project, found %s.',
                            v_expected_count, v_loaded_count);
  end if;

  for r in
    select s.id as suggestion_id,
           s.payload->>'name'                        as name,
           s.payload->>'kind'                        as kind,
           coalesce(s.payload->>'origin', 'external') as origin,
           nullif(trim(s.payload->>'role_key'), '')   as role_key,
           nullif(trim(s.payload->>'org_unit'), '')   as org_unit,
           nullif(trim(s.payload->>'contact_email'), '') as contact_email,
           nullif(trim(s.payload->>'contact_phone'), '') as contact_phone,
           nullif(s.payload->>'duplicate_of_stakeholder_id', '') as dup_raw,
           coalesce((s.payload->>'create_resource')::boolean, false) as create_resource,
           nullif(s.payload->>'linked_user_id', '')   as linked_user_raw
    from public.ki_suggestions s
    where s.id = any(p_suggestion_ids)
      and s.project_id = p_project_id
      and s.purpose = 'proposal_stakeholders_from_context'
      and s.status = 'draft'
    order by s.created_at, s.id
  loop
    if r.name is null or char_length(trim(r.name)) < 1 then
      raise exception 'invalid_suggestion_payload'
        using errcode = '22023',
              detail = format('Suggestion %s has no name.', r.suggestion_id);
    end if;
    if r.kind not in ('person', 'organization') then
      raise exception 'invalid_suggestion_payload'
        using errcode = '22023',
              detail = format('Suggestion %s has invalid kind %s.', r.suggestion_id, coalesce(r.kind, 'null'));
    end if;
    if r.origin not in ('internal', 'external') then
      raise exception 'invalid_suggestion_payload'
        using errcode = '22023',
              detail = format('Suggestion %s has invalid origin %s.', r.suggestion_id, r.origin);
    end if;

    -- Reviewer-picked member link: must be an EXISTING tenant member
    -- (invariant #4 — never auto-create identities).
    v_linked_user := null;
    if r.linked_user_raw is not null then
      begin
        v_linked_user := r.linked_user_raw::uuid;
      exception when invalid_text_representation then
        raise exception 'invalid_suggestion_payload'
          using errcode = '22023',
                detail = format('Suggestion %s linked_user_id is not a uuid.', r.suggestion_id);
      end;
      if not exists (
        select 1 from public.tenant_memberships tm
        where tm.tenant_id = v_tenant_id and tm.user_id = v_linked_user
      ) then
        raise exception 'linked_user_not_tenant_member'
          using errcode = '23514',
                detail = format('Suggestion %s links a user that is not a member of this tenant.', r.suggestion_id);
      end if;
    end if;

    -- Dedup branch (L4): link to the existing stakeholder, create nothing.
    v_dup_id := null;
    if r.dup_raw is not null then
      begin
        v_dup_id := r.dup_raw::uuid;
      exception when invalid_text_representation then
        v_dup_id := null;
      end;
    end if;

    if v_dup_id is not null then
      if not exists (
        select 1 from public.stakeholders sh
        where sh.id = v_dup_id and sh.project_id = p_project_id
      ) then
        raise exception 'duplicate_target_not_found'
          using errcode = '23514',
                detail = format('Suggestion %s references a duplicate_of stakeholder outside this project.', r.suggestion_id);
      end if;

      insert into public.ki_provenance (
        tenant_id, entity_type, entity_id, ki_suggestion_id, was_modified
      ) values (
        v_tenant_id, 'stakeholders', v_dup_id, r.suggestion_id, false
      );

      update public.ki_suggestions
      set status = 'accepted',
          accepted_at = v_now,
          accepted_entity_type = 'stakeholder_link',
          accepted_entity_id = v_dup_id,
          updated_at = v_now
      where id = r.suggestion_id and status = 'draft';

      v_linked_sh_ids := array_append(v_linked_sh_ids, v_dup_id);
      v_accepted_ids := array_append(v_accepted_ids, r.suggestion_id);
      continue;
    end if;

    -- Create branch (L2): stakeholder always; resource only when toggled.
    v_new_sh := gen_random_uuid();
    insert into public.stakeholders (
      id, tenant_id, project_id, kind, origin, name, role_key, org_unit,
      contact_email, contact_phone, influence, impact, linked_user_id,
      is_active, created_by, created_at, updated_at
    ) values (
      v_new_sh, v_tenant_id, p_project_id, r.kind, r.origin,
      left(trim(r.name), 255), left(r.role_key, 100), r.org_unit,
      left(r.contact_email, 320), r.contact_phone,
      'medium', 'medium', v_linked_user,
      true, v_user_id, v_now, v_now
    );

    v_new_res := null;
    if r.create_resource then
      -- resources_tenant_user_unique is a partial UNIQUE(tenant_id,
      -- linked_user_id): a linked user can hold at most ONE resource.
      -- If the user already has one, create the resource WITHOUT the
      -- user link (the stakeholder bridge via source_stakeholder_id
      -- still holds) instead of failing the whole accept. Found by the
      -- 2026-06-10 live RPC smoke.
      v_new_res := gen_random_uuid();
      insert into public.resources (
        id, tenant_id, source_stakeholder_id, linked_user_id, display_name,
        kind, is_active, created_by, created_at, updated_at
      ) values (
        v_new_res, v_tenant_id, v_new_sh,
        case
          when v_linked_user is not null and not exists (
            select 1 from public.resources existing
            where existing.tenant_id = v_tenant_id
              and existing.linked_user_id = v_linked_user
          ) then v_linked_user
          else null
        end,
        left(trim(r.name), 200), r.origin, true, v_user_id, v_now, v_now
      );
      v_created_res_ids := array_append(v_created_res_ids, v_new_res);
    end if;

    -- ONE provenance row per suggestion (UNIQUE(ki_suggestion_id)) — the
    -- stakeholder is the primary entity; a created resource is traceable
    -- via resources.source_stakeholder_id (PROJ-57 bridge).
    insert into public.ki_provenance (
      tenant_id, entity_type, entity_id, ki_suggestion_id, was_modified
    ) values (
      v_tenant_id, 'stakeholders', v_new_sh, r.suggestion_id, false
    );

    update public.ki_suggestions
    set status = 'accepted',
        accepted_at = v_now,
        accepted_entity_type = 'stakeholder',
        accepted_entity_id = v_new_sh,
        updated_at = v_now
    where id = r.suggestion_id and status = 'draft';

    v_created_sh_ids := array_append(v_created_sh_ids, v_new_sh);
    v_accepted_ids := array_append(v_accepted_ids, r.suggestion_id);
  end loop;

  accepted_suggestion_ids := v_accepted_ids;
  created_stakeholder_ids := v_created_sh_ids;
  created_resource_ids := v_created_res_ids;
  linked_stakeholder_ids := v_linked_sh_ids;
  accepted_at := v_now;
  return next;
end;
$$;

revoke execute on function public.accept_stakeholder_proposals_bulk(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.accept_stakeholder_proposals_bulk(uuid, uuid[]) to authenticated;

comment on function public.accept_stakeholder_proposals_bulk(uuid, uuid[]) is
  'PROJ-88: Accept N proposal_stakeholders_from_context suggestions atomically. '
  'Creates stakeholders (+ optional resources via create_resource toggle), links '
  'duplicates instead of creating (accepted_entity_type=stakeholder_link), writes '
  'ki_provenance, flips ki_suggestions to accepted.';

-- ---------------------------------------------------------------------------
-- 5b. accept_stakeholder_proposals_undo
-- ---------------------------------------------------------------------------
create or replace function public.accept_stakeholder_proposals_undo(
  p_project_id uuid,
  p_suggestion_ids uuid[]
)
returns table (
  reverted_suggestion_ids uuid[],
  reverted_stakeholder_ids uuid[],
  reverted_resource_ids uuid[]
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
  v_created_sh_ids uuid[];
  v_res_ids uuid[];
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

  if exists (
    select 1 from unnest(p_suggestion_ids) as needle(id)
    where not exists (
      select 1 from public.ki_suggestions s
      where s.id = needle.id
        and s.project_id = p_project_id
        and s.purpose = 'proposal_stakeholders_from_context'
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

  select min(accepted_at) into v_oldest_accept
  from public.ki_suggestions
  where id = any(p_suggestion_ids);

  if v_oldest_accept is null or v_now - v_oldest_accept > make_interval(secs => v_window_seconds) then
    raise exception 'undo_window_expired'
      using errcode = '22023',
            detail = format('Undo window of %s seconds has expired.', v_window_seconds);
  end if;

  -- Only entities this accept CREATED ('stakeholder'); 'stakeholder_link'
  -- rows reference pre-existing stakeholders and must never be deleted.
  select array_agg(distinct s.accepted_entity_id)
    into v_created_sh_ids
  from public.ki_suggestions s
  where s.id = any(p_suggestion_ids)
    and s.accepted_entity_type = 'stakeholder'
    and s.accepted_entity_id is not null;

  -- Resources bridged to the created stakeholders (FK is ON DELETE SET
  -- NULL, so they must be removed explicitly BEFORE the stakeholders).
  if v_created_sh_ids is not null then
    select array_agg(res.id) into v_res_ids
    from public.resources res
    where res.source_stakeholder_id = any(v_created_sh_ids)
      and res.tenant_id = v_tenant_id;
    if v_res_ids is not null then
      delete from public.resources where id = any(v_res_ids);
    end if;
    delete from public.stakeholders
    where id = any(v_created_sh_ids)
      and project_id = p_project_id;
  end if;

  -- H-2 lesson: remove provenance rows so a re-accept after undo works
  -- (ki_provenance has UNIQUE(ki_suggestion_id)). Covers both created and
  -- linked suggestions.
  delete from public.ki_provenance
  where ki_suggestion_id = any(p_suggestion_ids)
    and tenant_id = v_tenant_id;

  perform set_config('proposal_undo.allowed', 'true', true);

  update public.ki_suggestions
  set status = 'draft',
      accepted_at = null,
      accepted_entity_type = null,
      accepted_entity_id = null,
      updated_at = v_now
  where id = any(p_suggestion_ids)
    and project_id = p_project_id
    and status = 'accepted';

  perform set_config('proposal_undo.allowed', 'false', true);

  reverted_suggestion_ids := p_suggestion_ids;
  reverted_stakeholder_ids := coalesce(v_created_sh_ids, array[]::uuid[]);
  reverted_resource_ids := coalesce(v_res_ids, array[]::uuid[]);
  return next;
end;
$$;

revoke execute on function public.accept_stakeholder_proposals_undo(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.accept_stakeholder_proposals_undo(uuid, uuid[]) to authenticated;

comment on function public.accept_stakeholder_proposals_undo(uuid, uuid[]) is
  'PROJ-88: Reverse a stakeholder-proposals bulk-accept within 30 seconds. '
  'Deletes ONLY created stakeholders (+ their bridged resources), never '
  'pre-existing stakeholder_link targets; cleans ki_provenance; resets '
  'suggestions to draft via the controlled immutability bypass.';

-- =============================================================================
-- Smoke checks (static, no data mutation)
-- =============================================================================
do $smoke$
begin
  -- CHECK 1: ki_runs purpose CHECK admits the new purpose
  if not exists (
    select 1 from pg_constraint
    where conname = 'ki_runs_purpose_check'
      and pg_get_constraintdef(oid) like '%proposal_stakeholders_from_context%'
  ) then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check missing new purpose';
  end if;

  -- CHECK 2: ki_provenance entity CHECK admits stakeholders + resources
  if not exists (
    select 1 from pg_constraint
    where conname = 'ki_provenance_entity_check'
      and pg_get_constraintdef(oid) like '%stakeholders%'
      and pg_get_constraintdef(oid) like '%resources%'
  ) then
    raise exception 'SMOKE FAIL: ki_provenance_entity_check missing new entity types';
  end if;

  -- CHECK 3: both RPCs exist with expected signatures
  if (
    select count(*) from pg_proc
    where proname in ('accept_stakeholder_proposals_bulk', 'accept_stakeholder_proposals_undo')
  ) <> 2 then
    raise exception 'SMOKE FAIL: stakeholder accept/undo RPC pair incomplete';
  end if;

  -- CHECK 4: immutability trigger function mentions the new purpose
  if not exists (
    select 1 from pg_proc
    where proname = 'enforce_ki_suggestion_immutability'
      and prosrc like '%proposal_stakeholders_from_context%'
  ) then
    raise exception 'SMOKE FAIL: immutability bypass not extended';
  end if;

  raise notice 'PROJ-88 migration smoke checks passed.';
end
$smoke$;
