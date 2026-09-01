-- PROJ-Y-5a alpha — skill-guided project context.
--
-- The permanent record is deliberately separate from evidence sources and
-- project chat.  The initial revision is created in the same transaction as
-- the project, its creator access and the draft deletion.  A unique origin
-- draft id makes retries return the first project instead of creating another.

-- ---------------------------------------------------------------------------
-- AI purpose lockstep (non-proposal purpose: no ki_suggestions/undo register)
-- ---------------------------------------------------------------------------
do $$
declare
  v_runs text;
  v_caps text;
  v_anchor constant text := '''work_items_from_project_intent''::text';
  v_replacement constant text :=
    '''work_items_from_project_intent''::text, ''skill_context_clarification''::text';
begin
  select pg_get_constraintdef(oid) into v_runs
    from pg_constraint where conname = 'ki_runs_purpose_check';
  select pg_get_constraintdef(oid) into v_caps
    from pg_constraint where conname = 'tenant_ai_cost_caps_purpose_check';

  if v_runs is null or v_caps is null then
    raise exception 'PROJ-Y-5a: purpose register constraint missing';
  end if;
  if v_runs not like '%' || v_anchor || '%'
     or v_caps not like '%' || v_anchor || '%' then
    raise exception 'PROJ-Y-5a: current purpose anchor missing';
  end if;

  if v_runs not like '%skill_context_clarification%' then
    execute 'alter table public.ki_runs drop constraint ki_runs_purpose_check';
    execute 'alter table public.ki_runs add constraint ki_runs_purpose_check '
      || replace(v_runs, v_anchor, v_replacement);
  end if;
  if v_caps not like '%skill_context_clarification%' then
    execute 'alter table public.tenant_ai_cost_caps drop constraint tenant_ai_cost_caps_purpose_check';
    execute 'alter table public.tenant_ai_cost_caps add constraint tenant_ai_cost_caps_purpose_check '
      || replace(v_caps, v_anchor, v_replacement);
  end if;
end
$$;

-- project_id may be null only for the two pre-project wizard purposes.
alter table public.ki_runs drop constraint if exists ki_runs_project_id_bounded_null;
alter table public.ki_runs add constraint ki_runs_project_id_bounded_null
  check (
    project_id is not null
    or purpose in ('clarifying_questions_from_context', 'skill_context_clarification')
  );

-- Tighten unfinished run metadata from tenant-wide to the draft owner. Once
-- finalize re-links the run, the existing project-scoped policies take over.
drop policy if exists "ki_runs_select_member_tenant_draft" on public.ki_runs;
create policy "ki_runs_select_member_tenant_draft" on public.ki_runs for select
  using (
    project_id is null and exists (
      select 1 from public.project_wizard_drafts d
      where d.id = wizard_draft_id and d.created_by = auth.uid()
        and d.tenant_id = ki_runs.tenant_id
    )
  );
drop policy if exists "ki_runs_insert_member_tenant_draft" on public.ki_runs;
create policy "ki_runs_insert_member_tenant_draft" on public.ki_runs for insert
  with check (
    project_id is null and exists (
      select 1 from public.project_wizard_drafts d
      where d.id = wizard_draft_id and d.created_by = auth.uid()
        and d.tenant_id = ki_runs.tenant_id
    )
  );
drop policy if exists "ki_runs_update_member_tenant_draft" on public.ki_runs;
create policy "ki_runs_update_member_tenant_draft" on public.ki_runs for update
  using (
    project_id is null and exists (
      select 1 from public.project_wizard_drafts d
      where d.id = wizard_draft_id and d.created_by = auth.uid()
        and d.tenant_id = ki_runs.tenant_id
    )
  )
  with check (public.is_tenant_member(tenant_id));

