-- =============================================================================
-- PROJ-65 ε.1 — project_goals + work_item_compliance_lanes
-- =============================================================================
-- Backend foundation for the Trajectory Graph (PROJ-65 Tech Design Section B).
--
-- Locked decisions:
--   L2 — `project_goals` neue Tabelle (1..n pro Projekt) mit Source-Refs
--        auf phases/milestones + Self-FK parent_goal_id für Teilziele
--   L3 — `work_item_compliance_lanes` Bridge n:m für Sidetrack-Render
--   L6 — ON DELETE SET NULL für Goal-Source-Refs + Detached-Goal-State
--   L7 — Lane als Read-Model: Trigger-gepflegt aus work_item_tags ↔
--        compliance_tags (Tenant-Whitelist über tenant_settings.trajectory_lanes
--        bleibt deferred bis ε.1-Frontend)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. project_goals
-- ---------------------------------------------------------------------------
create table if not exists public.project_goals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  title               text not null,
  description         text,
  success_criteria    text,
  target_date         date,
  status              text not null default 'draft',
  -- Self-FK für Teilzielen-Hierarchie. Top-Goal hat parent_goal_id = null.
  -- ON DELETE SET NULL damit Teilziele bei Parent-Delete nicht verloren gehen.
  parent_goal_id      uuid references public.project_goals(id) on delete set null,
  -- Source-Refs (L6): goal kann aus phase/milestone abgeleitet sein, aber
  -- bleibt eigenständig pflegbar. Source-Delete → SET NULL (orphaned goal
  -- wird mit Detached-Badge in der UI markiert, nicht gelöscht).
  source_phase_id     uuid references public.phases(id) on delete set null,
  source_milestone_id uuid references public.milestones(id) on delete set null,
  sort_order          integer not null default 0,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint project_goals_status_check
    check (status in ('draft','active','achieved','abandoned')),
  constraint project_goals_title_length
    check (char_length(title) between 1 and 200),
  constraint project_goals_description_length
    check (description is null or char_length(description) <= 2000),
  constraint project_goals_success_criteria_length
    check (success_criteria is null or char_length(success_criteria) <= 2000),
  -- Avoid self-parent
  constraint project_goals_no_self_parent
    check (parent_goal_id is null or parent_goal_id <> id)
);

create index if not exists project_goals_tenant_project_idx
  on public.project_goals (tenant_id, project_id);
create index if not exists project_goals_project_sort_idx
  on public.project_goals (project_id, sort_order)
  where deleted_at is null;
create index if not exists project_goals_parent_idx
  on public.project_goals (parent_goal_id)
  where parent_goal_id is not null;
create index if not exists project_goals_source_phase_idx
  on public.project_goals (source_phase_id)
  where source_phase_id is not null;
create index if not exists project_goals_source_milestone_idx
  on public.project_goals (source_milestone_id)
  where source_milestone_id is not null;

alter table public.project_goals enable row level security;

create policy "project_goals_select_project_member"
  on public.project_goals
  for select using (public.is_project_member(project_id));
create policy "project_goals_insert_project_member"
  on public.project_goals
  for insert with check (public.is_project_member(project_id));
create policy "project_goals_update_project_member"
  on public.project_goals
  for update using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy "project_goals_delete_project_member"
  on public.project_goals
  for delete using (public.is_project_member(project_id));

create trigger project_goals_set_updated_at
  before update on public.project_goals
  for each row execute procedure extensions.moddatetime ('updated_at');

-- ---------------------------------------------------------------------------
-- 2. work_item_compliance_lanes (Bridge n:m, L3)
-- ---------------------------------------------------------------------------
-- Read-Model (L7): wird auto-gepflegt aus work_item_tags. Direkter
-- User-Edit ist via API-Layer untersagt; die Tabelle hat trotzdem reguläre
-- RLS-Policies damit der API-Layer (service-role oder member-write nach
-- Whitelist) konsistent operieren kann.
create table if not exists public.work_item_compliance_lanes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  work_item_id    uuid not null references public.work_items(id) on delete cascade,
  -- lane_key entspricht compliance_tags.key. Keine FK weil L7 erlaubt auch
  -- benutzerdefinierte Lanes (z.B. interne Compliance-Domänen ohne Tag).
  lane_key        text not null,
  display_label   text,
  -- Provenance: woher kommt diese Lane-Zuordnung? 'tag' = auto-sync aus
  -- work_item_tags, 'manual' = (zukünftig) direkter User-Edit.
  source_kind     text not null default 'tag',
  created_at      timestamptz not null default now(),
  constraint work_item_compliance_lanes_lane_key_length
    check (char_length(lane_key) between 1 and 100),
  constraint work_item_compliance_lanes_source_kind_check
    check (source_kind in ('tag','manual')),
  constraint work_item_compliance_lanes_unique
    unique (work_item_id, lane_key)
);

create index if not exists work_item_compliance_lanes_tenant_idx
  on public.work_item_compliance_lanes (tenant_id, lane_key);
create index if not exists work_item_compliance_lanes_work_item_idx
  on public.work_item_compliance_lanes (work_item_id);

alter table public.work_item_compliance_lanes enable row level security;

create policy "wicl_select_via_work_item"
  on public.work_item_compliance_lanes
  for select using (
    exists (
      select 1 from public.work_items wi
      where wi.id = work_item_id
        and public.is_project_member(wi.project_id)
    )
  );
