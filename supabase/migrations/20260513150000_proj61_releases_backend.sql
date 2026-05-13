-- =============================================================================
-- PROJ-61: Jira-like Releases with Story Gantt / Phase Mapping
-- =============================================================================
--
-- Backend slice:
--   1. Adds first-class project-scoped `releases`.
--   2. Adds optional `work_items.release_id` for explicit release scope.
--   3. Enforces same-project/same-tenant guards for milestone + work-item links.
--   4. Enables RLS and audit tracking for release updates and release assignment.
--   5. Extends audit readability so project members can read release history.
--
-- Architecture lock:
--   Releases are not milestones or sprint groups. They are Jira-like Versions /
--   FixVersions; Sprints remain delivery context, not release ownership.
-- =============================================================================

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. First-class releases
-- ---------------------------------------------------------------------------
create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  start_date date,
  end_date date,
  status text not null default 'planned',
  target_milestone_id uuid references public.milestones(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint releases_name_length check (char_length(name) between 1 and 160),
  constraint releases_description_length check (
    description is null or char_length(description) <= 5000
  ),
  constraint releases_dates_order check (
    end_date is null or start_date is null or end_date >= start_date
  ),
  constraint releases_status_check check (
    status in ('planned', 'active', 'released', 'archived')
  )
);

create index if not exists releases_project_status_idx
  on public.releases (project_id, status, start_date nulls last);
create index if not exists releases_tenant_project_idx
  on public.releases (tenant_id, project_id);
create index if not exists releases_target_milestone_idx
  on public.releases (target_milestone_id)
  where target_milestone_id is not null;

alter table public.releases enable row level security;

drop policy if exists releases_select on public.releases;
create policy releases_select on public.releases
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists releases_insert on public.releases;
create policy releases_insert on public.releases
  for insert to authenticated
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );

drop policy if exists releases_update on public.releases;
create policy releases_update on public.releases
  for update to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  )
  with check (
    public.is_tenant_admin(tenant_id)
    or public.has_project_role(project_id, 'lead')
    or public.has_project_role(project_id, 'editor')
  );

drop policy if exists releases_delete on public.releases;
create policy releases_delete on public.releases
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop trigger if exists releases_touch_updated_at on public.releases;
create trigger releases_touch_updated_at
  before update on public.releases
  for each row execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 2. Validate release project/tenant, target milestone and allowed method.
--
-- Releases are available for Scrum + SAFe projects, matching PROJ-28's
-- method-aware `/releases` surface. NULL stays allowed during setup, matching
-- existing schedule-construct behavior.
-- ---------------------------------------------------------------------------
create or replace function public.tg_releases_validate_project_refs_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_project_tenant uuid;
  v_project_method text;
  v_milestone_project uuid;
begin
  select tenant_id, project_method
    into v_project_tenant, v_project_method
    from public.projects
   where id = NEW.project_id
     and is_deleted = false;

  if v_project_tenant is null then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if v_project_tenant <> NEW.tenant_id then
    raise exception 'release_project_tenant_mismatch' using errcode = 'P0003';
  end if;

  if v_project_method is not null
     and v_project_method not in ('scrum', 'safe') then
    raise exception 'releases_not_allowed_for_project_method'
      using errcode = '23514';
  end if;

  if NEW.target_milestone_id is not null then
    select project_id into v_milestone_project
      from public.milestones
     where id = NEW.target_milestone_id
       and is_deleted = false;

    if v_milestone_project is null then
      raise exception 'target_milestone_not_found' using errcode = 'P0002';
    end if;

    if v_milestone_project <> NEW.project_id then
      raise exception 'target_milestone_project_mismatch'
        using errcode = 'P0003';
    end if;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.tg_releases_validate_project_refs_fn()
  from public, anon, authenticated;

drop trigger if exists releases_validate_project_refs on public.releases;
create trigger releases_validate_project_refs
  before insert or update of tenant_id, project_id, target_milestone_id
  on public.releases
  for each row execute function public.tg_releases_validate_project_refs_fn();


-- ---------------------------------------------------------------------------
-- 3. Work-item release assignment
-- ---------------------------------------------------------------------------
alter table public.work_items
  add column if not exists release_id uuid
    references public.releases(id) on delete set null;

create index if not exists work_items_project_release_idx
  on public.work_items (project_id, release_id)
  where release_id is not null and is_deleted = false;
create index if not exists work_items_release_id_idx
  on public.work_items (release_id)
  where release_id is not null;

create or replace function public.tg_work_items_validate_release_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_release_project uuid;
  v_release_tenant uuid;
begin
  if NEW.release_id is null then
    return NEW;
  end if;

  if NEW.kind not in ('story', 'task', 'bug') then
    raise exception 'release_scope_kind_not_allowed' using errcode = '23514';
  end if;

  select project_id, tenant_id
    into v_release_project, v_release_tenant
    from public.releases
   where id = NEW.release_id;

  if v_release_project is null then
    raise exception 'release_not_found' using errcode = 'P0002';
  end if;

  if v_release_project <> NEW.project_id then
    raise exception 'release_project_mismatch' using errcode = 'P0003';
  end if;

  if v_release_tenant <> NEW.tenant_id then
    raise exception 'release_tenant_mismatch' using errcode = 'P0003';
  end if;

  return NEW;
end;
$$;

revoke execute on function public.tg_work_items_validate_release_fn()
  from public, anon, authenticated;

drop trigger if exists work_items_validate_release on public.work_items;
create trigger work_items_validate_release
  before insert or update of release_id, tenant_id, project_id, kind
  on public.work_items
  for each row execute function public.tg_work_items_validate_release_fn();


