-- PROJ-107: M&A Risk Register — DUP→REUSE on PROJ-20 risks (CIA-reviewed).
-- (A) tenant risk_categories catalog + risks.category_id (nullable, no backfill)
-- (B) risks.confidentiality_level + 3 RESTRICTIVE can_access_classified policies (100a recipe, mirrors work_items)
-- (C) risk_links CHECK += work_item, deliverable + validation-trigger CASE
-- Hygiene: category_id/confidentiality_level/workstream_id into audit whitelist; new catalog audit-wired.
-- Audit table is public.audit_log_entries.

-- ============================================================
-- (A) risk_categories tenant catalog
-- ============================================================
create table if not exists public.risk_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  label text not null,
  applies_to_project_type text null,          -- null = alle Projekttypen
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_categories_key_len check (char_length(key) between 1 and 64),
  constraint risk_categories_label_len check (char_length(label) between 1 and 120),
  constraint risk_categories_tenant_key_unique unique (tenant_id, key)
);
create index if not exists risk_categories_tenant_active_idx
  on public.risk_categories (tenant_id, is_active, sort_order);
alter table public.risk_categories enable row level security;

-- read: any tenant member; write: tenant admin (tenant-weiter Katalog, wie clearance-profiles)
create policy risk_categories_select_member on public.risk_categories
  for select using (public.is_tenant_member(tenant_id));
create policy risk_categories_insert_admin on public.risk_categories
  for insert with check (public.is_tenant_admin(tenant_id));
create policy risk_categories_update_admin on public.risk_categories
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy risk_categories_delete_admin on public.risk_categories
  for delete using (public.is_tenant_admin(tenant_id));

create trigger risk_categories_set_updated_at
  before update on public.risk_categories
  for each row execute function moddatetime('updated_at');
create trigger audit_changes_risk_categories
  after update on public.risk_categories
  for each row execute function record_audit_changes();

-- risks.category_id — nullable FK, SET NULL → kein Backfill, non-M&A unberührt
alter table public.risks
  add column if not exists category_id uuid null references public.risk_categories(id) on delete set null;
create index if not exists risks_category_idx on public.risks (category_id) where category_id is not null;

-- Lazy-Seed: M&A-DD-Standardsatz, Copy-on-first-use, idempotent, tenant-member-gated
create or replace function public.seed_risk_categories_if_empty(p_tenant_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $seed$
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'not a tenant member' using errcode = '42501';
  end if;
  if exists (select 1 from public.risk_categories where tenant_id = p_tenant_id) then
    return;
  end if;
  insert into public.risk_categories (tenant_id, key, label, applies_to_project_type, sort_order)
  values
    (p_tenant_id,'financial','Financial','ma',10),
    (p_tenant_id,'tax','Tax','ma',20),
    (p_tenant_id,'legal','Legal','ma',30),
    (p_tenant_id,'commercial','Commercial / Market','ma',40),
    (p_tenant_id,'operational','Operational','ma',50),
    (p_tenant_id,'hr','HR / Organizational','ma',60),
    (p_tenant_id,'it','IT / Technology','ma',70),
    (p_tenant_id,'compliance','Compliance / Regulatory','ma',80),
    (p_tenant_id,'esg','Environmental / ESG','ma',90),
    (p_tenant_id,'integration','Integration / PMI','ma',100)
  on conflict (tenant_id, key) do nothing;
end;
$seed$;
grant execute on function public.seed_risk_categories_if_empty(uuid) to authenticated;

-- ============================================================
-- (B) Need-to-know confidentiality on shared risks (100a recipe; mirrors work_items exactly)
-- ============================================================
alter table public.risks
  add column if not exists confidentiality_level public.ma_confidentiality_level not null default 'standard';

-- RESTRICTIVE gates: SELECT / UPDATE / DELETE (USING only, no INSERT gate) — identical to work_items
create policy risks_confidentiality_gate on public.risks
  as restrictive for select using (public.can_access_classified(project_id, confidentiality_level));
create policy risks_confidentiality_gate_write on public.risks
  as restrictive for update using (public.can_access_classified(project_id, confidentiality_level));
create policy risks_confidentiality_gate_delete on public.risks
  as restrictive for delete using (public.can_access_classified(project_id, confidentiality_level));

-- ============================================================
-- (C) risk_links += work_item, deliverable (additive CHECK + trigger CASE)
-- ============================================================
alter table public.risk_links drop constraint risk_links_linked_kind_check;
alter table public.risk_links add constraint risk_links_linked_kind_check
  check (linked_kind = any (array['phase'::text,'sprint'::text,'work_item'::text,'deliverable'::text]));

create or replace function public.tg_risk_links_validate_fn()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_linked_tenant uuid; v_risk_tenant uuid;
begin
  case NEW.linked_kind
    when 'phase' then
      select tenant_id into v_linked_tenant from public.phases where id = NEW.linked_id and is_deleted = false;
    when 'sprint' then
      select tenant_id into v_linked_tenant from public.sprints where id = NEW.linked_id;
    when 'work_item' then
      select tenant_id into v_linked_tenant from public.work_items where id = NEW.linked_id and is_deleted = false;
    when 'deliverable' then
      select tenant_id into v_linked_tenant from public.deliverables where id = NEW.linked_id;
    else
      raise exception 'unknown risk_links.linked_kind %', NEW.linked_kind using errcode = '22023';
  end case;
  if v_linked_tenant is null then
    raise exception 'risk_links linked-entity (%, %) does not exist', NEW.linked_kind, NEW.linked_id using errcode = '23503';
  end if;
  select tenant_id into v_risk_tenant from public.risks where id = NEW.risk_id;
  if v_risk_tenant is null then
    raise exception 'risk_links risk (%) does not exist', NEW.risk_id using errcode = '23503';
  end if;
  if v_risk_tenant <> NEW.tenant_id or v_linked_tenant <> NEW.tenant_id then
    raise exception 'risk_links cross-tenant boundary violation' using errcode = '22023';
  end if;
  return NEW;
end;
$function$;

-- ============================================================
-- Hygiene: audit whitelist + new catalog entity (rebuilt from LIVE defs)
-- ============================================================
create or replace function public._tracked_audit_columns(p_table text)
 returns text[] language sql immutable security definer set search_path to 'public', 'pg_temp'
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
    else array[]::text[]
  end
$function$;

alter table public.audit_log_entries drop constraint audit_log_entity_type_check;
alter table public.audit_log_entries add constraint audit_log_entity_type_check
  check (entity_type = any (array[
    'stakeholders','work_items','phases','milestones','projects','risks','decisions','open_items','tenants','tenant_settings','communication_outbox','resources','work_item_resources','tenant_project_type_overrides','tenant_method_overrides','vendors','vendor_project_assignments','vendor_evaluations','vendor_documents','compliance_tags','work_item_documents','budget_categories','budget_items','budget_postings','vendor_invoices','report_snapshots','role_rates','work_item_cost_lines','dependencies','tenant_ai_keys','tenant_ai_providers','tenant_ai_provider_priority','tenant_ai_cost_caps','tenant_memberships','organization_units','locations','stakeholder_interactions','stakeholder_interaction_participants','organization_imports','releases','stakeholder_coaching_recommendations','project_goals','sprints','risk_links','ma_confidentiality_clearances','ma_clearance_profiles','ma_advisor_profiles','ma_ndas','ma_nda_assignments','dd_streams','ma_clearance_grant_requests','ma_clearance_approval_policies','raci_assignments','dd_questions','dd_findings','committees','committee_members','workstreams','workstream_phases','deliverables','deliverable_documents','risk_categories'
  ]::text[]));

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
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$function$;
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;
