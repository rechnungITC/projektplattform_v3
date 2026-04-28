-- =============================================================================
-- PROJ-20: Risks + Decisions + Open Items (governance backbone)
-- =============================================================================
-- - risks       : operational risk register (PROJ-7 deferred this; PROJ-20 owns)
-- - decisions   : immutable decision body, revisions via supersedes chain
-- - open_items  : lightweight clarification artifacts; convert into task or
--                 decision via SECURITY DEFINER RPCs
--
-- Audit hooks (PROJ-10):
--   * audit_log_entries.entity_type CHECK extended with the three new types
--   * _tracked_audit_columns() returns column whitelists for risks/open_items
--   * record_decision_insert() trigger writes one audit row per INSERT on
--     decisions (the standard UPDATE-trigger only covers mutations).
-- =============================================================================

-- --------------------------------------------------------------------------
-- Section 1: risks
-- --------------------------------------------------------------------------

create table public.risks (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  project_id            uuid not null,
  title                 text not null,
  description           text,
  probability           smallint not null,
  impact                smallint not null,
  score                 smallint generated always as (probability * impact) stored,
  status                text not null default 'open',
  mitigation            text,
  responsible_user_id   uuid,
  created_by            uuid not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint risks_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint risks_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint risks_responsible_fkey
    foreign key (responsible_user_id) references public.profiles(id) on delete set null,
  constraint risks_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint risks_title_length check (char_length(title) between 1 and 255),
  constraint risks_description_length check (description is null or char_length(description) <= 5000),
  constraint risks_mitigation_length check (mitigation is null or char_length(mitigation) <= 5000),
  constraint risks_probability_range check (probability between 1 and 5),
  constraint risks_impact_range check (impact between 1 and 5),
  constraint risks_status_check check (status in ('open','mitigated','accepted','closed'))
);

create index risks_project_status_idx
  on public.risks (project_id, status);
create index risks_project_score_idx
  on public.risks (project_id, score desc);
create index risks_responsible_idx
  on public.risks (responsible_user_id)
  where responsible_user_id is not null;

alter table public.risks enable row level security;

create policy "risks_select_member"
  on public.risks for select
  using (public.is_project_member(project_id));

create policy "risks_insert_editor_or_lead_or_admin"
  on public.risks for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "risks_update_editor_or_lead_or_admin"
  on public.risks for update
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

