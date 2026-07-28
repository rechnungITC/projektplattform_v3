-- PROJ-106 — Versionierung und Änderungshistorie von Deliverables (DUP→REUSE).
--
-- Core immutable-supersede version chain (Invariante #5, analog decisions.supersedes_*)
-- ADDITIVELY on the existing PROJ-104 deliverable_documents table — no new table,
-- no new dep. A "document slot" is a chain of immutable version rows linked by
-- supersedes_document_id; exactly one row per chain carries is_current. A new
-- version is an atomic INSERT (new row, version_no+1, is_current=true) + flip of
-- the previous head's is_current=false, done by a SECURITY DEFINER RPC (there is
-- no UPDATE RLS policy on deliverable_documents — writes go through the RPC).
--
-- AC1 version_no · AC2 immutability guard trigger · AC3 created_at/created_by/
-- version_comment · AC4 is_current · AC5 approved_in_event_id (nullable FK →
-- PROJ-105 deliverable_approval_events; the immutable events table is untouched).
--
-- Need-to-know (B4) inherits from the existing deliverable_documents RESTRICTIVE
-- select/insert/delete policies (parent deliverable's can_access_classified); the
-- DEFINER RPCs re-check can_access_classified explicitly since they bypass RLS.
--
-- Audit: deliverable_documents had NO audit trigger (PROJ-104 wired it into the
-- audit trio metadata but never attached record_audit_changes). This migration
-- attaches it + extends _tracked_audit_columns so the is_current flip and the
-- approval stamp are recorded → DoD "Audit-Trail erfasst Versionswechsel".
-- entity_type CHECK + can_read_audit_entry already cover deliverable_documents
-- (PROJ-104) → not recreated (no authenticated-grant risk).

-- Section 1: version columns (additive, idempotent) --------------------------
alter table public.deliverable_documents
  add column if not exists version_no integer not null default 1,
  add column if not exists supersedes_document_id uuid references public.deliverable_documents(id) on delete set null,
  add column if not exists is_current boolean not null default true,
  add column if not exists version_comment text,
  add column if not exists approved_in_event_id uuid references public.deliverable_approval_events(id) on delete set null;

create index if not exists deliverable_documents_current_idx
  on public.deliverable_documents (deliverable_id, is_current);
create index if not exists deliverable_documents_supersedes_idx
  on public.deliverable_documents (supersedes_document_id);

-- Section 2: immutability guard (AC2) ----------------------------------------
-- Earlier versions are immutable. The ONLY permitted UPDATEs are the controlled
-- is_current flip and the set-once approval stamp; every content column is frozen.
create or replace function public._guard_deliverable_document_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if NEW.title is distinct from OLD.title
     or NEW.url is distinct from OLD.url
     or NEW.tag_keys is distinct from OLD.tag_keys
     or NEW.version_no is distinct from OLD.version_no
     or NEW.version_comment is distinct from OLD.version_comment
     or NEW.supersedes_document_id is distinct from OLD.supersedes_document_id
     or NEW.deliverable_id is distinct from OLD.deliverable_id
     or NEW.tenant_id is distinct from OLD.tenant_id
     or NEW.created_by is distinct from OLD.created_by
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'deliverable_document versions are immutable; only is_current and the approval link may change'
      using errcode = '42501';
  end if;
  -- approval stamp is set-once (null → value); never changed or cleared.
  if OLD.approved_in_event_id is not null
     and NEW.approved_in_event_id is distinct from OLD.approved_in_event_id then
    raise exception 'approved_in_event_id is set-once' using errcode = '42501';
  end if;
  return NEW;
end;
$$;
revoke execute on function public._guard_deliverable_document_immutable() from public, anon, authenticated;

drop trigger if exists guard_deliverable_document_immutable on public.deliverable_documents;
create trigger guard_deliverable_document_immutable
  before update on public.deliverable_documents
  for each row execute function public._guard_deliverable_document_immutable();

-- Section 3: attach audit trigger (was missing) ------------------------------
drop trigger if exists audit_changes_deliverable_documents on public.deliverable_documents;
create trigger audit_changes_deliverable_documents
  after update on public.deliverable_documents
  for each row execute function public.record_audit_changes();

-- Section 4: extend _tracked_audit_columns (verbatim from LIVE def; only the
-- deliverable_documents line changes — all sibling entities preserved) -------
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
    else array[]::text[]
  end
$function$;

-- Section 5: add_deliverable_document_version RPC (atomic INSERT + is_current flip)
create or replace function public.add_deliverable_document_version(
  p_deliverable_id uuid,
  p_title text,
  p_url text,
  p_supersedes_document_id uuid default null,
  p_version_comment text default null,
  p_tag_keys text[] default '{}'
)
returns public.deliverable_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_conf public.ma_confidentiality_level;
  v_prev public.deliverable_documents;
  v_version_no integer := 1;
  v_row public.deliverable_documents;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id, confidentiality_level into v_tenant, v_project, v_conf
    from public.deliverables where id = p_deliverable_id;
  if not found then raise exception 'deliverable not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for deliverable document version' using errcode='42501';
  end if;
  if not public.can_access_classified(v_project, v_conf) then
    raise exception 'need-to-know: insufficient clearance' using errcode='42501';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'title required' using errcode='22023'; end if;
  if p_url is null or length(trim(p_url)) = 0 then raise exception 'url required' using errcode='22023'; end if;

  if p_supersedes_document_id is not null then
    select * into v_prev from public.deliverable_documents
      where id = p_supersedes_document_id and deliverable_id = p_deliverable_id;
    if not found then raise exception 'supersedes target not in this deliverable' using errcode='23514'; end if;
    if not v_prev.is_current then raise exception 'can only supersede the current version' using errcode='23514'; end if;
    v_version_no := v_prev.version_no + 1;
    perform set_config('audit.change_reason', 'deliverable document version superseded', true);
    update public.deliverable_documents set is_current = false where id = v_prev.id;
  end if;

  insert into public.deliverable_documents
    (tenant_id, deliverable_id, title, url, tag_keys, version_no, supersedes_document_id, is_current, version_comment, created_by)
  values
    (v_tenant, p_deliverable_id, p_title, p_url, coalesce(p_tag_keys, '{}'), v_version_no, p_supersedes_document_id, true, p_version_comment, v_caller)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.add_deliverable_document_version(uuid,text,text,uuid,text,text[]) from public, anon;
grant execute on function public.add_deliverable_document_version(uuid,text,text,uuid,text,text[]) to authenticated;

-- Section 6: stamp a version with its approval event (AC5) -------------------
create or replace function public.stamp_deliverable_document_version_approval(
  p_document_id uuid,
  p_event_id uuid
)
returns public.deliverable_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_deliverable uuid; v_tenant uuid; v_project uuid; v_conf public.ma_confidentiality_level;
  v_ok boolean; v_row public.deliverable_documents;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select dd.deliverable_id, d.tenant_id, d.project_id, d.confidentiality_level
    into v_deliverable, v_tenant, v_project, v_conf
    from public.deliverable_documents dd
    join public.deliverables d on d.id = dd.deliverable_id
    where dd.id = p_document_id;
  if not found then raise exception 'document not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for approval stamp' using errcode='42501';
  end if;
  if not public.can_access_classified(v_project, v_conf) then
    raise exception 'need-to-know: insufficient clearance' using errcode='42501';
  end if;
  -- the event must belong to an approval of THIS deliverable
  select exists (
    select 1 from public.deliverable_approval_events e
      join public.deliverable_approvals a on a.id = e.approval_id
     where e.id = p_event_id and a.deliverable_id = v_deliverable
  ) into v_ok;
  if not v_ok then raise exception 'approval event does not belong to this deliverable' using errcode='23514'; end if;

  perform set_config('audit.change_reason', 'deliverable document version linked to approval', true);
  update public.deliverable_documents set approved_in_event_id = p_event_id
    where id = p_document_id returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.stamp_deliverable_document_version_approval(uuid,uuid) from public, anon;
grant execute on function public.stamp_deliverable_document_version_approval(uuid,uuid) to authenticated;

comment on function public.add_deliverable_document_version(uuid,text,text,uuid,text,text[]) is
  'PROJ-106 — create a new deliverable_documents version (atomic INSERT + is_current flip of the superseded head). SECURITY DEFINER, edit-gated + need-to-know re-checked. VIEW-class version chain, core immutable-supersede pattern.';
comment on function public.stamp_deliverable_document_version_approval(uuid,uuid) is
  'PROJ-106 — link a document version to a PROJ-105 approval event (AC5). Set-once approved_in_event_id; validates the event belongs to an approval of the same deliverable.';
