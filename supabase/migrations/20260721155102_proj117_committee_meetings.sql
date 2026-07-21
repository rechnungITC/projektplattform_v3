-- PROJ-117 — Gremien- und Meeting-Verwaltung (EXTEND on PROJ-98 committees).
-- CIA GO-mit-ADJUST 2026-07-21. 5 new tables + confidentiality floor + audit
-- trio (rebuilt from LIVE defs, +authenticated grant re-granted) + RPCs. Writes
-- are RPC-only (SECURITY DEFINER, auth.uid()-only, anon-revoked). Child tables
-- inherit the committee-meeting confidentiality gate transitively via a bare
-- EXISTS(committee_meetings) subquery (RESTRICTIVE policy applies inside it —
-- mirror committee_members→committees). commit_meeting_minutes writes NEUTRAL
-- PROJ-20 decisions + PROJ-101 tasks; confidential minutes stay on the meeting.

-- ==========================================================================
-- 1) committee_meetings
-- ==========================================================================
create table if not exists public.committee_meetings (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,
  committee_id          uuid not null references public.committees(id) on delete cascade,
  title                 text not null,
  scheduled_at          timestamptz not null,
  ended_at              timestamptz,
  status                text not null default 'planned' check (status in ('planned','held','cancelled')),
  agenda                text,
  minutes               text,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  sort_order            integer not null default 0,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_committee_meetings_committee on public.committee_meetings (committee_id, scheduled_at);
create index if not exists idx_committee_meetings_project on public.committee_meetings (project_id);

-- confidentiality floor: meeting >= its committee; tenant/project must match.
create or replace function public.enforce_committee_meeting_confidentiality_floor()
 returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_tenant uuid; v_project uuid; v_level public.ma_confidentiality_level;
begin
  select tenant_id, project_id, confidentiality_level into v_tenant, v_project, v_level
    from public.committees where id = NEW.committee_id;
  if not found then raise exception 'committee not found' using errcode='23503'; end if;
  if NEW.tenant_id <> v_tenant or NEW.project_id <> v_project then
    raise exception 'meeting tenant/project must match its committee' using errcode='23514';
  end if;
  NEW.confidentiality_level := greatest(NEW.confidentiality_level, v_level);
  return NEW;
end;
$function$;

-- trigger-only function: not directly callable (project trigger-hardening pattern)
revoke all on function public.enforce_committee_meeting_confidentiality_floor() from public;
revoke all on function public.enforce_committee_meeting_confidentiality_floor() from anon;
revoke all on function public.enforce_committee_meeting_confidentiality_floor() from authenticated;

drop trigger if exists committee_meetings_confidentiality_floor on public.committee_meetings;
create trigger committee_meetings_confidentiality_floor
  before insert or update on public.committee_meetings
  for each row execute function public.enforce_committee_meeting_confidentiality_floor();

drop trigger if exists committee_meetings_set_updated_at on public.committee_meetings;
create trigger committee_meetings_set_updated_at
  before update on public.committee_meetings
  for each row execute function moddatetime('updated_at');

drop trigger if exists audit_changes_committee_meetings on public.committee_meetings;
create trigger audit_changes_committee_meetings
  after update on public.committee_meetings
  for each row execute function record_audit_changes();

alter table public.committee_meetings enable row level security;
drop policy if exists committee_meetings_select on public.committee_meetings;
create policy committee_meetings_select on public.committee_meetings
  for select using (public.is_project_member(project_id));
drop policy if exists committee_meetings_confidentiality_gate on public.committee_meetings;
create policy committee_meetings_confidentiality_gate on public.committee_meetings
  as restrictive for select
  using (public.can_access_classified(project_id, confidentiality_level));

-- ==========================================================================
-- 2) committee_meeting_attendees (stakeholder-centric, per-meeting attendance)
-- ==========================================================================
create table if not exists public.committee_meeting_attendees (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  meeting_id     uuid not null references public.committee_meetings(id) on delete cascade,
  stakeholder_id uuid not null references public.stakeholders(id) on delete cascade,
  attendance     text not null default 'present' check (attendance in ('present','absent','guest')),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  unique (meeting_id, stakeholder_id)
);
create index if not exists idx_cma_meeting on public.committee_meeting_attendees (meeting_id);