-- INSERT/UPDATE/DELETE über Trigger gesteuert (security definer); reguläre
-- User-Writes für 'manual' source_kind sind in einer späteren Slice
-- vorgesehen, hier nur read-only via RLS für Member.

-- ---------------------------------------------------------------------------
-- 3. L7 Auto-Sync-Trigger: work_item_tags → work_item_compliance_lanes
-- ---------------------------------------------------------------------------
-- Pflanzt bei jedem work_item_tags INSERT eine Lane-Row mit lane_key =
-- compliance_tags.key. Bei DELETE wird die korrespondierende Lane-Row
-- entfernt (nur source_kind='tag', damit zukünftige manual-Lanes intakt
-- bleiben).
create or replace function public.tg_sync_work_item_compliance_lane_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_tag_key text;
  v_tag_label text;
begin
  if TG_OP = 'INSERT' then
    select key, display_name into v_tag_key, v_tag_label
    from public.compliance_tags
    where id = NEW.tag_id and is_active is true;
    if v_tag_key is not null then
      insert into public.work_item_compliance_lanes
        (tenant_id, work_item_id, lane_key, display_label, source_kind)
      values (NEW.tenant_id, NEW.work_item_id, v_tag_key, v_tag_label, 'tag')
      on conflict (work_item_id, lane_key) do nothing;
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    select key into v_tag_key
    from public.compliance_tags
    where id = OLD.tag_id;
    if v_tag_key is not null then
      delete from public.work_item_compliance_lanes
      where work_item_id = OLD.work_item_id
        and lane_key = v_tag_key
        and source_kind = 'tag';
    end if;
    return OLD;
  end if;
  return null;
end;
$$;

revoke execute on function public.tg_sync_work_item_compliance_lane_fn() from public;

drop trigger if exists work_item_tags_sync_lane on public.work_item_tags;
create trigger work_item_tags_sync_lane
  after insert or delete on public.work_item_tags
  for each row execute procedure public.tg_sync_work_item_compliance_lane_fn();

-- ---------------------------------------------------------------------------
-- 4. Backfill: existing work_item_tags → lanes
-- ---------------------------------------------------------------------------
insert into public.work_item_compliance_lanes
  (tenant_id, work_item_id, lane_key, display_label, source_kind)
select wt.tenant_id, wt.work_item_id, ct.key, ct.display_name, 'tag'
from public.work_item_tags wt
join public.compliance_tags ct on ct.id = wt.tag_id and ct.is_active is true
on conflict (work_item_id, lane_key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Audit-Tracked-Columns + audit_log_entity_type whitelist
-- ---------------------------------------------------------------------------
-- Take main's current whitelist (post-Assistant-MVP-deploy) and add the
-- two new entities. project_goals gets the user-visible-field set; lanes
-- are intentionally not in the audit whitelist (auto-managed by trigger).

create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin','is_approver','reasoning','stakeholder_type_key','management_level','decision_authority','attitude','conflict_potential','communication_need','preferred_channel','organization_unit_id']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','release_id']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings','assistant_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes','daily_rate_override','daily_rate_override_currency','organization_unit_id']
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
    when 'organization_units' then array['name','code','type','parent_id','location_id','description','is_active','sort_order','import_id']
    when 'locations' then array['name','code','country','city','address','is_active','import_id']
    when 'stakeholder_interactions' then array['summary','channel','direction','interaction_date','awaiting_response','response_due_date','response_received_date','replies_to_interaction_id','deleted_at']
    when 'stakeholder_interaction_participants' then array['participant_sentiment','participant_sentiment_source','participant_sentiment_model','participant_sentiment_provider','participant_sentiment_confidence','participant_cooperation_signal','participant_cooperation_signal_source']
    when 'releases' then array['name','description','start_date','end_date','status','target_milestone_id']
    when 'stakeholder_coaching_recommendations' then array['recommendation_text','modified_text','review_state','deleted_at']
    when 'project_goals' then array['title','description','success_criteria','target_date','status','parent_goal_id','source_phase_id','source_milestone_id','sort_order','deleted_at']
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;

-- audit_log_entries entity-type whitelist
alter table public.audit_log_entries drop constraint audit_log_entity_type_check;
alter table public.audit_log_entries
  add constraint audit_log_entity_type_check
  check (entity_type in (
    'stakeholders','work_items','phases','milestones','projects','risks',
    'decisions','open_items','tenants','tenant_settings',
    'communication_outbox','resources','work_item_resources',
    'tenant_project_type_overrides','tenant_method_overrides',
    'vendors','vendor_project_assignments','vendor_evaluations','vendor_documents',
    'compliance_tags','work_item_documents','budget_categories','budget_items',
    'budget_postings','vendor_invoices','report_snapshots',
    'role_rates','work_item_cost_lines','dependencies',
    'tenant_ai_keys','tenant_ai_providers','tenant_ai_provider_priority',
    'tenant_ai_cost_caps','tenant_memberships',
    'organization_units','locations',
    'stakeholder_interactions','stakeholder_interaction_participants',
    'organization_imports',
    'releases',
    'stakeholder_coaching_recommendations',
    'project_goals'
  ));

-- ---------------------------------------------------------------------------
-- 6. Audit trigger on project_goals
-- ---------------------------------------------------------------------------
drop trigger if exists project_goals_audit_update on public.project_goals;
create trigger project_goals_audit_update
  after update on public.project_goals
  for each row execute procedure public.record_audit_changes();