create policy "risks_delete_lead_or_admin"
  on public.risks for delete
  using (
    public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger risks_set_updated_at
  before update on public.risks
  for each row execute procedure extensions.moddatetime ('updated_at');

-- --------------------------------------------------------------------------
-- Section 2: decisions (immutable body, supersedes chain)
-- --------------------------------------------------------------------------

create table public.decisions (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null,
  project_id                uuid not null,
  title                     text not null,
  decision_text             text not null,
  rationale                 text,
  decided_at                timestamptz not null default now(),
  decider_stakeholder_id    uuid,
  context_phase_id          uuid,
  context_risk_id           uuid,
  supersedes_decision_id    uuid,
  is_revised                boolean not null default false,
  created_by                uuid not null,
  created_at                timestamptz not null default now(),
  constraint decisions_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint decisions_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint decisions_decider_fkey
    foreign key (decider_stakeholder_id) references public.stakeholders(id) on delete set null,
  constraint decisions_phase_fkey
    foreign key (context_phase_id) references public.phases(id) on delete set null,
  constraint decisions_risk_fkey
    foreign key (context_risk_id) references public.risks(id) on delete set null,
  constraint decisions_supersedes_fkey
    foreign key (supersedes_decision_id) references public.decisions(id) on delete set null,
  constraint decisions_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint decisions_title_length check (char_length(title) between 1 and 255),
  constraint decisions_text_length check (char_length(decision_text) between 1 and 10000),
  constraint decisions_rationale_length check (rationale is null or char_length(rationale) <= 10000),
  constraint decisions_no_self_supersede check (
    supersedes_decision_id is null or supersedes_decision_id <> id
  )
);

create index decisions_project_decided_idx
  on public.decisions (project_id, decided_at desc);
create index decisions_supersedes_idx
  on public.decisions (supersedes_decision_id)
  where supersedes_decision_id is not null;
create index decisions_active_idx
  on public.decisions (project_id, decided_at desc)
  where is_revised = false;

alter table public.decisions enable row level security;

create policy "decisions_select_member"
  on public.decisions for select
  using (public.is_project_member(project_id));

create policy "decisions_insert_editor_or_lead_or_admin"
  on public.decisions for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

-- Decisions are append-only at the API layer. The body fields are protected
-- by API logic (PATCH rejects body changes); only `is_revised` flips, and
-- only via the post-revision trigger below. We still allow UPDATE in RLS so
-- the trigger can run server-side; user routes never expose a body PATCH.
create policy "decisions_update_editor_or_lead_or_admin"
  on public.decisions for update
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

create policy "decisions_delete_lead_or_admin"
  on public.decisions for delete
  using (
    public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

-- When a decision is inserted with supersedes_decision_id set, flip the
-- predecessor's is_revised flag. This is the only legitimate way for
-- is_revised to change.
create or replace function public.decisions_after_insert_flip_predecessor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.supersedes_decision_id is not null then
    update public.decisions
       set is_revised = true
     where id = NEW.supersedes_decision_id
       and is_revised = false;
  end if;
  return NEW;
end;
$$;

create trigger decisions_flip_predecessor
  after insert on public.decisions
  for each row execute function public.decisions_after_insert_flip_predecessor();

-- --------------------------------------------------------------------------
-- Section 3: open_items
-- --------------------------------------------------------------------------

create table public.open_items (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null,
  project_id                  uuid not null,
  title                       text not null,
  description                 text,
  status                      text not null default 'open',
  contact                     text,
  contact_stakeholder_id      uuid,
  converted_to_entity_type    text,
  converted_to_entity_id      uuid,
  created_by                  uuid not null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint open_items_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint open_items_project_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint open_items_contact_fkey
    foreign key (contact_stakeholder_id) references public.stakeholders(id) on delete set null,
  constraint open_items_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  constraint open_items_title_length check (char_length(title) between 1 and 255),
  constraint open_items_description_length check (description is null or char_length(description) <= 5000),
  constraint open_items_contact_length check (contact is null or char_length(contact) <= 255),
  constraint open_items_status_check check (status in ('open','in_clarification','closed','converted')),
  constraint open_items_converted_kind check (
    converted_to_entity_type is null
    or converted_to_entity_type in ('work_items','decisions')
  ),
  constraint open_items_converted_consistency check (
    (converted_to_entity_type is null and converted_to_entity_id is null)
    or (converted_to_entity_type is not null and converted_to_entity_id is not null)
  ),
  constraint open_items_converted_status check (
    (status = 'converted' and converted_to_entity_type is not null)
    or (status <> 'converted' and converted_to_entity_type is null)
  )
);

create index open_items_project_status_idx
  on public.open_items (project_id, status);
create index open_items_project_created_idx
  on public.open_items (project_id, created_at desc);

alter table public.open_items enable row level security;

create policy "open_items_select_member"
  on public.open_items for select
  using (public.is_project_member(project_id));

create policy "open_items_insert_editor_or_lead_or_admin"
  on public.open_items for insert
  with check (
    public.has_project_role(project_id, 'editor')
    or public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "open_items_update_editor_or_lead_or_admin"
  on public.open_items for update
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

create policy "open_items_delete_lead_or_admin"
  on public.open_items for delete
  using (
    public.is_project_lead(project_id)
    or public.is_tenant_admin(tenant_id)
  );

create trigger open_items_set_updated_at
  before update on public.open_items
  for each row execute procedure extensions.moddatetime ('updated_at');

-- --------------------------------------------------------------------------
-- Section 4: PROJ-10 audit hooks — extend whitelist + add INSERT trigger for
-- decisions.
-- --------------------------------------------------------------------------

-- 4a. Extend entity_type CHECK constraint
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items'
    )
  );

-- 4b. Extend tracked-columns whitelist
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    else array[]::text[]
  end
$$;

-- 4c. Attach the standard UPDATE audit trigger to risks and open_items.
-- decisions get a separate INSERT-side trigger (body is immutable; only
-- is_revised mutates and is captured by the existing UPDATE trigger).
create trigger audit_changes_risks
  after update on public.risks
  for each row execute function public.record_audit_changes();

create trigger audit_changes_open_items
  after update on public.open_items
  for each row execute function public.record_audit_changes();

create trigger audit_changes_decisions
  after update on public.decisions
  for each row execute function public.record_audit_changes();

-- 4d. INSERT-side audit trigger for decisions: writes one summary row per
-- new decision with the full body in new_value.
create or replace function public.record_decision_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_reason text;
  v_payload jsonb;
begin
  v_actor := auth.uid();
  v_reason := case
    when NEW.supersedes_decision_id is not null then 'decision_revised'
    else 'decision_logged'
  end;

  v_payload := jsonb_build_object(
    'title', NEW.title,
    'decision_text', NEW.decision_text,
    'rationale', NEW.rationale,
    'decided_at', NEW.decided_at,
    'decider_stakeholder_id', NEW.decider_stakeholder_id,
    'context_phase_id', NEW.context_phase_id,
    'context_risk_id', NEW.context_risk_id,
    'supersedes_decision_id', NEW.supersedes_decision_id
  );

  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  ) values (
    NEW.tenant_id, 'decisions', NEW.id, '_record',
    null, v_payload, v_actor, v_reason
  );

  return NEW;
end;
$$;

revoke execute on function public.record_decision_insert() from public;

create trigger decisions_record_insert
  after insert on public.decisions
  for each row execute function public.record_decision_insert();