alter table public.committee_meeting_attendees enable row level security;
-- inherits the meeting gate transitively (RLS on committee_meetings applies
-- inside this EXISTS — mirror committee_members→committees).
drop policy if exists cma_select on public.committee_meeting_attendees;
create policy cma_select on public.committee_meeting_attendees
  for select using (exists (
    select 1 from public.committee_meetings m where m.id = meeting_id));

-- ==========================================================================
-- 3) committee_meeting_documents (pre-read / minutes LINKS — no binary store)
-- ==========================================================================
create table if not exists public.committee_meeting_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  meeting_id  uuid not null references public.committee_meetings(id) on delete cascade,
  label       text not null,
  url         text not null,
  kind        text not null default 'pre_read' check (kind in ('pre_read','minutes_attachment')),
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cmd_meeting on public.committee_meeting_documents (meeting_id);

alter table public.committee_meeting_documents enable row level security;
drop policy if exists cmd_select on public.committee_meeting_documents;
create policy cmd_select on public.committee_meeting_documents
  for select using (exists (
    select 1 from public.committee_meetings m where m.id = meeting_id));

-- ==========================================================================
-- 4) committee_meeting_outcomes (reverse-link: meeting → decision / task)
-- ==========================================================================
create table if not exists public.committee_meeting_outcomes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  meeting_id   uuid not null references public.committee_meetings(id) on delete cascade,
  outcome_type text not null check (outcome_type in ('decision','action')),
  decision_id  uuid references public.decisions(id) on delete set null,
  work_item_id uuid references public.work_items(id) on delete set null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  check ((outcome_type = 'decision' and decision_id is not null and work_item_id is null)
      or (outcome_type = 'action'   and work_item_id is not null and decision_id is null))
);
create index if not exists idx_cmo_meeting on public.committee_meeting_outcomes (meeting_id);

alter table public.committee_meeting_outcomes enable row level security;
drop policy if exists cmo_select on public.committee_meeting_outcomes;
create policy cmo_select on public.committee_meeting_outcomes
  for select using (exists (
    select 1 from public.committee_meetings m where m.id = meeting_id));

-- ==========================================================================
-- 5) committee_templates (tenant-admin catalog, AC1)
-- ==========================================================================
create table if not exists public.committee_templates (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  template_key          text not null,
  name                  text not null,
  purpose               text,
  cadence               text,
  default_confidentiality public.ma_confidentiality_level not null default 'standard',
  default_decision_scope  text,
  sort_order            integer not null default 0,
  is_active             boolean not null default true,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, template_key)
);

drop trigger if exists committee_templates_set_updated_at on public.committee_templates;
create trigger committee_templates_set_updated_at
  before update on public.committee_templates
  for each row execute function moddatetime('updated_at');

alter table public.committee_templates enable row level security;
drop policy if exists committee_templates_select on public.committee_templates;
create policy committee_templates_select on public.committee_templates
  for select using (public.is_tenant_member(tenant_id));

