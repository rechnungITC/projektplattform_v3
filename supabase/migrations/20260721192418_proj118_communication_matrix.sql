-- PROJ-118 — Kommunikationsmatrix (EXTEND, PROJ-117 pattern). CIA GO-mit-ADJUST.
-- 2 tables (communication_templates + communication_matrix_entries) + confirm-
-- gated single-approver workflow with hard SoD + need-to-know (no floor: entry
-- hangs on the project directly) + audit trio rebuilt from LIVE (+authenticated
-- grant re-granted, entity_type CHECK in same migration). Writes RPC-only
-- (SECURITY DEFINER, auth.uid()-only, anon-revoked). No new dep.
-- moddatetime is schema-qualified (extensions.moddatetime).

-- ==========================================================================
-- 1) communication_templates (tenant catalogue, mirror committee_templates)
-- ==========================================================================
create table if not exists public.communication_templates (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  template_key            text not null,
  name                    text not null,
  default_target_group_key text,
  default_channel         text,
  default_confidentiality public.ma_confidentiality_level not null default 'standard',
  body_skeleton           text,
  sort_order              integer not null default 0,
  is_active               boolean not null default true,
  created_by              uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (tenant_id, template_key)
);
drop trigger if exists communication_templates_set_updated_at on public.communication_templates;
create trigger communication_templates_set_updated_at
  before update on public.communication_templates
  for each row execute function extensions.moddatetime('updated_at');
alter table public.communication_templates enable row level security;
drop policy if exists communication_templates_select on public.communication_templates;
create policy communication_templates_select on public.communication_templates
  for select using (public.is_tenant_member(tenant_id));

