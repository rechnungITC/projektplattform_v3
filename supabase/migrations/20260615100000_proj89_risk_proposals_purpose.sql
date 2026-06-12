-- PROJ-89 — `proposal_risks_from_context` AI purpose
--
-- Sibling of PROJ-70/PROJ-88. This migration:
--   1. ki_runs / ki_suggestions / tenant_ai_cost_caps purpose CHECKs admit
--      the new purpose (lockstep pattern of 20260613100000).
--      ⚠️ ki_runs re-enumeration INCLUDES 'sentiment' + 'coaching' — they
--      were restored by 20260614100000 after every prior lockstep copy
--      silently dropped them (coaching/sentiment 5xx'd in prod). The smoke
--      check below guards against a repeat.
--   2. ki_suggestions accepted-consistency: the new purpose sets real
--      accepted-entity links on accept (risk / risk_link), so the strict
--      branch applies naturally — constraint re-created verbatim, advisory
--      list unchanged (self-documenting decision, mirror PROJ-88).
--   3. ki_provenance entity CHECK already admits 'risks' (PROJ-12) — no
--      change needed.
--   4. Immutability-trigger bypass extended for the new purpose's undo.
--   5. RPC pair accept_risk_proposals_bulk / accept_risk_proposals_undo
--      (SECURITY DEFINER, 30 s window, same-actor, provenance cleanup per
--      H-2; dedup branch records provenance on the EXISTING risk and never
--      deletes it on undo — PROJ-88 L4 pattern).
--
-- AC-89.3 design clarification (architecture 2026-06-11): accepted risks
-- insert with status 'open' — the risks status CHECK has no 'draft';
-- review semantics live in ki_suggestions + ki_provenance.

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
    -- PROJ-34 (restored by 20260614100000 — keep in every re-enumeration!)
    'sentiment'::text,
    'coaching'::text,
    'trajectory_sequence'::text,
    'resource_swap'::text,
    'cross_project_links'::text,
    'proposal_from_context'::text,
    'proposal_stakeholders_from_context'::text,
    -- PROJ-89
    'proposal_risks_from_context'::text
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
    'proposal_stakeholders_from_context',
    -- PROJ-89
    'proposal_risks_from_context'
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
      'proposal_stakeholders_from_context',
      -- PROJ-89
      'proposal_risks_from_context'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. ki_suggestions accepted-consistency — re-created verbatim. The new
--    purpose sets accepted_entity_type/id on accept ('risk'/'risk_link'),
--    so it belongs to the strict branch, NOT the advisory list.
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
-- 3. Immutability-trigger bypass for the new purpose's undo
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
    -- PROJ-70-β / PROJ-88 / PROJ-89 controlled bypass for the 30 s undo RPCs.
    v_undo_allowed := current_setting('proposal_undo.allowed', true);
    if v_undo_allowed = 'true'
       and OLD.purpose in (
         'proposal_from_context',
         'proposal_stakeholders_from_context',
         'proposal_risks_from_context'
       )
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
-- 4a. accept_risk_proposals_bulk
-- ---------------------------------------------------------------------------
create or replace function public.accept_risk_proposals_bulk(
  p_project_id uuid,
  p_suggestion_ids uuid[]
)
returns table (
  accepted_suggestion_ids uuid[],
  created_risk_ids uuid[],
  linked_risk_ids uuid[],
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
  v_created_ids uuid[] := array[]::uuid[];
  v_linked_ids uuid[] := array[]::uuid[];
  v_expected_count int;
  v_loaded_count int;
  r record;
  v_dup_id uuid;
  v_new_risk uuid;
  v_probability int;
  v_impact int;
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
    and s.purpose = 'proposal_risks_from_context'
    and s.status = 'draft';
  if v_loaded_count <> v_expected_count then
    raise exception 'some_suggestions_invalid_or_already_accepted'
      using errcode = '23514',
            detail = format('Expected %s draft risk-proposal rows in project, found %s.',
                            v_expected_count, v_loaded_count);
  end if;

  for r in
    select s.id as suggestion_id,
           s.payload->>'title'                          as title,
           nullif(trim(s.payload->>'description'), '')  as description,
           s.payload->>'probability'                    as probability_raw,
           s.payload->>'impact'                         as impact_raw,
           nullif(trim(s.payload->>'mitigation'), '')   as mitigation,
           nullif(s.payload->>'duplicate_of_risk_id', '') as dup_raw
    from public.ki_suggestions s
    where s.id = any(p_suggestion_ids)
      and s.project_id = p_project_id
      and s.purpose = 'proposal_risks_from_context'
      and s.status = 'draft'
    order by s.created_at, s.id
  loop
    if r.title is null or char_length(trim(r.title)) < 1 then
      raise exception 'invalid_suggestion_payload'
        using errcode = '22023',
              detail = format('Suggestion %s has no title.', r.suggestion_id);
    end if;

    begin
      v_probability := round(r.probability_raw::numeric)::int;
      v_impact := round(r.impact_raw::numeric)::int;
    exception when others then
      raise exception 'invalid_suggestion_payload'
        using errcode = '22023',
              detail = format('Suggestion %s has non-numeric probability/impact.', r.suggestion_id);
    end;
    if v_probability is null or v_impact is null
       or v_probability < 1 or v_probability > 5
       or v_impact < 1 or v_impact > 5 then
      raise exception 'invalid_suggestion_payload'
        using errcode = '22023',
              detail = format('Suggestion %s probability/impact out of 1-5 range.', r.suggestion_id);
    end if;

    -- Dedup branch (PROJ-88 L4): record provenance on the EXISTING risk,
    -- create nothing.
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
        select 1 from public.risks rk
        where rk.id = v_dup_id and rk.project_id = p_project_id
      ) then
        raise exception 'duplicate_target_not_found'
          using errcode = '23514',
                detail = format('Suggestion %s references a duplicate_of risk outside this project.', r.suggestion_id);
      end if;

      insert into public.ki_provenance (
        tenant_id, entity_type, entity_id, ki_suggestion_id, was_modified
      ) values (
        v_tenant_id, 'risks', v_dup_id, r.suggestion_id, false
      );

      update public.ki_suggestions
      set status = 'accepted',
          accepted_at = v_now,
          accepted_entity_type = 'risk_link',
          accepted_entity_id = v_dup_id,
          updated_at = v_now
      where id = r.suggestion_id and status = 'draft';

      v_linked_ids := array_append(v_linked_ids, v_dup_id);
      v_accepted_ids := array_append(v_accepted_ids, r.suggestion_id);
      continue;
    end if;

    -- Create branch: real risk in the PROJ-20 register, status 'open'
    -- (AC-89.3 clarification — no draft status on risks).
    v_new_risk := gen_random_uuid();
    insert into public.risks (
      id, tenant_id, project_id, title, description,
      probability, impact, status, mitigation,
      created_by, created_at, updated_at
    ) values (
      v_new_risk, v_tenant_id, p_project_id,
      left(trim(r.title), 255), left(r.description, 5000),
      v_probability, v_impact, 'open', left(r.mitigation, 5000),
      v_user_id, v_now, v_now
    );

    insert into public.ki_provenance (
      tenant_id, entity_type, entity_id, ki_suggestion_id, was_modified
    ) values (
      v_tenant_id, 'risks', v_new_risk, r.suggestion_id, false
    );

    update public.ki_suggestions
    set status = 'accepted',
        accepted_at = v_now,
        accepted_entity_type = 'risk',
        accepted_entity_id = v_new_risk,
        updated_at = v_now
    where id = r.suggestion_id and status = 'draft';

    v_created_ids := array_append(v_created_ids, v_new_risk);
    v_accepted_ids := array_append(v_accepted_ids, r.suggestion_id);
  end loop;

  accepted_suggestion_ids := v_accepted_ids;
  created_risk_ids := v_created_ids;
  linked_risk_ids := v_linked_ids;
  accepted_at := v_now;
  return next;
end;
$$;

revoke execute on function public.accept_risk_proposals_bulk(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.accept_risk_proposals_bulk(uuid, uuid[]) to authenticated;

comment on function public.accept_risk_proposals_bulk(uuid, uuid[]) is
  'PROJ-89: Accept N proposal_risks_from_context suggestions atomically. '
  'Creates risks with status open in the PROJ-20 register, records provenance '
  'on existing risks for duplicates instead of creating '
  '(accepted_entity_type=risk_link), writes ki_provenance, flips '
  'ki_suggestions to accepted.';

-- ---------------------------------------------------------------------------
-- 4b. accept_risk_proposals_undo
-- ---------------------------------------------------------------------------
create or replace function public.accept_risk_proposals_undo(
  p_project_id uuid,
  p_suggestion_ids uuid[]
)
returns table (
  reverted_suggestion_ids uuid[],
  reverted_risk_ids uuid[]
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
  v_created_risk_ids uuid[];
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
        and s.purpose = 'proposal_risks_from_context'
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

  -- Only entities this accept CREATED ('risk'); 'risk_link' rows reference
  -- pre-existing risks and must never be deleted.
  select array_agg(distinct s.accepted_entity_id)
    into v_created_risk_ids
  from public.ki_suggestions s
  where s.id = any(p_suggestion_ids)
    and s.accepted_entity_type = 'risk'
    and s.accepted_entity_id is not null;

  if v_created_risk_ids is not null then
    delete from public.risks
    where id = any(v_created_risk_ids)
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
  reverted_risk_ids := coalesce(v_created_risk_ids, array[]::uuid[]);
  return next;
end;
$$;

revoke execute on function public.accept_risk_proposals_undo(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.accept_risk_proposals_undo(uuid, uuid[]) to authenticated;

comment on function public.accept_risk_proposals_undo(uuid, uuid[]) is
  'PROJ-89: Reverse a risk-proposals bulk-accept within 30 seconds. Deletes '
  'ONLY created risks, never pre-existing risk_link targets; cleans '
  'ki_provenance; resets suggestions to draft via the controlled '
  'immutability bypass.';

-- =============================================================================
-- Smoke checks (static, no data mutation)
-- =============================================================================
do $smoke$
declare
  v_def text;
begin
  -- CHECK 1: ki_runs purpose CHECK admits the new purpose AND keeps
  -- sentiment + coaching (the 20260614100000 restore must survive every
  -- future lockstep re-enumeration).
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_runs_purpose_check';
  if v_def is null or v_def not like '%proposal_risks_from_context%' then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check missing new purpose';
  end if;
  if v_def not like '%sentiment%' or v_def not like '%coaching%' then
    raise exception 'SMOKE FAIL: ki_runs_purpose_check dropped sentiment/coaching again (def=%)', v_def;
  end if;

  -- CHECK 2: ki_suggestions purpose CHECK admits the new purpose
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_suggestions_purpose_check';
  if v_def is null or v_def not like '%proposal_risks_from_context%' then
    raise exception 'SMOKE FAIL: ki_suggestions_purpose_check missing new purpose';
  end if;

  -- CHECK 3: both RPCs exist
  if (
    select count(*) from pg_proc
    where proname in ('accept_risk_proposals_bulk', 'accept_risk_proposals_undo')
  ) <> 2 then
    raise exception 'SMOKE FAIL: risk-proposals accept/undo RPC pair incomplete';
  end if;

  -- CHECK 4: immutability trigger function mentions the new purpose
  if not exists (
    select 1 from pg_proc
    where proname = 'enforce_ki_suggestion_immutability'
      and prosrc like '%proposal_risks_from_context%'
  ) then
    raise exception 'SMOKE FAIL: immutability bypass not extended';
  end if;

  -- CHECK 5: ki_provenance entity CHECK still admits risks
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname = 'ki_provenance_entity_check';
  if v_def is null or v_def not like '%risks%' then
    raise exception 'SMOKE FAIL: ki_provenance_entity_check missing risks';
  end if;

  raise notice 'PROJ-89 migration smoke checks passed.';
end
$smoke$;
