-- =============================================================================
-- PROJ-12: KI assistance — runs, suggestions, provenance + accept RPC
-- =============================================================================
-- Three multi-tenant tables under existing RLS helpers:
--   ki_runs        — one row per AI invocation (incl. blocked + errored ones)
--   ki_suggestions — one row per generated proposal item
--   ki_provenance  — links accepted entities back to their suggestion
--
-- The accept-RPC for risks runs in one transaction:
--   1. Insert the risks row
--   2. Insert the ki_provenance row pointing at the new risk
--   3. Update ki_suggestions: status='accepted', accepted_entity_*, accepted_at
--   4. Insert one audit_log_entries row with reason='ki_acceptance' so
--      HistoryTab and tenant audit reports surface the AI origin.
-- A separate RPC will handle decisions / work_items in later slices.
-- =============================================================================

-- ki_runs
create table public.ki_runs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  project_id          uuid not null,
  actor_user_id       uuid,
  purpose             text not null,
  classification      smallint not null,
  provider            text not null,
  model_id            text,
  status              text not null,
  input_tokens        integer,
  output_tokens       integer,
  latency_ms          integer,
  error_message       text,
  created_at          timestamptz not null default now(),
  constraint ki_runs_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint ki_runs_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint ki_runs_actor_fkey
    foreign key (actor_user_id) references public.profiles(id) on delete set null,
  constraint ki_runs_purpose_check
    check (purpose in ('risks','decisions','work_items','open_items')),
  constraint ki_runs_classification_check
    check (classification between 1 and 3),
  constraint ki_runs_provider_check
    check (provider in ('anthropic','stub','ollama')),
  constraint ki_runs_status_check
    check (status in ('success','error','external_blocked'))
);

create index ki_runs_project_idx on public.ki_runs (project_id, created_at desc);
create index ki_runs_actor_idx on public.ki_runs (actor_user_id, created_at desc) where actor_user_id is not null;

alter table public.ki_runs enable row level security;
create policy "ki_runs_select_member" on public.ki_runs for select
  using (public.is_project_member(project_id));
create policy "ki_runs_insert_editor_or_lead_or_admin" on public.ki_runs for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

-- ki_suggestions
create table public.ki_suggestions (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null,
  project_id               uuid not null,
  ki_run_id                uuid not null,
  purpose                  text not null,
  payload                  jsonb not null,
  original_payload         jsonb not null,
  is_modified              boolean not null default false,
  status                   text not null default 'draft',
  accepted_entity_type     text,
  accepted_entity_id       uuid,
  rejection_reason         text,
  created_by               uuid not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  accepted_at              timestamptz,
  rejected_at              timestamptz,
  constraint ki_suggestions_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint ki_suggestions_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint ki_suggestions_run_fkey
    foreign key (ki_run_id) references public.ki_runs(id) on delete cascade,
  constraint ki_suggestions_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint ki_suggestions_purpose_check
    check (purpose in ('risks','decisions','work_items','open_items')),
  constraint ki_suggestions_status_check
    check (status in ('draft','accepted','rejected')),
  constraint ki_suggestions_accepted_consistency
    check ((status = 'accepted' and accepted_entity_type is not null and accepted_entity_id is not null)
        or (status <> 'accepted' and accepted_entity_type is null and accepted_entity_id is null)),
  constraint ki_suggestions_rejected_at_consistency
    check ((status = 'rejected' and rejected_at is not null)
        or (status <> 'rejected' and rejected_at is null)),
  constraint ki_suggestions_accepted_at_consistency
    check ((status = 'accepted' and accepted_at is not null)
        or (status <> 'accepted' and accepted_at is null)),
  constraint ki_suggestions_rejection_reason_length
    check (rejection_reason is null or char_length(rejection_reason) <= 1000)
);

create index ki_suggestions_project_status_idx on public.ki_suggestions (project_id, status, created_at desc);
create index ki_suggestions_run_idx on public.ki_suggestions (ki_run_id);

alter table public.ki_suggestions enable row level security;
create policy "ki_suggestions_select_member" on public.ki_suggestions for select
  using (public.is_project_member(project_id));
create policy "ki_suggestions_insert_editor_or_lead_or_admin" on public.ki_suggestions for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );
create policy "ki_suggestions_update_editor_or_lead_or_admin" on public.ki_suggestions for update
  using (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  )
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger ki_suggestions_set_updated_at
  before update on public.ki_suggestions
  for each row execute procedure extensions.moddatetime ('updated_at');

