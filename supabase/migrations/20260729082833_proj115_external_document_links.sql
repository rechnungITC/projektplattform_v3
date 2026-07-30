-- PROJ-115 — Anbindung an externe Datenräume (Verlinkung, nicht Ersatz).
--
-- ONE polymorphic link table over 4 DD objects (dd_question/dd_finding/work_item/
-- deliverable) — CIA Fork-1 Option A. No file storage, no OCR (out of scope);
-- just an external URL + label per object. Need-to-know (B4/L2) is inherited
-- from the parent via the SECURITY DEFINER resolver external_link_parent_ctx +
-- RESTRICTIVE can_access_classified gates on ALL four axes (SELECT/INSERT-with-
-- check/UPDATE/DELETE) — mirrors the dd_questions full-gate pattern, NOT the
-- work_item_documents gap (CIA-F4 → PROJ-Y-115c). SSRF: this migration only
-- persists URLs; a https-only CHECK is defense-in-depth, the full static
-- validation (reserved-IP reject, no creds) lives in the TS route layer; NO
-- server-side fetch happens anywhere (active reachability check → PROJ-Y-115a).

-- Section 1: parent-context resolver (polymorphic need-to-know source) --------
create or replace function public.external_link_parent_ctx(
  p_entity_type text,
  p_entity_id uuid,
  out project_id uuid,
  out level public.ma_confidentiality_level
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  case p_entity_type
    when 'deliverable' then
      select d.project_id, d.confidentiality_level into project_id, level
      from public.deliverables d where d.id = p_entity_id;
    when 'work_item' then
      select w.project_id, w.confidentiality_level into project_id, level
      from public.work_items w where w.id = p_entity_id;
    when 'dd_question' then
      select q.project_id, q.confidentiality_level into project_id, level
      from public.dd_questions q where q.id = p_entity_id;
    when 'dd_finding' then
      select f.project_id, f.confidentiality_level into project_id, level
      from public.dd_findings f where f.id = p_entity_id;
    else
      project_id := null; level := null;
  end case;
end;
$$;
revoke execute on function public.external_link_parent_ctx(text, uuid) from public, anon;
grant execute on function public.external_link_parent_ctx(text, uuid) to authenticated;

-- Section 2: table -----------------------------------------------------------
create table if not exists public.external_document_links (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null check (entity_type in ('dd_question','dd_finding','work_item','deliverable')),
  entity_id   uuid not null,
  url         text not null check (url like 'https://%' and length(url) <= 2000),
  label       text check (label is null or length(label) <= 200),
  added_by    uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists external_document_links_entity_idx
  on public.external_document_links (entity_type, entity_id);
create index if not exists external_document_links_tenant_idx
  on public.external_document_links (tenant_id);

alter table public.external_document_links enable row level security;

-- Section 3: polymorphic integrity — parent must exist + tenant match --------
create or replace function public._guard_external_document_link()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_project uuid;
begin
  select project_id into v_project
  from public.external_link_parent_ctx(NEW.entity_type, NEW.entity_id);
  if v_project is null then
    raise exception 'external link parent % % does not exist', NEW.entity_type, NEW.entity_id
      using errcode = '23503';
  end if;
  -- tenant of the link must match the parent's project tenant
  if NEW.tenant_id is distinct from (select tenant_id from public.projects where id = v_project) then
    raise exception 'external link tenant mismatch with parent project' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke execute on function public._guard_external_document_link() from public, anon, authenticated;

drop trigger if exists guard_external_document_link on public.external_document_links;
create trigger guard_external_document_link
  before insert or update on public.external_document_links
  for each row execute function public._guard_external_document_link();

-- Section 4: parent-delete cleanup (no FK possible on polymorphic entity_id) --
create or replace function public._cleanup_external_document_links()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.external_document_links
  where entity_type = TG_ARGV[0] and entity_id = OLD.id;
  return OLD;
end;
$$;
revoke execute on function public._cleanup_external_document_links() from public, anon, authenticated;

drop trigger if exists cleanup_external_links on public.deliverables;
create trigger cleanup_external_links after delete on public.deliverables
  for each row execute function public._cleanup_external_document_links('deliverable');
drop trigger if exists cleanup_external_links on public.work_items;
create trigger cleanup_external_links after delete on public.work_items
  for each row execute function public._cleanup_external_document_links('work_item');
drop trigger if exists cleanup_external_links on public.dd_questions;
create trigger cleanup_external_links after delete on public.dd_questions
  for each row execute function public._cleanup_external_document_links('dd_question');
drop trigger if exists cleanup_external_links on public.dd_findings;
create trigger cleanup_external_links after delete on public.dd_findings
  for each row execute function public._cleanup_external_document_links('dd_finding');

-- Section 5: RLS — permissive membership + RESTRICTIVE need-to-know on 4 axes -
drop policy if exists external_document_links_select on public.external_document_links;
create policy external_document_links_select on public.external_document_links
  for select to authenticated using (
    public.is_project_member((public.external_link_parent_ctx(entity_type, entity_id)).project_id));

drop policy if exists external_document_links_insert on public.external_document_links;
create policy external_document_links_insert on public.external_document_links
  for insert to authenticated with check (
    public.is_project_member((public.external_link_parent_ctx(entity_type, entity_id)).project_id)
    and public.is_tenant_member(tenant_id));

drop policy if exists external_document_links_delete on public.external_document_links;
create policy external_document_links_delete on public.external_document_links
  for delete to authenticated using (
    public.is_project_member((public.external_link_parent_ctx(entity_type, entity_id)).project_id));

-- RESTRICTIVE need-to-know gate (AND-ed with the permissive policies), all axes.
drop policy if exists external_document_links_conf_select on public.external_document_links;
create policy external_document_links_conf_select on public.external_document_links
  as restrictive for select to authenticated using (
    public.can_access_classified(
      (public.external_link_parent_ctx(entity_type, entity_id)).project_id,
      (public.external_link_parent_ctx(entity_type, entity_id)).level));

drop policy if exists external_document_links_conf_insert on public.external_document_links;
create policy external_document_links_conf_insert on public.external_document_links
  as restrictive for insert to authenticated with check (
    public.can_access_classified(
      (public.external_link_parent_ctx(entity_type, entity_id)).project_id,
      (public.external_link_parent_ctx(entity_type, entity_id)).level));

drop policy if exists external_document_links_conf_update on public.external_document_links;
create policy external_document_links_conf_update on public.external_document_links
  as restrictive for update to authenticated using (
    public.can_access_classified(
      (public.external_link_parent_ctx(entity_type, entity_id)).project_id,
      (public.external_link_parent_ctx(entity_type, entity_id)).level));

drop policy if exists external_document_links_conf_delete on public.external_document_links;
create policy external_document_links_conf_delete on public.external_document_links
  as restrictive for delete to authenticated using (
    public.can_access_classified(
      (public.external_link_parent_ctx(entity_type, entity_id)).project_id,
      (public.external_link_parent_ctx(entity_type, entity_id)).level));

-- Section 6: audit wiring (entity_type CHECK + tracked columns + read gate) ---
-- entity_type CHECK: add 'external_document_links' (recreate from live list).
alter table public.audit_log_entries drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log_entries add constraint audit_log_entity_type_check check (
  entity_type = any (array[
    'stakeholders','work_items','phases','milestones','projects','risks','decisions','open_items',
    'tenants','tenant_settings','communication_outbox','resources','work_item_resources',
    'tenant_project_type_overrides','tenant_method_overrides','vendors','vendor_project_assignments',
    'vendor_evaluations','vendor_documents','compliance_tags','work_item_documents','budget_categories',
    'budget_items','budget_postings','vendor_invoices','report_snapshots','role_rates',
    'work_item_cost_lines','dependencies','tenant_ai_keys','tenant_ai_providers',
    'tenant_ai_provider_priority','tenant_ai_cost_caps','tenant_memberships','organization_units',
    'locations','stakeholder_interactions','stakeholder_interaction_participants','organization_imports',
    'releases','stakeholder_coaching_recommendations','project_goals','sprints','risk_links',
    'ma_confidentiality_clearances','ma_clearance_profiles','ma_advisor_profiles','ma_ndas',
    'ma_nda_assignments','dd_streams','ma_clearance_grant_requests','ma_clearance_approval_policies',
    'raci_assignments','dd_questions','dd_findings','committees','committee_members','workstreams',
    'workstream_phases','deliverables','deliverable_documents','risk_categories','ma_stage_gates',
    'document_tree_nodes','documents','committee_meetings','committee_meeting_attendees',
    'committee_meeting_documents','committee_meeting_outcomes','committee_templates',
    'communication_matrix_entries','communication_templates','skills','skill_versions','skill_examples',
    'skill_knowledge_links','external_document_links'
  ]));

-- tracked columns: add external_document_links → [url, label] (verbatim-from-live
-- + one new branch; only the else-tail changes).
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path to 'public', 'pg_temp'
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
    when 'deliverable_documents' then array['title','url','tag_keys','version_no','supersedes_document_id','is_current','version_comment','approved_in_event_id']
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
    when 'skills' then array['name','slug','description','category','method_tags','project_type_tags','is_active','current_version_id']
    when 'skill_versions' then array['status']
    when 'skill_examples' then array['title','input','expected_output','tags','display_order']
    when 'external_document_links' then array['url','label']
    else array[]::text[]
  end
$function$;

-- can_read_audit_entry: add external_document_links branch (resolve via ctx).
-- Recreated with the SAME body as live + one new branch; re-grant authenticated
-- afterwards (recreate drops the grant — feedback_audit_fn_recreate_drops_grant).
create or replace function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
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
    when 'external_document_links' then
      select (public.external_link_parent_ctx(l.entity_type, l.entity_id)).project_id into v_project
      from public.external_document_links l where l.id = p_entity_id;
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
    when 'skills' then return public.is_tenant_member(p_tenant_id);
    when 'skill_versions' then return public.is_tenant_member(p_tenant_id);
    when 'skill_examples' then return public.is_tenant_admin(p_tenant_id);
    when 'skill_knowledge_links' then return public.is_tenant_admin(p_tenant_id);
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$function$;
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;

-- Section 7: attach audit UPDATE trigger (records url/label edits) ------------
drop trigger if exists audit_changes_external_document_links on public.external_document_links;
create trigger audit_changes_external_document_links
  after update on public.external_document_links
  for each row execute function public.record_audit_changes();

comment on table public.external_document_links is
  'PROJ-115 — polymorphic external (VDR) document links for dd_question/dd_finding/'
  'work_item/deliverable. Need-to-know inherited from the parent via '
  'external_link_parent_ctx + RESTRICTIVE can_access_classified gates. URLs are '
  'never fetched server-side (SSRF); active reachability check → PROJ-Y-115a.';