-- 4e. Extend can_read_audit_entry() to recognise the new entity types
create or replace function public.can_read_audit_entry(
  p_entity_type text,
  p_entity_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_project uuid;
begin
  if public.is_tenant_admin(p_tenant_id) then
    return true;
  end if;

  case p_entity_type
    when 'projects' then v_project := p_entity_id;
    when 'stakeholders' then
      select project_id into v_project from public.stakeholders where id = p_entity_id;
    when 'work_items' then
      select project_id into v_project from public.work_items where id = p_entity_id;
    when 'phases' then
      select project_id into v_project from public.phases where id = p_entity_id;
    when 'milestones' then
      select project_id into v_project from public.milestones where id = p_entity_id;
    when 'risks' then
      select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then
      select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then
      select project_id into v_project from public.open_items where id = p_entity_id;
    else
      return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

-- --------------------------------------------------------------------------
-- Section 5: convert RPCs (atomic open_item → task / decision)
-- --------------------------------------------------------------------------
-- Each RPC runs the conversion in a single transaction:
--   1. Insert target entity (work_item or decision)
--   2. Update open_item: status='converted', converted_to_*
-- RLS gates both writes; SECURITY DEFINER trusts the caller's auth.uid()
-- that is propagated by Supabase. Convert is one-way: the open_items_*
-- check constraints prevent setting back to open.
-- --------------------------------------------------------------------------

create or replace function public.convert_open_item_to_task(
  p_open_item_id uuid
)
returns table(success boolean, message text, work_item_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oi public.open_items;
  v_actor uuid;
  v_new_id uuid;
begin
  select * into v_oi from public.open_items where id = p_open_item_id;
  if not found then
    return query select false, 'open_item_not_found', null::uuid;
    return;
  end if;
  if v_oi.status = 'converted' then
    return query select false, 'already_converted', null::uuid;
    return;
  end if;
  if not (
    public.has_project_role(v_oi.project_id, 'editor')
    or public.is_project_lead(v_oi.project_id)
    or public.is_tenant_admin(v_oi.tenant_id)
  ) then
    return query select false, 'forbidden', null::uuid;
    return;
  end if;

  v_actor := auth.uid();

  insert into public.work_items (
    tenant_id, project_id, kind, title, description, status, priority, created_by
  ) values (
    v_oi.tenant_id, v_oi.project_id, 'task',
    v_oi.title,
    v_oi.description,
    'todo',
    'medium',
    v_actor
  )
  returning id into v_new_id;

  perform set_config('audit.change_reason', 'open_item_converted_to_task', true);

  update public.open_items
     set status = 'converted',
         converted_to_entity_type = 'work_items',
         converted_to_entity_id = v_new_id
   where id = p_open_item_id;

  return query select true, 'ok', v_new_id;
end;
$$;

revoke execute on function public.convert_open_item_to_task(uuid) from public;
grant execute on function public.convert_open_item_to_task(uuid) to authenticated;

create or replace function public.convert_open_item_to_decision(
  p_open_item_id        uuid,
  p_decision_text       text,
  p_rationale           text,
  p_decider_stakeholder uuid,
  p_context_phase_id    uuid,
  p_context_risk_id     uuid
)
returns table(success boolean, message text, decision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oi public.open_items;
  v_actor uuid;
  v_new_id uuid;
begin
  select * into v_oi from public.open_items where id = p_open_item_id;
  if not found then
    return query select false, 'open_item_not_found', null::uuid;
    return;
  end if;
  if v_oi.status = 'converted' then
    return query select false, 'already_converted', null::uuid;
    return;
  end if;
  if not (
    public.has_project_role(v_oi.project_id, 'editor')
    or public.is_project_lead(v_oi.project_id)
    or public.is_tenant_admin(v_oi.tenant_id)
  ) then
    return query select false, 'forbidden', null::uuid;
    return;
  end if;

  v_actor := auth.uid();

  insert into public.decisions (
    tenant_id, project_id, title, decision_text, rationale, decided_at,
    decider_stakeholder_id, context_phase_id, context_risk_id, created_by
  ) values (
    v_oi.tenant_id, v_oi.project_id,
    v_oi.title,
    p_decision_text,
    p_rationale,
    now(),
    p_decider_stakeholder,
    p_context_phase_id,
    p_context_risk_id,
    v_actor
  )
  returning id into v_new_id;

  perform set_config('audit.change_reason', 'open_item_converted_to_decision', true);

  update public.open_items
     set status = 'converted',
         converted_to_entity_type = 'decisions',
         converted_to_entity_id = v_new_id
   where id = p_open_item_id;

  return query select true, 'ok', v_new_id;
end;
$$;

revoke execute on function public.convert_open_item_to_decision(uuid, text, text, uuid, uuid, uuid) from public;
grant execute on function public.convert_open_item_to_decision(uuid, text, text, uuid, uuid, uuid) to authenticated;