-- ==========================================================================
-- Audit wiring — CHECK + _tracked_audit_columns + can_read_audit_entry rebuilt
-- from LIVE defs (preserving document_tree_nodes/documents from PROJ-79) +
-- authenticated EXECUTE re-granted (PROJ-114 lesson). Confidential free-text
-- (title/agenda/minutes) is NOT audit-tracked — audit_log RLS is member-level.
-- ==========================================================================
alter table public.audit_log_entries drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log_entries add constraint audit_log_entity_type_check
  check (entity_type = any (array[
    'stakeholders','work_items','phases','milestones','projects','risks','decisions','open_items',
    'tenants','tenant_settings','communication_outbox','resources','work_item_resources',
    'tenant_project_type_overrides','tenant_method_overrides','vendors','vendor_project_assignments',
    'vendor_evaluations','vendor_documents','compliance_tags','work_item_documents','budget_categories',
    'budget_items','budget_postings','vendor_invoices','report_snapshots','role_rates','work_item_cost_lines',
    'dependencies','tenant_ai_keys','tenant_ai_providers','tenant_ai_provider_priority','tenant_ai_cost_caps',
    'tenant_memberships','organization_units','locations','stakeholder_interactions',
    'stakeholder_interaction_participants','organization_imports','releases',
    'stakeholder_coaching_recommendations','project_goals','sprints','risk_links',
    'ma_confidentiality_clearances','ma_clearance_profiles','ma_advisor_profiles','ma_ndas',
    'ma_nda_assignments','dd_streams','ma_clearance_grant_requests','ma_clearance_approval_policies',
    'raci_assignments','dd_questions','dd_findings','committees','committee_members','workstreams',
    'workstream_phases','deliverables','deliverable_documents','risk_categories','ma_stage_gates',
    'document_tree_nodes','documents',
    'committee_meetings','committee_meeting_attendees','committee_meeting_documents',
    'committee_meeting_outcomes','committee_templates'
  ]::text[]));

create or replace function public._tracked_audit_columns(p_table text)
 returns text[] language sql immutable security definer set search_path to 'public','pg_temp'
as $function$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin','is_approver','reasoning','stakeholder_type_key','management_level','decision_authority','attitude','conflict_potential','communication_need','preferred_channel','organization_unit_id']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','confidentiality_level']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number','confidentiality_level']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data','confidentiality_level']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id','category_id','confidentiality_level','workstream_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding','holiday_region']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
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
    when 'ma_clearance_profiles' then array['name','description','granted_level','is_active']
    when 'ma_advisor_profiles' then array['organization','advisor_type','mandate_start','mandate_end','mandate_status','responsible_user_id','scope']
    when 'ma_ndas' then array['counterparty','responsible_user_id','status','signed_date','valid_from','valid_until','scope_kind','scope_ref','covered_level','document_link','reminder_date']
    when 'ma_nda_assignments' then array['user_id','contact_name','contact_org']
    when 'dd_streams' then array['stream_key','label','stream_lead_user_id','status','planned_start','planned_end','scope','notes','confidentiality_level','phase_id','sort_order']
    when 'raci_assignments' then array['role_key','raci_letter']
    when 'dd_questions' then array['title','detail','addressee','priority','due_date','status','responsible_user_id','answer_text','answer_link','answered_by','answer_round','confidentiality_level']
    when 'dd_findings' then array['title','description','severity','economic_impact_eur','probability','recommended_treatment','status','linked_risk_id','responsible_user_id','confidentiality_level']
    when 'committees' then array['name','purpose','cadence','decision_scope','value_threshold_eur','value_threshold_currency','escalation_scope','confidentiality_level','sort_order']
    when 'committee_members' then array['stakeholder_id','role_in_committee','is_voting']
    when 'workstreams' then array['workstream_key','label','goal','lead_user_id','rag_status','scope','notes','confidentiality_level','sort_order']
    when 'deliverables' then array['name','description','phase_id','workstream_id','responsible_user_id','due_date','status','confidentiality_level','sort_order']
    when 'deliverable_documents' then array['title','url','tag_keys']
    when 'risk_categories' then array['key','label','applies_to_project_type','sort_order','is_active']
    when 'ma_stage_gates' then array['status','decision','decision_id','decided_by','decided_at','confidentiality_level']
    when 'document_tree_nodes' then array['name','parent_id','sort_order','deleted_at']
    when 'documents' then array['deleted_at','mime_unsupported_for_rag']
    when 'committee_meetings' then array['status','scheduled_at','ended_at','confidentiality_level','sort_order']
    when 'committee_meeting_attendees' then array['stakeholder_id','attendance']
    when 'committee_meeting_documents' then array['label','url','kind']
    when 'committee_templates' then array['name','purpose','cadence','default_confidentiality','default_decision_scope','sort_order','is_active']
    else array[]::text[]
  end