-- ki_provenance
create table public.ki_provenance (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  entity_type         text not null,
  entity_id           uuid not null,
  ki_suggestion_id    uuid not null,
  was_modified        boolean not null default false,
  created_at          timestamptz not null default now(),
  constraint ki_provenance_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint ki_provenance_suggestion_fkey
    foreign key (ki_suggestion_id) references public.ki_suggestions(id) on delete cascade,
  constraint ki_provenance_entity_check
    check (entity_type in ('risks','decisions','work_items','open_items')),
  constraint ki_provenance_entity_unique
    unique (entity_type, entity_id)
);

create index ki_provenance_entity_idx on public.ki_provenance (entity_type, entity_id);
create index ki_provenance_suggestion_idx on public.ki_provenance (ki_suggestion_id);

alter table public.ki_provenance enable row level security;
create policy "ki_provenance_select_member" on public.ki_provenance for select
  using (
    public.is_tenant_admin(tenant_id)
    or exists (
      select 1 from public.ki_suggestions s
       where s.id = ki_suggestion_id
         and public.is_project_member(s.project_id)
    )
  );

-- accept_ki_suggestion_risk RPC
create or replace function public.accept_ki_suggestion_risk(p_suggestion_id uuid)
returns table(success boolean, message text, risk_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug public.ki_suggestions;
  v_actor uuid;
  v_new_id uuid;
  v_payload jsonb;
  v_title text;
  v_description text;
  v_probability smallint;
  v_impact smallint;
  v_status text;
  v_mitigation text;
begin
  select * into v_sug from public.ki_suggestions where id = p_suggestion_id;
  if not found then
    return query select false, 'suggestion_not_found', null::uuid;
    return;
  end if;
  if v_sug.status <> 'draft' then
    return query select false, 'suggestion_not_draft', null::uuid;
    return;
  end if;
  if v_sug.purpose <> 'risks' then
    return query select false, 'wrong_purpose', null::uuid;
    return;
  end if;
  if not (
    public.has_project_role(v_sug.project_id, 'editor')
    or public.is_project_lead(v_sug.project_id)
    or public.is_tenant_admin(v_sug.tenant_id)
  ) then
    return query select false, 'forbidden', null::uuid;
    return;
  end if;

  v_actor := auth.uid();
  v_payload := v_sug.payload;
  v_title := v_payload ->> 'title';
  v_description := v_payload ->> 'description';
  v_probability := (v_payload ->> 'probability')::smallint;
  v_impact := (v_payload ->> 'impact')::smallint;
  v_status := coalesce(v_payload ->> 'status', 'open');
  v_mitigation := v_payload ->> 'mitigation';

  if v_title is null or char_length(v_title) = 0 then
    return query select false, 'invalid_payload_title', null::uuid;
    return;
  end if;
  if v_probability is null or v_probability < 1 or v_probability > 5 then
    return query select false, 'invalid_payload_probability', null::uuid;
    return;
  end if;
  if v_impact is null or v_impact < 1 or v_impact > 5 then
    return query select false, 'invalid_payload_impact', null::uuid;
    return;
  end if;

  perform set_config('audit.change_reason', 'ki_acceptance', true);

  insert into public.risks (
    tenant_id, project_id, title, description, probability, impact,
    status, mitigation, created_by
  ) values (
    v_sug.tenant_id, v_sug.project_id, v_title, v_description,
    v_probability, v_impact, v_status, v_mitigation, v_actor
  )
  returning id into v_new_id;

  insert into public.ki_provenance (
    tenant_id, entity_type, entity_id, ki_suggestion_id, was_modified
  ) values (
    v_sug.tenant_id, 'risks', v_new_id, v_sug.id, v_sug.is_modified
  );

  update public.ki_suggestions
     set status = 'accepted',
         accepted_entity_type = 'risks',
         accepted_entity_id = v_new_id,
         accepted_at = now()
   where id = p_suggestion_id;

  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  ) values (
    v_sug.tenant_id, 'risks', v_new_id, '_record',
    null, v_payload, v_actor, 'ki_acceptance'
  );

  return query select true, 'ok', v_new_id;
end;
$$;

revoke execute on function public.accept_ki_suggestion_risk(uuid) from public;
grant execute on function public.accept_ki_suggestion_risk(uuid) to authenticated;