-- Extend the strict-read audit vocabulary from the live constraint, preserving
-- every sibling surface added by PROJ-130 delta.
do $$
declare
  v_def text;
  v_anchor constant text := '''dd_report''::text';
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint where conname = 'confidential_read_log_entity_type_check';
  if v_def is null then
    raise exception 'PROJ-Y-5a: confidential read entity constraint missing';
  end if;
  if v_def not like '%project_context_documents%' then
    if v_def not like '%' || v_anchor || '%' then
      raise exception 'PROJ-Y-5a: confidential read anchor missing: %', v_def;
    end if;
    execute 'alter table public.confidential_read_log drop constraint confidential_read_log_entity_type_check';
    execute 'alter table public.confidential_read_log add constraint confidential_read_log_entity_type_check '
      || replace(v_def, v_anchor,
        v_anchor || ', ''project_context_documents''::text');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Permanent immutable documentation
-- ---------------------------------------------------------------------------
create table public.project_context_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  origin_draft_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  current_revision_id uuid,
  created_at timestamptz not null default now(),
  constraint project_context_documents_project_unique unique (project_id),
  constraint project_context_documents_origin_draft_unique unique (origin_draft_id)
);

create table public.project_context_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.project_context_documents(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  context jsonb not null,
  summary text not null default '',
  analysis_status text not null check (analysis_status in (
    'captured_not_ai_analyzed','ai_analyzed','ai_interrupted'
  )),
  reason_code text check (reason_code is null or reason_code in (
    'no_provider','class3_blocked','provider_error','cost_cap_exceeded',
    'external_ai_disabled'
  )),
  privacy_class smallint not null default 2 check (privacy_class between 1 and 3),
  supersedes_revision_id uuid references public.project_context_revisions(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_context_revisions_number_unique unique (document_id, revision_number),
  constraint project_context_revisions_size check (pg_column_size(context) <= 1048576)
);

alter table public.project_context_documents
  add constraint project_context_documents_current_revision_fkey
  foreign key (current_revision_id)
  references public.project_context_revisions(id) on delete set null;

create table public.project_context_skill_coverage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  revision_id uuid not null references public.project_context_revisions(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  skill_version_id uuid not null references public.skill_versions(id) on delete restrict,
  skill_name text not null,
  coverage_state text not null check (coverage_state in (
    'needs_clarification','sufficient','unknown','not_applicable','skipped'
  )),
  evidence_statement_ids jsonb not null default '[]'::jsonb,
  stale boolean not null default false,
  confirmed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint project_context_coverage_revision_version_unique
    unique (revision_id, skill_version_id),
  constraint project_context_coverage_evidence_array
    check (jsonb_typeof(evidence_statement_ids) = 'array'),
  constraint project_context_coverage_sufficient_has_evidence
    check (coverage_state <> 'sufficient' or jsonb_array_length(evidence_statement_ids) > 0)
);

create table public.project_context_turns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  revision_id uuid not null references public.project_context_revisions(id) on delete cascade,
  client_turn_id text not null,
  turn_index integer not null check (turn_index >= 0),
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 10000),
  status text not null check (status in ('complete','interrupted')),
  author_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_context_turns_client_unique unique (revision_id, client_turn_id),
  constraint project_context_turns_index_unique unique (revision_id, turn_index)
);

create index project_context_documents_tenant_project_idx
  on public.project_context_documents (tenant_id, project_id);
create index project_context_revisions_document_created_idx
  on public.project_context_revisions (document_id, created_at desc);
create index project_context_coverage_revision_idx
  on public.project_context_skill_coverage (revision_id);
create index project_context_turns_revision_idx
  on public.project_context_turns (revision_id, turn_index);

alter table public.project_context_documents enable row level security;
alter table public.project_context_revisions enable row level security;
alter table public.project_context_skill_coverage enable row level security;
alter table public.project_context_turns enable row level security;

-- One permissive project-member policy plus one restrictive classification
-- policy on every level.  There are intentionally no direct write policies;
-- alpha writes only through the finalize transaction below.
create policy project_context_documents_select_member
  on public.project_context_documents for select to authenticated
  using (public.is_tenant_member(tenant_id) and public.is_project_member(project_id));
create policy project_context_documents_select_classified
  on public.project_context_documents as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

create policy project_context_revisions_select_member
  on public.project_context_revisions for select to authenticated
  using (exists (
    select 1 from public.project_context_documents d
    where d.id = document_id
  ));
create policy project_context_revisions_select_classified
  on public.project_context_revisions as restrictive for select to authenticated
  using (exists (
    select 1 from public.project_context_documents d
    where d.id = document_id
      and public.can_access_classified(d.project_id, d.confidentiality_level)
  ));

create policy project_context_coverage_select_member
  on public.project_context_skill_coverage for select to authenticated
  using (exists (
    select 1 from public.project_context_revisions r
    join public.project_context_documents d on d.id = r.document_id
    where r.id = revision_id
  ));
create policy project_context_coverage_select_classified
  on public.project_context_skill_coverage as restrictive for select to authenticated
  using (exists (
    select 1 from public.project_context_revisions r
    join public.project_context_documents d on d.id = r.document_id
    where r.id = revision_id
      and public.can_access_classified(d.project_id, d.confidentiality_level)
  ));

create policy project_context_turns_select_restricted
  on public.project_context_turns for select to authenticated
  using (exists (
    select 1 from public.project_context_revisions r
    join public.project_context_documents d on d.id = r.document_id
    where r.id = revision_id
      and (
        author_user_id = auth.uid()
        or public.is_project_lead(d.project_id)
        or public.has_project_role(d.project_id, 'editor')
      )
  ));
create policy project_context_turns_select_classified
  on public.project_context_turns as restrictive for select to authenticated
  using (exists (
    select 1 from public.project_context_revisions r
    join public.project_context_documents d on d.id = r.document_id
    where r.id = revision_id
      and public.can_access_classified(d.project_id, d.confidentiality_level)
  ));

-- ---------------------------------------------------------------------------
-- Atomic, owner-bound and idempotent project + initial-context finalize.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_project_wizard_with_context(
  p_draft_id uuid,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_actor uuid := auth.uid();
  v_draft public.project_wizard_drafts%rowtype;
  v_existing_project uuid;
  v_project public.projects%rowtype;
  v_context jsonb;
  v_document_id uuid;
  v_revision_id uuid;
  v_item jsonb;
  v_skill_id uuid;
  v_skill_version_id uuid;
  v_skill_name text;
  v_turn_index integer := 0;
  v_assignments jsonb;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select project_id into v_existing_project
  from public.project_context_documents
  where origin_draft_id = p_draft_id and created_by = v_actor;
  if v_existing_project is not null then
    return jsonb_build_object('project_id', v_existing_project, 'created', false);
  end if;

  select * into v_draft
  from public.project_wizard_drafts
  where id = p_draft_id and created_by = v_actor
  for update;
  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_draft.updated_at <> p_expected_updated_at then
    raise exception 'draft conflict' using errcode = '40001';
  end if;
  if not public.is_tenant_member(v_draft.tenant_id) then
    raise exception 'tenant membership required' using errcode = '42501';
  end if;
  if nullif(btrim(v_draft.data->>'name'), '') is null
     or nullif(btrim(v_draft.data->>'project_type'), '') is null then
    raise exception 'project name and type required' using errcode = '23514';
  end if;

  insert into public.projects (
    tenant_id, name, description, project_number, planned_start_date,
    planned_end_date, responsible_user_id, project_type, project_method,
    type_specific_data, created_by
  ) values (
    v_draft.tenant_id,
    btrim(v_draft.data->>'name'),
    nullif(btrim(v_draft.data->>'description'), ''),
    nullif(btrim(v_draft.data->>'project_number'), ''),
    nullif(left(v_draft.data->>'planned_start_date', 10), '')::date,
    nullif(left(v_draft.data->>'planned_end_date', 10), '')::date,
    coalesce(nullif(v_draft.data->>'responsible_user_id', '')::uuid, v_actor),
    v_draft.data->>'project_type',
    nullif(v_draft.data->>'project_method', ''),
    coalesce(v_draft.data->'type_specific_data', '{}'::jsonb),
    v_actor
  ) returning * into v_project;

  perform public.bootstrap_project_lead(v_project.id, v_actor);

  if v_project.project_type = 'ma' then
    if nullif(v_draft.data->'ma_foundation'->>'sponsor_user_id', '') is null then
      raise exception 'M&A sponsor required' using errcode = '23514';
    end if;
    perform public.create_ma_project_profile(
      v_project.id,
      (v_draft.data->'ma_foundation'->>'sponsor_user_id')::uuid,
      case when v_draft.data->'ma_foundation'->>'deal_side'
          in ('buy','sell','jv','carve_out')
        then v_draft.data->'ma_foundation'->>'deal_side' else null end,
      nullif(btrim(v_draft.data->'ma_foundation'->>'deal_rationale'), ''),
      nullif(btrim(v_draft.data->'ma_foundation'->>'search_profile'), ''),
      nullif(btrim(v_draft.data->'ma_foundation'->>'exclusion_criteria'), ''),
      case when v_draft.data->'ma_foundation'->>'investment_frame_amount'
          ~ '^[0-9]+([.][0-9]+)?$'
        then (v_draft.data->'ma_foundation'->>'investment_frame_amount')::numeric
        else null end,
      nullif(btrim(v_draft.data->'ma_foundation'->>'investment_frame_currency'), ''),
      nullif(btrim(v_draft.data->'ma_foundation'->>'investment_frame_note'), ''),
      nullif(btrim(v_draft.data->'ma_foundation'->>'strategic_document_link'), ''),
      case when v_draft.data->'ma_foundation'->>'confidentiality_level'
          in ('standard','confidential','strict')
        then (v_draft.data->'ma_foundation'->>'confidentiality_level')::public.ma_confidentiality_level
        else 'standard'::public.ma_confidentiality_level end
    );
  end if;

  v_assignments := coalesce(v_draft.data->'skills'->'assignments', '[]'::jsonb);
  if jsonb_typeof(v_assignments) = 'array' and jsonb_array_length(v_assignments) > 0 then
    perform public.assign_project_skills(v_project.id, v_assignments);
  end if;

  v_context := coalesce(v_draft.data->'project_context', jsonb_build_object(
    'summary', '', 'statements', '[]'::jsonb, 'turns', '[]'::jsonb,
    'skill_coverage', '[]'::jsonb, 'gaps', '[]'::jsonb,
    'assumptions', '[]'::jsonb, 'contradictions', '[]'::jsonb,
    'analysis_status', 'captured_not_ai_analyzed', 'reason_code', null,
    'finished', false
  ));
  if jsonb_typeof(v_context) <> 'object' then
    raise exception 'invalid project context' using errcode = '22023';
  end if;

  insert into public.project_context_documents (
    tenant_id, project_id, origin_draft_id, created_by, confidentiality_level
  ) values (
    v_draft.tenant_id, v_project.id, p_draft_id, v_actor,
    case
      when v_project.confidentiality_level = 'strict'
        or v_draft.data->'ma_foundation'->>'confidentiality_level' = 'strict'
        then 'strict'::public.ma_confidentiality_level
      when v_project.confidentiality_level = 'confidential'
        or v_draft.data->'ma_foundation'->>'confidentiality_level' = 'confidential'
        then 'confidential'::public.ma_confidentiality_level
      else 'standard'::public.ma_confidentiality_level
    end
  ) returning id into v_document_id;

  insert into public.project_context_revisions (
    tenant_id, document_id, revision_number, context, summary,
    analysis_status, reason_code, privacy_class, created_by
  ) values (
    v_draft.tenant_id, v_document_id, 1, v_context,
    coalesce(v_context->>'summary', ''),
    coalesce(v_context->>'analysis_status', 'captured_not_ai_analyzed'),
    nullif(v_context->>'reason_code', ''),
    case when v_context::text ~* '(email|e-mail|telefon|phone|person)' then 3 else 2 end,
    v_actor
  ) returning id into v_revision_id;

  update public.project_context_documents
  set current_revision_id = v_revision_id
  where id = v_document_id;

  for v_item in select value from jsonb_array_elements(
    case when jsonb_typeof(v_context->'skill_coverage') = 'array'
      then v_context->'skill_coverage' else '[]'::jsonb end
  ) loop
    v_skill_id := nullif(v_item->>'skill_id', '')::uuid;
    if coalesce((v_item->>'stale')::boolean, false) then
      select sv.id, s.name into v_skill_version_id, v_skill_name
      from public.skills s
      join public.skill_versions sv on sv.skill_id = s.id
      where s.id = v_skill_id
        and sv.id = nullif(v_item->>'skill_version_id', '')::uuid
        and s.tenant_id = v_draft.tenant_id;
    else
      select s.current_version_id, s.name
        into v_skill_version_id, v_skill_name
      from public.skills s
      join public.project_skills ps on ps.skill_id = s.id
      where s.id = v_skill_id
        and ps.project_id = v_project.id
        and s.tenant_id = v_draft.tenant_id
        and s.is_active = true;
      if v_skill_version_id is distinct from nullif(v_item->>'skill_version_id', '')::uuid then
        raise exception 'selected skill version changed; review required'
          using errcode = '40001';
      end if;
    end if;
    if v_skill_version_id is null then
      raise exception 'selected skill version cannot be resolved' using errcode = '23514';
    end if;
    insert into public.project_context_skill_coverage (
      tenant_id, revision_id, skill_id, skill_version_id, skill_name,
      coverage_state, evidence_statement_ids, stale, confirmed_by
    ) values (
      v_draft.tenant_id, v_revision_id, v_skill_id, v_skill_version_id,
      v_skill_name, coalesce(v_item->>'state', 'needs_clarification'),
      coalesce(v_item->'evidence_statement_ids', '[]'::jsonb),
      coalesce((v_item->>'stale')::boolean, false), v_actor
    );
  end loop;

  -- Browser omission can never erase a selected skill from the canonical
  -- snapshot. Missing rows are inserted as unresolved, never as sufficient.
  insert into public.project_context_skill_coverage (
    tenant_id, revision_id, skill_id, skill_version_id, skill_name,
    coverage_state, evidence_statement_ids, stale, confirmed_by
  )
  select v_draft.tenant_id, v_revision_id, s.id, s.current_version_id, s.name,
         'needs_clarification', '[]'::jsonb, false, v_actor
  from public.project_skills ps
  join public.skills s on s.id = ps.skill_id
  where ps.project_id = v_project.id and s.current_version_id is not null
  on conflict (revision_id, skill_version_id) do nothing;

  for v_item in select value from jsonb_array_elements(
    case when jsonb_typeof(v_context->'turns') = 'array'
      then v_context->'turns' else '[]'::jsonb end
  ) loop
    if nullif(btrim(v_item->>'content'), '') is not null then
      insert into public.project_context_turns (
        tenant_id, revision_id, client_turn_id, turn_index, role, content,
        status, author_user_id
      ) values (
        v_draft.tenant_id, v_revision_id,
        coalesce(nullif(v_item->>'id', ''), v_turn_index::text), v_turn_index,
        coalesce(v_item->>'role', 'user'), left(v_item->>'content', 10000),
        coalesce(v_item->>'status', 'complete'),
        case when coalesce(v_item->>'role', 'user') = 'user' then v_actor else null end
      );
      v_turn_index := v_turn_index + 1;
    end if;
  end loop;

  update public.ki_runs set project_id = v_project.id
  where wizard_draft_id = p_draft_id
    and tenant_id = v_draft.tenant_id
    and project_id is null
    and purpose in ('clarifying_questions_from_context','skill_context_clarification');

  delete from public.project_wizard_drafts where id = p_draft_id;
  return jsonb_build_object('project_id', v_project.id, 'created', true);
end;
$$;

revoke execute on function public.finalize_project_wizard_with_context(uuid, timestamptz)
  from public, anon;
grant execute on function public.finalize_project_wizard_with_context(uuid, timestamptz)
  to authenticated;

revoke insert, update, delete on public.project_context_documents,
  public.project_context_revisions, public.project_context_skill_coverage,
  public.project_context_turns from authenticated, anon;

comment on function public.finalize_project_wizard_with_context(uuid, timestamptz) is
  'PROJ-Y-5a alpha: owner-bound, actor-from-auth, atomic and idempotent project creation with initial immutable project-context documentation.';