$function$;

create or replace function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
 returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_project uuid;
begin
  if public.is_tenant_admin(p_tenant_id) then return true; end if;
  case p_entity_type
    when 'projects' then v_project := p_entity_id;
    when 'stakeholders' then select project_id into v_project from public.stakeholders where id = p_entity_id;
    when 'work_items' then select project_id into v_project from public.work_items where id = p_entity_id;
    when 'phases' then select project_id into v_project from public.phases where id = p_entity_id;
    when 'milestones' then select project_id into v_project from public.milestones where id = p_entity_id;
    when 'releases' then select project_id into v_project from public.releases where id = p_entity_id;
    when 'risks' then select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'work_item_resources' then select project_id into v_project from public.work_item_resources where id = p_entity_id;
    when 'vendor_project_assignments' then select project_id into v_project from public.vendor_project_assignments where id = p_entity_id;
    when 'work_item_documents' then
      select wi.project_id into v_project from public.work_item_documents wid
      join public.work_items wi on wi.id = wid.work_item_id where wid.id = p_entity_id;
    when 'budget_categories' then select project_id into v_project from public.budget_categories where id = p_entity_id;
    when 'budget_items' then select project_id into v_project from public.budget_items where id = p_entity_id;
    when 'budget_postings' then select project_id into v_project from public.budget_postings where id = p_entity_id;
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
    when 'risk_categories' then return public.is_tenant_member(p_tenant_id);
    when 'sprints' then select project_id into v_project from public.sprints where id = p_entity_id;
    when 'ma_project_profiles' then select project_id into v_project from public.ma_project_profiles where id = p_entity_id;
    when 'ma_advisor_profiles' then select project_id into v_project from public.ma_advisor_profiles where id = p_entity_id;
    when 'ma_ndas' then select project_id into v_project from public.ma_ndas where id = p_entity_id;
    when 'dd_streams' then select project_id into v_project from public.dd_streams where id = p_entity_id;
    when 'raci_assignments' then select project_id into v_project from public.raci_assignments where id = p_entity_id;
    when 'dd_questions' then select project_id into v_project from public.dd_questions where id = p_entity_id;
    when 'dd_findings' then select project_id into v_project from public.dd_findings where id = p_entity_id;
    when 'committees' then select project_id into v_project from public.committees where id = p_entity_id;
    when 'committee_members' then
      select c.project_id into v_project from public.committee_members m
      join public.committees c on c.id = m.committee_id where m.id = p_entity_id;
    when 'workstreams' then select project_id into v_project from public.workstreams where id = p_entity_id;
    when 'deliverables' then select project_id into v_project from public.deliverables where id = p_entity_id;
    when 'deliverable_documents' then
      select d.project_id into v_project from public.deliverable_documents dd
      join public.deliverables d on d.id = dd.deliverable_id where dd.id = p_entity_id;
    when 'ma_stage_gates' then select project_id into v_project from public.ma_stage_gates where id = p_entity_id;
    when 'document_tree_nodes' then select project_id into v_project from public.document_tree_nodes where id = p_entity_id;
    when 'documents' then
      select n.project_id into v_project from public.documents dd
      join public.document_tree_nodes n on n.id = dd.tree_node_id where dd.id = p_entity_id;
    when 'committee_meetings' then select project_id into v_project from public.committee_meetings where id = p_entity_id;
    when 'committee_meeting_attendees' then
      select m.project_id into v_project from public.committee_meeting_attendees a
      join public.committee_meetings m on m.id = a.meeting_id where a.id = p_entity_id;
    when 'committee_meeting_documents' then
      select m.project_id into v_project from public.committee_meeting_documents d
      join public.committee_meetings m on m.id = d.meeting_id where d.id = p_entity_id;
    when 'committee_templates' then return public.is_tenant_member(p_tenant_id);
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$function$;

grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;
grant execute on function public._tracked_audit_columns(text) to authenticated;

-- ==========================================================================
-- RPCs — meeting CRUD (SECURITY DEFINER, auth.uid()-only, anon-revoked)
-- ==========================================================================
create or replace function public._committee_authority(p_committee_id uuid,
  out v_tenant uuid, out v_project uuid, out v_level public.ma_confidentiality_level)
 language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id, confidentiality_level into v_tenant, v_project, v_level
    from public.committees where id = p_committee_id;
  if v_tenant is null then raise exception 'committee not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for committee meetings' using errcode='42501';
  end if;
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'insufficient clearance' using errcode='42501';
  end if;
end;
$function$;
revoke all on function public._committee_authority(uuid) from public, anon;

create or replace function public.create_committee_meeting(
  p_committee_id uuid, p_title text, p_scheduled_at timestamptz,
  p_agenda text default null, p_confidentiality_level public.ma_confidentiality_level default null)
 returns public.committee_meetings language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_tenant uuid; v_project uuid; v_level public.ma_confidentiality_level; v_row public.committee_meetings;
begin
  select a.v_tenant, a.v_project, a.v_level into v_tenant, v_project, v_level
    from public._committee_authority(p_committee_id) a;
  if length(btrim(coalesce(p_title,''))) = 0 then raise exception 'title required' using errcode='22023'; end if;
  if p_confidentiality_level is not null and not public.can_access_classified(v_project, p_confidentiality_level) then
    raise exception 'insufficient clearance for confidentiality level' using errcode='42501';
  end if;
  insert into public.committee_meetings (tenant_id, project_id, committee_id, title, scheduled_at, agenda, confidentiality_level, created_by)
  values (v_tenant, v_project, p_committee_id, btrim(p_title), p_scheduled_at, p_agenda,
          coalesce(p_confidentiality_level, 'standard'), auth.uid())
  returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.create_committee_meeting(uuid,text,timestamptz,text,public.ma_confidentiality_level) from public, anon;
grant execute on function public.create_committee_meeting(uuid,text,timestamptz,text,public.ma_confidentiality_level) to authenticated;

create or replace function public.update_committee_meeting(
  p_meeting_id uuid, p_title text default null, p_scheduled_at timestamptz default null,
  p_ended_at timestamptz default null, p_status text default null,
  p_agenda text default null, p_minutes text default null)
 returns public.committee_meetings language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_committee uuid; v_tenant uuid; v_project uuid; v_level public.ma_confidentiality_level; v_row public.committee_meetings;
begin
  select committee_id into v_committee from public.committee_meetings where id = p_meeting_id;
  if v_committee is null then raise exception 'meeting not found' using errcode='P0002'; end if;
  select a.v_tenant, a.v_project, a.v_level into v_tenant, v_project, v_level
    from public._committee_authority(v_committee) a;
  if p_status is not null and p_status not in ('planned','held','cancelled') then
    raise exception 'invalid status' using errcode='22023';
  end if;
  update public.committee_meetings set
    title = coalesce(nullif(btrim(p_title),''), title),
    scheduled_at = coalesce(p_scheduled_at, scheduled_at),
    ended_at = coalesce(p_ended_at, ended_at),
    status = coalesce(p_status, status),
    agenda = coalesce(p_agenda, agenda),
    minutes = coalesce(p_minutes, minutes)
  where id = p_meeting_id returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.update_committee_meeting(uuid,text,timestamptz,timestamptz,text,text,text) from public, anon;
grant execute on function public.update_committee_meeting(uuid,text,timestamptz,timestamptz,text,text,text) to authenticated;