-- ---------------------------------------------------------------------------
-- 4. Audit whitelist and entity-type constraint
-- ---------------------------------------------------------------------------
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array[
      'name','role_key','org_unit','contact_email','contact_phone',
      'influence','impact','linked_user_id','notes','is_active',
      'kind','origin',
      'is_approver',
      'reasoning','stakeholder_type_key','management_level',
      'decision_authority','attitude','conflict_potential',
      'communication_need','preferred_channel',
      'organization_unit_id'
    ]
    when 'work_items' then array[
      'title','description','status','priority','responsible_user_id',
      'kind','sprint_id','parent_id','story_points','release_id'
    ]
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array[
      'name','role_key','default_capacity_hours_per_day','active','external_id',
      'linked_stakeholder_id','linked_user_id','notes',
      'daily_rate_override','daily_rate_override_currency',
      'organization_unit_id'
    ]
    when 'work_item_resources' then array['effort_hours','role_key','start_date','end_date']
    when 'tenant_project_type_overrides' then array['display_name','description','rules','active','sort_order']
    when 'tenant_method_overrides' then array['display_name','description','rules','active','sort_order']
    when 'vendors' then array['name','vendor_number','category','status','contact_email','contact_phone','website','notes','tax_id']
    when 'vendor_project_assignments' then array['role','status','signed_at','signed_off_by','removed_at','removed_by']
    when 'vendor_evaluations' then array['rubric_key','score','comment','evaluated_at','evaluated_by']
    when 'vendor_documents' then array['kind','title','file_url','signed_at','signed_off_by','expires_at','metadata']
    when 'compliance_tags' then array['key','label','description','data_classes','required_for_kinds']
    when 'work_item_documents' then array['title','file_url','tag_keys','description']
    when 'budget_categories' then array['name','description','position']
    when 'budget_items' then array['name','description','category_id','planned_amount','planned_currency','position']
    when 'budget_postings' then array['budget_item_id','amount','currency','posted_at','description','source_type','source_ref','reverses_posting_id']
    when 'vendor_invoices' then array['vendor_id','invoice_number','total_amount','currency','invoice_date','due_date','status','document_id','metadata']
    when 'report_snapshots' then array[]::text[]
    when 'role_rates' then array['daily_rate','currency','valid_from','role_key']
    when 'work_item_cost_lines' then array['amount','currency','source_type','source_metadata','occurred_on']
    when 'tenant_memberships' then array['role','organization_unit_id']
    when 'organization_units' then array[
      'name','code','type','parent_id','location_id','description',
      'is_active','sort_order','import_id'
    ]
    when 'locations' then array[
      'name','code','country','city','address','is_active','import_id'
    ]
    when 'stakeholder_interactions' then array[
      'summary','channel','direction','interaction_date',
      'awaiting_response','response_due_date','response_received_date',
      'replies_to_interaction_id','deleted_at'
    ]
    when 'stakeholder_interaction_participants' then array[
      'participant_sentiment','participant_sentiment_source',
      'participant_sentiment_model','participant_sentiment_provider',
      'participant_sentiment_confidence',
      'participant_cooperation_signal','participant_cooperation_signal_source'
    ]
    when 'releases' then array[
      'name','description','start_date','end_date','status',
      'target_milestone_id'
    ]
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;

alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items','tenants','tenant_settings',
      'communication_outbox','resources','work_item_resources',
      'tenant_project_type_overrides','tenant_method_overrides',
      'vendors','vendor_project_assignments','vendor_evaluations',
      'vendor_documents','compliance_tags','work_item_documents',
      'budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates',
      'work_item_cost_lines','dependencies',
      'tenant_ai_keys','tenant_ai_providers','tenant_ai_provider_priority',
      'tenant_ai_cost_caps',
      'tenant_memberships',
      'organization_units','locations',
      'stakeholder_interactions',
      'stakeholder_interaction_participants',
      'organization_imports',
      'releases'
    )
  );


-- ---------------------------------------------------------------------------
-- 5. Audit readability for release history
-- ---------------------------------------------------------------------------
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
as $func$
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
    when 'releases' then
      select project_id into v_project from public.releases where id = p_entity_id;
    when 'risks' then
      select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then
      select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then
      select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then
      select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'work_item_resources' then
      select project_id into v_project from public.work_item_resources where id = p_entity_id;
    when 'vendor_project_assignments' then
      select project_id into v_project from public.vendor_project_assignments where id = p_entity_id;
    when 'work_item_documents' then
      select wi.project_id into v_project
      from public.work_item_documents wid
      join public.work_items wi on wi.id = wid.work_item_id
      where wid.id = p_entity_id;
    when 'budget_categories' then
      select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then
      select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then
      select project_id into v_project from public.budget_postings where id = p_entity_id;
    when 'vendor_invoices' then
      select project_id into v_project from public.vendor_invoices where id = p_entity_id;
      if v_project is null then return false; end if;
    when 'resources' then return false;
    when 'tenant_project_type_overrides' then return false;
    when 'tenant_method_overrides' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    when 'vendors' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_evaluations' then return public.is_tenant_member(p_tenant_id);
    when 'vendor_documents' then return public.is_tenant_member(p_tenant_id);
    when 'compliance_tags' then return public.is_tenant_member(p_tenant_id);
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$func$;

revoke execute on function public.can_read_audit_entry(
  p_entity_type text,
  p_entity_id uuid,
  p_tenant_id uuid
) from public, anon, authenticated;

drop trigger if exists audit_changes_releases on public.releases;
create trigger audit_changes_releases
  after update on public.releases
  for each row execute function public.record_audit_changes();

revoke select on public.releases from anon;