-- ==========================================================================
-- 2) communication_matrix_entries (project-scoped planning/governance)
-- ==========================================================================
create table if not exists public.communication_matrix_entries (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,
  target_group_key      text not null,
  target_group_label    text,
  message               text,
  channel               text,
  planned_date          date,
  actual_date           date,
  responsible_user_id   uuid references auth.users(id),
  approver_user_id      uuid references auth.users(id),
  approval_status       text not null default 'draft'
                          check (approval_status in ('draft','pending_approval','approved','sent','rejected')),
  approved_at           timestamptz,
  rejection_reason      text,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  template_id           uuid references public.communication_templates(id) on delete set null,
  phase_id              uuid references public.phases(id) on delete set null,
  stage_gate_id         uuid references public.ma_stage_gates(id) on delete set null,
  work_item_id          uuid references public.work_items(id) on delete set null,
  sort_order            integer not null default 0,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_comm_entries_project on public.communication_matrix_entries (project_id, sort_order);
create index if not exists idx_comm_entries_phase on public.communication_matrix_entries (phase_id) where phase_id is not null;
create index if not exists idx_comm_entries_gate on public.communication_matrix_entries (stage_gate_id) where stage_gate_id is not null;
create index if not exists idx_comm_entries_work_item on public.communication_matrix_entries (work_item_id) where work_item_id is not null;

drop trigger if exists communication_matrix_entries_set_updated_at on public.communication_matrix_entries;
create trigger communication_matrix_entries_set_updated_at
  before update on public.communication_matrix_entries
  for each row execute function extensions.moddatetime('updated_at');
drop trigger if exists audit_changes_communication_matrix_entries on public.communication_matrix_entries;
create trigger audit_changes_communication_matrix_entries
  after update on public.communication_matrix_entries
  for each row execute function record_audit_changes();

alter table public.communication_matrix_entries enable row level security;
drop policy if exists comm_entries_select on public.communication_matrix_entries;
create policy comm_entries_select on public.communication_matrix_entries
  for select using (public.is_project_member(project_id));
drop policy if exists comm_entries_confidentiality_gate on public.communication_matrix_entries;
create policy comm_entries_confidentiality_gate on public.communication_matrix_entries
  as restrictive for select
  using (public.can_access_classified(project_id, confidentiality_level));

-- ==========================================================================
-- Audit wiring (rebuilt from LIVE defs + authenticated grant re-granted)
-- Content fields (message / rejection_reason / target_group_label) are NOT
-- audit-tracked (audit_log is member-level). Approval facts ARE tracked (L3).
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
    'document_tree_nodes','documents','committee_meetings','committee_meeting_attendees',
    'committee_meeting_documents','committee_meeting_outcomes','committee_templates',
    'communication_matrix_entries','communication_templates'
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
    when 'communication_matrix_entries' then array['target_group_key','channel','planned_date','actual_date','responsible_user_id','approver_user_id','approval_status','approved_at','confidentiality_level','phase_id','stage_gate_id','work_item_id','sort_order']
    when 'communication_templates' then array['name','default_target_group_key','default_channel','default_confidentiality','sort_order','is_active']
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
    when 'communication_matrix_entries' then select project_id into v_project from public.communication_matrix_entries where id = p_entity_id;
    when 'communication_templates' then return public.is_tenant_member(p_tenant_id);
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$function$;

grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;
grant execute on function public._tracked_audit_columns(text) to authenticated;

-- ==========================================================================
-- RPCs — manager authority helper (admin OR project lead + clearance)
-- ==========================================================================
create or replace function public._comm_project_authority(p_project_id uuid, p_level public.ma_confidentiality_level,
  out v_tenant uuid)
 language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid();
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then raise exception 'project not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'insufficient role for communication matrix' using errcode='42501';
  end if;
  if not public.can_access_classified(p_project_id, coalesce(p_level,'standard')) then
    raise exception 'insufficient clearance' using errcode='42501';
  end if;
end;
$function$;
revoke all on function public._comm_project_authority(uuid, public.ma_confidentiality_level) from public;
revoke all on function public._comm_project_authority(uuid, public.ma_confidentiality_level) from anon;

-- validate optional links belong to the same project
create or replace function public._comm_validate_links(p_project_id uuid, p_phase_id uuid, p_stage_gate_id uuid, p_work_item_id uuid, p_template_id uuid, p_tenant uuid)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
  if p_phase_id is not null and not exists (select 1 from public.phases where id=p_phase_id and project_id=p_project_id) then
    raise exception 'phase not in project' using errcode='23503'; end if;
  if p_stage_gate_id is not null and not exists (select 1 from public.ma_stage_gates where id=p_stage_gate_id and project_id=p_project_id) then
    raise exception 'stage gate not in project' using errcode='23503'; end if;
  if p_work_item_id is not null and not exists (select 1 from public.work_items where id=p_work_item_id and project_id=p_project_id) then
    raise exception 'work item not in project' using errcode='23503'; end if;
  if p_template_id is not null and not exists (select 1 from public.communication_templates where id=p_template_id and tenant_id=p_tenant) then
    raise exception 'template not in tenant' using errcode='23503'; end if;
end;
$function$;
revoke all on function public._comm_validate_links(uuid,uuid,uuid,uuid,uuid,uuid) from public;
revoke all on function public._comm_validate_links(uuid,uuid,uuid,uuid,uuid,uuid) from anon;

create or replace function public.create_communication_entry(
  p_project_id uuid, p_target_group_key text, p_message text default null, p_channel text default null,
  p_planned_date date default null, p_responsible_user_id uuid default null, p_approver_user_id uuid default null,
  p_confidentiality_level public.ma_confidentiality_level default 'standard', p_target_group_label text default null,
  p_template_id uuid default null, p_phase_id uuid default null, p_stage_gate_id uuid default null, p_work_item_id uuid default null)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_tenant uuid; v_row public.communication_matrix_entries;
begin
  select a.v_tenant into v_tenant from public._comm_project_authority(p_project_id, p_confidentiality_level) a;
  if length(btrim(coalesce(p_target_group_key,'')))=0 then raise exception 'target_group_key required' using errcode='22023'; end if;
  perform public._comm_validate_links(p_project_id, p_phase_id, p_stage_gate_id, p_work_item_id, p_template_id, v_tenant);
  insert into public.communication_matrix_entries
    (tenant_id, project_id, target_group_key, target_group_label, message, channel, planned_date,
     responsible_user_id, approver_user_id, confidentiality_level, template_id, phase_id, stage_gate_id, work_item_id, created_by)
  values (v_tenant, p_project_id, btrim(p_target_group_key), p_target_group_label, p_message, p_channel, p_planned_date,
     p_responsible_user_id, p_approver_user_id, coalesce(p_confidentiality_level,'standard'), p_template_id, p_phase_id, p_stage_gate_id, p_work_item_id, auth.uid())
  returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.create_communication_entry(uuid,text,text,text,date,uuid,uuid,public.ma_confidentiality_level,text,uuid,uuid,uuid,uuid) from public;
revoke all on function public.create_communication_entry(uuid,text,text,text,date,uuid,uuid,public.ma_confidentiality_level,text,uuid,uuid,uuid,uuid) from anon;
grant execute on function public.create_communication_entry(uuid,text,text,text,date,uuid,uuid,public.ma_confidentiality_level,text,uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.update_communication_entry(
  p_entry_id uuid, p_target_group_key text default null, p_message text default null, p_channel text default null,
  p_planned_date date default null, p_responsible_user_id uuid default null, p_approver_user_id uuid default null,
  p_confidentiality_level public.ma_confidentiality_level default null, p_target_group_label text default null,
  p_phase_id uuid default null, p_stage_gate_id uuid default null, p_work_item_id uuid default null)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_project uuid; v_tenant uuid; v_status text; v_row public.communication_matrix_entries;
begin
  select project_id, approval_status into v_project, v_status from public.communication_matrix_entries where id=p_entry_id;
  if v_project is null then raise exception 'entry not found' using errcode='P0002'; end if;
  select a.v_tenant into v_tenant from public._comm_project_authority(v_project, coalesce(p_confidentiality_level,'standard')) a;
  if v_status = 'sent' then raise exception 'sent entries are immutable' using errcode='23514'; end if;
  perform public._comm_validate_links(v_project, p_phase_id, p_stage_gate_id, p_work_item_id, null, v_tenant);
  update public.communication_matrix_entries set
    target_group_key = coalesce(nullif(btrim(p_target_group_key),''), target_group_key),
    target_group_label = coalesce(p_target_group_label, target_group_label),
    message = coalesce(p_message, message),
    channel = coalesce(p_channel, channel),
    planned_date = coalesce(p_planned_date, planned_date),
    responsible_user_id = coalesce(p_responsible_user_id, responsible_user_id),
    approver_user_id = coalesce(p_approver_user_id, approver_user_id),
    confidentiality_level = coalesce(p_confidentiality_level, confidentiality_level),
    phase_id = coalesce(p_phase_id, phase_id),
    stage_gate_id = coalesce(p_stage_gate_id, stage_gate_id),
    work_item_id = coalesce(p_work_item_id, work_item_id)
  where id=p_entry_id returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.update_communication_entry(uuid,text,text,text,date,uuid,uuid,public.ma_confidentiality_level,text,uuid,uuid,uuid) from public;
revoke all on function public.update_communication_entry(uuid,text,text,text,date,uuid,uuid,public.ma_confidentiality_level,text,uuid,uuid,uuid) from anon;
grant execute on function public.update_communication_entry(uuid,text,text,text,date,uuid,uuid,public.ma_confidentiality_level,text,uuid,uuid,uuid) to authenticated;

create or replace function public.delete_communication_entry(p_entry_id uuid)
 returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_project uuid;
begin
  select project_id into v_project from public.communication_matrix_entries where id=p_entry_id;
  if v_project is null then raise exception 'entry not found' using errcode='P0002'; end if;
  perform public._comm_project_authority(v_project, 'standard');
  delete from public.communication_matrix_entries where id=p_entry_id;
end;
$function$;
revoke all on function public.delete_communication_entry(uuid) from public;
revoke all on function public.delete_communication_entry(uuid) from anon;
grant execute on function public.delete_communication_entry(uuid) to authenticated;

-- submit: draft/rejected -> pending_approval (responsible OR manager)
create or replace function public.submit_communication_entry(p_entry_id uuid)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_project uuid; v_tenant uuid; v_status text; v_resp uuid; v_appr uuid; v_row public.communication_matrix_entries;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select project_id, tenant_id, approval_status, responsible_user_id, approver_user_id
    into v_project, v_tenant, v_status, v_resp, v_appr from public.communication_matrix_entries where id=p_entry_id;
  if v_project is null then raise exception 'entry not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project) or v_caller = v_resp) then
    raise exception 'only the responsible person or a manager can submit' using errcode='42501';
  end if;
  if v_status not in ('draft','rejected') then raise exception 'can only submit a draft/rejected entry' using errcode='23514'; end if;
  if v_appr is null then raise exception 'an approver must be assigned before submitting' using errcode='22023'; end if;
  update public.communication_matrix_entries set approval_status='pending_approval', rejection_reason=null where id=p_entry_id returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.submit_communication_entry(uuid) from public;
revoke all on function public.submit_communication_entry(uuid) from anon;
grant execute on function public.submit_communication_entry(uuid) to authenticated;

-- respond: pending_approval -> approved/rejected. SoD: caller = approver, approver <> responsible
create or replace function public.respond_communication_approval(p_entry_id uuid, p_approved boolean, p_reason text default null)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_status text; v_resp uuid; v_appr uuid; v_row public.communication_matrix_entries;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select approval_status, responsible_user_id, approver_user_id into v_status, v_resp, v_appr
    from public.communication_matrix_entries where id=p_entry_id;
  if v_appr is null then raise exception 'entry not found' using errcode='P0002'; end if;
  if v_status <> 'pending_approval' then raise exception 'entry is not pending approval' using errcode='23514'; end if;
  if v_caller <> v_appr then raise exception 'only the assigned approver can respond' using errcode='42501'; end if;
  if v_appr = v_resp then raise exception 'approver must differ from the responsible person (SoD)' using errcode='42501'; end if;
  if p_approved then
    update public.communication_matrix_entries set approval_status='approved', approved_at=now(), rejection_reason=null where id=p_entry_id returning * into v_row;
  else
    update public.communication_matrix_entries set approval_status='rejected', rejection_reason=nullif(btrim(p_reason),''), approved_at=null where id=p_entry_id returning * into v_row;
  end if;
  return v_row;
end;
$function$;
revoke all on function public.respond_communication_approval(uuid,boolean,text) from public;
revoke all on function public.respond_communication_approval(uuid,boolean,text) from anon;
grant execute on function public.respond_communication_approval(uuid,boolean,text) to authenticated;

-- mark sent: approved -> sent (documentary; manager). sets actual_date if null.
create or replace function public.mark_communication_sent(p_entry_id uuid)
 returns public.communication_matrix_entries language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_project uuid; v_status text; v_row public.communication_matrix_entries;
begin
  select project_id, approval_status into v_project, v_status from public.communication_matrix_entries where id=p_entry_id;
  if v_project is null then raise exception 'entry not found' using errcode='P0002'; end if;
  perform public._comm_project_authority(v_project, 'standard');
  if v_status <> 'approved' then raise exception 'only an approved entry can be marked sent' using errcode='23514'; end if;
  update public.communication_matrix_entries set approval_status='sent', actual_date=coalesce(actual_date, current_date) where id=p_entry_id returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.mark_communication_sent(uuid) from public;
revoke all on function public.mark_communication_sent(uuid) from anon;
grant execute on function public.mark_communication_sent(uuid) to authenticated;

-- ==========================================================================
-- Templates (AC5) — lazy-seed 4 standard blocks + custom create
-- ==========================================================================
create or replace function public.seed_communication_templates(p_tenant_id uuid)
 returns integer language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_caller uuid := auth.uid(); v_seeded int := 0;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.is_tenant_admin(p_tenant_id) then raise exception 'tenant admin required' using errcode='42501'; end if;
  with preset(k,nm,tg,ch,so) as (values
    ('employee_info','Mitarbeiterinformation','mitarbeiter','intranet',1),
    ('customer_info','Kundeninformation','kunden','email',2),
    ('press_release','Pressemitteilung','presse','presse',3),
    ('authority_notice','Behördenmeldung','behoerden','brief',4)),
  ins as (
    insert into public.communication_templates (tenant_id, template_key, name, default_target_group_key, default_channel, sort_order, created_by)
    select p_tenant_id, k, nm, tg, ch, so, v_caller from preset pr
    where not exists (select 1 from public.communication_templates t where t.tenant_id=p_tenant_id and t.template_key=pr.k)
    returning 1)
  select count(*) into v_seeded from ins;
  return v_seeded;
end;
$function$;
revoke all on function public.seed_communication_templates(uuid) from public;
revoke all on function public.seed_communication_templates(uuid) from anon;
grant execute on function public.seed_communication_templates(uuid) to authenticated;

create or replace function public.create_communication_template(
  p_tenant_id uuid, p_template_key text, p_name text, p_default_target_group_key text default null,
  p_default_channel text default null, p_default_confidentiality public.ma_confidentiality_level default 'standard',
  p_body_skeleton text default null)
 returns public.communication_templates language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_row public.communication_templates;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.is_tenant_admin(p_tenant_id) then raise exception 'tenant admin required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_template_key,'')))=0 or length(btrim(coalesce(p_name,'')))=0 then
    raise exception 'template_key and name required' using errcode='22023';
  end if;
  insert into public.communication_templates (tenant_id, template_key, name, default_target_group_key, default_channel, default_confidentiality, body_skeleton, created_by)
  values (p_tenant_id, btrim(p_template_key), btrim(p_name), p_default_target_group_key, p_default_channel, coalesce(p_default_confidentiality,'standard'), p_body_skeleton, auth.uid())
  returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.create_communication_template(uuid,text,text,text,text,public.ma_confidentiality_level,text) from public;
revoke all on function public.create_communication_template(uuid,text,text,text,text,public.ma_confidentiality_level,text) from anon;
grant execute on function public.create_communication_template(uuid,text,text,text,text,public.ma_confidentiality_level,text) to authenticated;
