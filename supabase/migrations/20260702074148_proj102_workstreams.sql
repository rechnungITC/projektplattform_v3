-- ---------------------------------------------------------------------------
-- PROJ-102 — Workstreams strukturieren und steuern (M&A Epic C)
-- EXTEND via the PROJ-112 dd_streams recipe (NOT generalizing dd_streams).
-- New workstreams + workstream_phases (M:N) + additive nullable FKs
-- work_items.workstream_id (PROJ-Y-101a) and risks.workstream_id (F4).
-- Need-to-know (PROJ-100a) + PROJ-10 audit from day one. Idempotent DDL.
--
-- Audit CHECK + _tracked_audit_columns + can_read_audit_entry are recreated
-- from the LIVE definitions (incl. committees/dd_* etc.) + a 'workstreams'
-- entry, then can_read_audit_entry is re-granted to authenticated (recreate
-- drops the grant — memory lesson). workstream_phases: no audit trigger
-- (join table, insert/delete only).
-- ---------------------------------------------------------------------------

-- Section 0: extend audit entity-type CHECK BEFORE any write (PROJ-100a-H-1).
alter table public.audit_log_entries
  drop constraint if exists audit_log_entity_type_check;
alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type = any (array[
      'stakeholders','work_items','phases','milestones','projects','risks',
      'decisions','open_items','tenants','tenant_settings','communication_outbox',
      'resources','work_item_resources','tenant_project_type_overrides',
      'tenant_method_overrides','vendors','vendor_project_assignments',
      'vendor_evaluations','vendor_documents','compliance_tags',
      'work_item_documents','budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates','work_item_cost_lines',
      'dependencies','tenant_ai_keys','tenant_ai_providers',
      'tenant_ai_provider_priority','tenant_ai_cost_caps','tenant_memberships',
      'organization_units','locations','stakeholder_interactions',
      'stakeholder_interaction_participants','organization_imports','releases',
      'stakeholder_coaching_recommendations','project_goals','sprints','risk_links',
      'ma_confidentiality_clearances','ma_clearance_profiles','ma_advisor_profiles',
      'ma_ndas','ma_nda_assignments','dd_streams','ma_clearance_grant_requests',
      'ma_clearance_approval_policies','raci_assignments','dd_questions','dd_findings',
      'committees','committee_members',
      'workstreams','workstream_phases'
    ]::text[])
  );