create or replace function public.delete_committee_meeting(p_meeting_id uuid)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_committee uuid;
begin
  select committee_id into v_committee from public.committee_meetings where id = p_meeting_id;
  if v_committee is null then raise exception 'meeting not found' using errcode='P0002'; end if;
  perform public._committee_authority(v_committee);
  delete from public.committee_meetings where id = p_meeting_id;
end;
$function$;
revoke all on function public.delete_committee_meeting(uuid) from public, anon;
grant execute on function public.delete_committee_meeting(uuid) to authenticated;

-- attendees ----------------------------------------------------------------
create or replace function public.set_meeting_attendee(
  p_meeting_id uuid, p_stakeholder_id uuid, p_attendance text default 'present')
 returns public.committee_meeting_attendees language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_committee uuid; v_tenant uuid; v_project uuid; v_level public.ma_confidentiality_level; v_row public.committee_meeting_attendees;
begin
  select committee_id into v_committee from public.committee_meetings where id = p_meeting_id;
  if v_committee is null then raise exception 'meeting not found' using errcode='P0002'; end if;
  select a.v_tenant, a.v_project, a.v_level into v_tenant, v_project, v_level
    from public._committee_authority(v_committee) a;
  if p_attendance not in ('present','absent','guest') then raise exception 'invalid attendance' using errcode='22023'; end if;
  if not exists (select 1 from public.stakeholders s where s.id = p_stakeholder_id and s.project_id = v_project) then
    raise exception 'stakeholder not in this project' using errcode='23503';
  end if;
  insert into public.committee_meeting_attendees (tenant_id, meeting_id, stakeholder_id, attendance, created_by)
  values (v_tenant, p_meeting_id, p_stakeholder_id, p_attendance, auth.uid())
  on conflict (meeting_id, stakeholder_id) do update set attendance = excluded.attendance
  returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.set_meeting_attendee(uuid,uuid,text) from public, anon;
grant execute on function public.set_meeting_attendee(uuid,uuid,text) to authenticated;

create or replace function public.remove_meeting_attendee(p_attendee_id uuid)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_committee uuid;
begin
  select m.committee_id into v_committee from public.committee_meeting_attendees a
    join public.committee_meetings m on m.id = a.meeting_id where a.id = p_attendee_id;
  if v_committee is null then raise exception 'attendee not found' using errcode='P0002'; end if;
  perform public._committee_authority(v_committee);
  delete from public.committee_meeting_attendees where id = p_attendee_id;
end;
$function$;
revoke all on function public.remove_meeting_attendee(uuid) from public, anon;
grant execute on function public.remove_meeting_attendee(uuid) to authenticated;

-- documents ----------------------------------------------------------------
create or replace function public.add_meeting_document(
  p_meeting_id uuid, p_label text, p_url text, p_kind text default 'pre_read')
 returns public.committee_meeting_documents language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_committee uuid; v_tenant uuid; v_project uuid; v_level public.ma_confidentiality_level; v_row public.committee_meeting_documents;
begin
  select committee_id into v_committee from public.committee_meetings where id = p_meeting_id;
  if v_committee is null then raise exception 'meeting not found' using errcode='P0002'; end if;
  select a.v_tenant, a.v_project, a.v_level into v_tenant, v_project, v_level
    from public._committee_authority(v_committee) a;
  if p_kind not in ('pre_read','minutes_attachment') then raise exception 'invalid kind' using errcode='22023'; end if;
  if length(btrim(coalesce(p_label,'')))=0 or length(btrim(coalesce(p_url,'')))=0 then
    raise exception 'label and url required' using errcode='22023';
  end if;
  insert into public.committee_meeting_documents (tenant_id, meeting_id, label, url, kind, created_by)
  values (v_tenant, p_meeting_id, btrim(p_label), btrim(p_url), p_kind, auth.uid())
  returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.add_meeting_document(uuid,text,text,text) from public, anon;
grant execute on function public.add_meeting_document(uuid,text,text,text) to authenticated;

create or replace function public.remove_meeting_document(p_document_id uuid)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_committee uuid;
begin
  select m.committee_id into v_committee from public.committee_meeting_documents d
    join public.committee_meetings m on m.id = d.meeting_id where d.id = p_document_id;
  if v_committee is null then raise exception 'document not found' using errcode='P0002'; end if;
  perform public._committee_authority(v_committee);
  delete from public.committee_meeting_documents where id = p_document_id;
end;
$function$;
revoke all on function public.remove_meeting_document(uuid) from public, anon;
grant execute on function public.remove_meeting_document(uuid) to authenticated;

-- ==========================================================================
-- commit_meeting_minutes — the AC3 atomic RPC (RLS-bypass contract H5)
-- ==========================================================================
create or replace function public.commit_meeting_minutes(
  p_meeting_id uuid, p_decisions jsonb default '[]'::jsonb, p_actions jsonb default '[]'::jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  v_committee uuid; v_tenant uuid; v_project uuid; v_level public.ma_confidentiality_level;
  v_dec int := 0; v_act int := 0; v_elem jsonb; v_decision_id uuid; v_wi_id uuid; v_title text;
begin
  select committee_id into v_committee from public.committee_meetings where id = p_meeting_id;
  if v_committee is null then raise exception 'meeting not found' using errcode='P0002'; end if;
  -- Explicit authority + clearance (DEFINER bypasses RLS — H5).
  select a.v_tenant, a.v_project, a.v_level into v_tenant, v_project, v_level
    from public._committee_authority(v_committee) a;

  -- decisions → NEUTRAL PROJ-20 rows (no confidential minutes text)
  for v_elem in select * from jsonb_array_elements(coalesce(p_decisions,'[]'::jsonb)) loop
    v_title := btrim(coalesce(v_elem->>'title',''));
    if v_title = '' then raise exception 'decision title required' using errcode='22023'; end if;
    insert into public.decisions (tenant_id, project_id, title, decision_text, decided_at, created_by)
    values (v_tenant, v_project, v_title,
            coalesce(nullif(btrim(v_elem->>'decision_text'),''), v_title), now(), v_caller)
    returning id into v_decision_id;
    insert into public.committee_meeting_outcomes (tenant_id, meeting_id, outcome_type, decision_id, created_by)
    values (v_tenant, p_meeting_id, 'decision', v_decision_id, v_caller);
    v_dec := v_dec + 1;
  end loop;

  -- actions → PROJ-101 work_items kind='task' (all invariants set explicitly — H5)
  for v_elem in select * from jsonb_array_elements(coalesce(p_actions,'[]'::jsonb)) loop
    v_title := btrim(coalesce(v_elem->>'title',''));
    if v_title = '' then raise exception 'action title required' using errcode='22023'; end if;
    insert into public.work_items (tenant_id, project_id, kind, title, status, created_by,
                                   responsible_user_id, due_date, phase_id, workstream_id, attributes)
    values (v_tenant, v_project, 'task', v_title, 'todo', v_caller,
            nullif(v_elem->>'responsible_user_id','')::uuid,
            nullif(v_elem->>'due_date','')::date,
            nullif(v_elem->>'phase_id','')::uuid,
            nullif(v_elem->>'workstream_id','')::uuid,
            jsonb_build_object('source_meeting_id', p_meeting_id))
    returning id into v_wi_id;
    insert into public.committee_meeting_outcomes (tenant_id, meeting_id, outcome_type, work_item_id, created_by)
    values (v_tenant, p_meeting_id, 'action', v_wi_id, v_caller);
    v_act := v_act + 1;
  end loop;

  return jsonb_build_object('decisions_created', v_dec, 'actions_created', v_act);
end;
$function$;
revoke all on function public.commit_meeting_minutes(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.commit_meeting_minutes(uuid,jsonb,jsonb) to authenticated;

-- ==========================================================================
-- Templates (AC1) — lazy-seed 6 standard types + create-from-template + custom
-- ==========================================================================
create or replace function public.seed_committee_templates(p_tenant_id uuid)
 returns integer language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_seeded int := 0;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.is_tenant_admin(p_tenant_id) then raise exception 'tenant admin required' using errcode='42501'; end if;
  with preset(k,nm,pp,cad,so) as (values
    ('deal_core_team','Deal Core Team','Operative Deal-Steuerung','weekly',1),
    ('workstream','Workstream Meeting','Workstream-Fortschritt & Blocker','weekly',2),
    ('steering','Steering Committee','Strategische Steuerung & Freigaben','biweekly',3),
    ('red_flag_review','Red-Flag-Review','Review kritischer DD-Findings','ad_hoc',4),
    ('integration_readiness','Integration Readiness Review','Day-1-/PMI-Bereitschaft','monthly',5),
    ('synergy_review','Synergy Review','Synergie-Tracking & Wertrealisierung','monthly',6)),
  ins as (
    insert into public.committee_templates (tenant_id, template_key, name, purpose, cadence, sort_order, created_by)
    select p_tenant_id, k, nm, pp, cad, so, v_caller from preset pr
    where not exists (select 1 from public.committee_templates t where t.tenant_id=p_tenant_id and t.template_key=pr.k)
    returning 1)
  select count(*) into v_seeded from ins;
  return v_seeded;
end;
$function$;
revoke all on function public.seed_committee_templates(uuid) from public, anon;
grant execute on function public.seed_committee_templates(uuid) to authenticated;

create or replace function public.create_committee_template(
  p_tenant_id uuid, p_template_key text, p_name text, p_purpose text default null,
  p_cadence text default null, p_default_confidentiality public.ma_confidentiality_level default 'standard',
  p_default_decision_scope text default null)
 returns public.committee_templates language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_row public.committee_templates;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.is_tenant_admin(p_tenant_id) then raise exception 'tenant admin required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_name,'')))=0 or length(btrim(coalesce(p_template_key,'')))=0 then
    raise exception 'template_key and name required' using errcode='22023';
  end if;
  insert into public.committee_templates (tenant_id, template_key, name, purpose, cadence, default_confidentiality, default_decision_scope, created_by)
  values (p_tenant_id, btrim(p_template_key), btrim(p_name), p_purpose, p_cadence, coalesce(p_default_confidentiality,'standard'), p_default_decision_scope, auth.uid())
  returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.create_committee_template(uuid,text,text,text,text,public.ma_confidentiality_level,text) from public, anon;
grant execute on function public.create_committee_template(uuid,text,text,text,text,public.ma_confidentiality_level,text) to authenticated;

create or replace function public.create_committee_from_template(p_project_id uuid, p_template_id uuid)
 returns public.committees language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_tenant uuid; v_t public.committee_templates; v_row public.committees;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then raise exception 'project not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'insufficient role' using errcode='42501';
  end if;
  select * into v_t from public.committee_templates where id = p_template_id and tenant_id = v_tenant;
  if v_t.id is null then raise exception 'template not found in tenant' using errcode='P0002'; end if;
  if not public.can_access_classified(p_project_id, v_t.default_confidentiality) then
    raise exception 'insufficient clearance' using errcode='42501';
  end if;
  insert into public.committees (tenant_id, project_id, name, purpose, cadence, decision_scope, confidentiality_level, created_by)
  values (v_tenant, p_project_id, v_t.name, v_t.purpose, v_t.cadence, v_t.default_decision_scope, v_t.default_confidentiality, v_caller)
  returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.create_committee_from_template(uuid,uuid) from public, anon;
grant execute on function public.create_committee_from_template(uuid,uuid) to authenticated;