-- Section 1: workstreams — per-project steering unit -------------------------
create table if not exists public.workstreams (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,
  workstream_key        text not null,
  label                 text not null,
  goal                  text,
  lead_user_id          uuid references public.profiles(id) on delete set null,
  rag_status            text not null default 'green'
    check (rag_status in ('green','amber','red')),
  scope                 text,
  notes                 text,
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  sort_order            integer not null default 0,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint workstreams_key_format check (workstream_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  unique (project_id, workstream_key)
);

create index if not exists workstreams_project_idx on public.workstreams (project_id);
create index if not exists workstreams_tenant_idx on public.workstreams (tenant_id);
create index if not exists workstreams_lead_idx
  on public.workstreams (lead_user_id) where lead_user_id is not null;

alter table public.workstreams enable row level security;

drop policy if exists workstreams_select on public.workstreams;
create policy workstreams_select on public.workstreams
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists workstreams_insert on public.workstreams;
create policy workstreams_insert on public.workstreams
  for insert to authenticated
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop policy if exists workstreams_update on public.workstreams;
create policy workstreams_update on public.workstreams
  for update to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop policy if exists workstreams_delete on public.workstreams;
create policy workstreams_delete on public.workstreams
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

-- RESTRICTIVE need-to-know gate (PROJ-100a recipe).
drop policy if exists workstreams_confidentiality_gate on public.workstreams;
create policy workstreams_confidentiality_gate on public.workstreams
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists workstreams_confidentiality_gate_write on public.workstreams;
create policy workstreams_confidentiality_gate_write on public.workstreams
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists workstreams_confidentiality_gate_delete on public.workstreams;
create policy workstreams_confidentiality_gate_delete on public.workstreams
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop trigger if exists workstreams_set_updated_at on public.workstreams;
create trigger workstreams_set_updated_at
  before update on public.workstreams
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists audit_changes_workstreams on public.workstreams;
create trigger audit_changes_workstreams
  after update on public.workstreams
  for each row execute function public.record_audit_changes();

-- Section 2: workstream_phases — M:N (AC1 one or multiple phases) ------------
create table if not exists public.workstream_phases (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  workstream_id uuid not null references public.workstreams(id) on delete cascade,
  phase_id      uuid not null references public.phases(id) on delete cascade,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  primary key (workstream_id, phase_id)
);

create index if not exists workstream_phases_phase_idx on public.workstream_phases (phase_id);
create index if not exists workstream_phases_tenant_idx on public.workstream_phases (tenant_id);

alter table public.workstream_phases enable row level security;

-- Access folds in membership + need-to-know via the parent workstream.
drop policy if exists workstream_phases_select on public.workstream_phases;
create policy workstream_phases_select on public.workstream_phases
  for select to authenticated
  using (exists (
    select 1 from public.workstreams w
    where w.id = workstream_id
      and public.is_project_member(w.project_id)
      and public.can_access_classified(w.project_id, w.confidentiality_level)
  ));

drop policy if exists workstream_phases_insert on public.workstream_phases;
create policy workstream_phases_insert on public.workstream_phases
  for insert to authenticated
  with check (exists (
    select 1 from public.workstreams w
    where w.id = workstream_id
      and (public.is_tenant_admin(w.tenant_id) or public.is_project_lead(w.project_id))
      and public.can_access_classified(w.project_id, w.confidentiality_level)
  ));

drop policy if exists workstream_phases_delete on public.workstream_phases;
create policy workstream_phases_delete on public.workstream_phases
  for delete to authenticated
  using (exists (
    select 1 from public.workstreams w
    where w.id = workstream_id
      and (public.is_tenant_admin(w.tenant_id) or public.is_project_lead(w.project_id))
      and public.can_access_classified(w.project_id, w.confidentiality_level)
  ));

-- Section 3: additive nullable FKs (work_items HIGH-blast: additive only) -----
alter table public.work_items
  add column if not exists workstream_id uuid references public.workstreams(id) on delete set null;
create index if not exists work_items_workstream_idx
  on public.work_items (workstream_id) where workstream_id is not null;

alter table public.risks
  add column if not exists workstream_id uuid references public.workstreams(id) on delete set null;
create index if not exists risks_workstream_idx
  on public.risks (workstream_id) where workstream_id is not null;

-- Section 4: dashboard aggregate (SECURITY INVOKER — need-to-know via caller) -
create or replace function public.workstream_dashboard(p_project_id uuid)
returns table (
  workstream_id      uuid,
  tasks_total        bigint,
  tasks_done         bigint,
  open_risks         bigint,
  deliverables_total bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    w.id,
    count(wi.id),
    count(wi.id) filter (where wi.status = 'done'),
    (select count(*) from public.risks r
       where r.workstream_id = w.id and r.status = 'open'),
    null::bigint
  from public.workstreams w
  left join public.work_items wi
    on wi.workstream_id = w.id and wi.is_deleted = false
  where w.project_id = p_project_id
  group by w.id;
$$;

revoke execute on function public.workstream_dashboard(uuid) from public;
revoke execute on function public.workstream_dashboard(uuid) from anon;
grant execute on function public.workstream_dashboard(uuid) to authenticated;

-- Section 5: audit wiring — recreate _tracked_audit_columns + can_read_audit_entry
-- verbatim from LIVE defs + a 'workstreams' branch each; re-grant afterwards.
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin','is_approver','reasoning','stakeholder_type_key','management_level','decision_authority','attitude','conflict_potential','communication_need','preferred_channel','organization_unit_id']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points','confidentiality_level']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number','confidentiality_level']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data','confidentiality_level']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
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
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;

create or replace function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;
