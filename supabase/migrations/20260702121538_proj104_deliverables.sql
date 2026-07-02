-- ---------------------------------------------------------------------------
-- PROJ-104 — Deliverable-Katalog (M&A Epic D). EXTEND via dd_streams/workstreams
-- recipe. deliverables + deliverable_documents; RACI unlock for 'deliverable';
-- transition RPC (approved reserved for PROJ-105); dashboard RPC gains real
-- deliverable counts. Idempotent DDL. Audit trio recreated from LIVE defs
-- (committees/workstreams branches preserved) + authenticated grant re-added.
-- ---------------------------------------------------------------------------

-- Section 0: audit entity-type CHECK (from LIVE list + deliverables + docs).
alter table public.audit_log_entries drop constraint if exists audit_log_entity_type_check;
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
      'committees','committee_members','workstreams','workstream_phases',
      'deliverables','deliverable_documents'
    ]::text[])
  );

-- Section 1: deliverables --------------------------------------------------
create table if not exists public.deliverables (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,
  name                  text not null,
  description           text,
  phase_id              uuid references public.phases(id) on delete set null,
  workstream_id         uuid references public.workstreams(id) on delete cascade,
  responsible_user_id   uuid references public.profiles(id) on delete set null,
  due_date              date,
  status                text not null default 'planned'
    check (status in ('planned','in_progress','in_review','approved','suspended')),
  confidentiality_level public.ma_confidentiality_level not null default 'standard',
  sort_order            integer not null default 0,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint deliverables_anchor_check check (phase_id is not null or workstream_id is not null)
);

create index if not exists deliverables_project_idx on public.deliverables (project_id);
create index if not exists deliverables_tenant_idx on public.deliverables (tenant_id);
create index if not exists deliverables_phase_idx on public.deliverables (phase_id) where phase_id is not null;
create index if not exists deliverables_workstream_idx on public.deliverables (workstream_id) where workstream_id is not null;
create index if not exists deliverables_responsible_idx on public.deliverables (responsible_user_id) where responsible_user_id is not null;

alter table public.deliverables enable row level security;

drop policy if exists deliverables_select on public.deliverables;
create policy deliverables_select on public.deliverables
  for select to authenticated using (public.is_project_member(project_id));
drop policy if exists deliverables_insert on public.deliverables;
create policy deliverables_insert on public.deliverables
  for insert to authenticated
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));
drop policy if exists deliverables_update on public.deliverables;
create policy deliverables_update on public.deliverables
  for update to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));
drop policy if exists deliverables_delete on public.deliverables;
create policy deliverables_delete on public.deliverables
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop policy if exists deliverables_confidentiality_gate on public.deliverables;
create policy deliverables_confidentiality_gate on public.deliverables
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists deliverables_confidentiality_gate_write on public.deliverables;
create policy deliverables_confidentiality_gate_write on public.deliverables
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists deliverables_confidentiality_gate_delete on public.deliverables;
create policy deliverables_confidentiality_gate_delete on public.deliverables
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop trigger if exists deliverables_set_updated_at on public.deliverables;
create trigger deliverables_set_updated_at before update on public.deliverables
  for each row execute function extensions.moddatetime(updated_at);
drop trigger if exists audit_changes_deliverables on public.deliverables;
create trigger audit_changes_deliverables after update on public.deliverables
  for each row execute function public.record_audit_changes();

-- Section 2: deliverable_documents (external link table; upload -> PROJ-79) ---
create table if not exists public.deliverable_documents (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  title          text not null,
  url            text not null,
  tag_keys       text[] not null default '{}',
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index if not exists deliverable_documents_deliverable_idx on public.deliverable_documents (deliverable_id);
create index if not exists deliverable_documents_tenant_idx on public.deliverable_documents (tenant_id);

alter table public.deliverable_documents enable row level security;

drop policy if exists deliverable_documents_select on public.deliverable_documents;
create policy deliverable_documents_select on public.deliverable_documents
  for select to authenticated using (exists (
    select 1 from public.deliverables d where d.id = deliverable_id
      and public.is_project_member(d.project_id)
      and public.can_access_classified(d.project_id, d.confidentiality_level)));
drop policy if exists deliverable_documents_insert on public.deliverable_documents;
create policy deliverable_documents_insert on public.deliverable_documents
  for insert to authenticated with check (exists (
    select 1 from public.deliverables d where d.id = deliverable_id
      and (public.is_tenant_admin(d.tenant_id) or public.is_project_lead(d.project_id))
      and public.can_access_classified(d.project_id, d.confidentiality_level)));
drop policy if exists deliverable_documents_delete on public.deliverable_documents;
create policy deliverable_documents_delete on public.deliverable_documents
  for delete to authenticated using (exists (
    select 1 from public.deliverables d where d.id = deliverable_id
      and (public.is_tenant_admin(d.tenant_id) or public.is_project_lead(d.project_id))
      and public.can_access_classified(d.project_id, d.confidentiality_level)));

-- Section 3: unlock RACI for deliverable ------------------------------------
alter table public.raci_assignments drop constraint if exists raci_target_type_check;
alter table public.raci_assignments
  add constraint raci_target_type_check check (target_type in ('work_item','deliverable'));

-- Section 4: transition_deliverable_status (approved reserved for PROJ-105) --
create or replace function public.transition_deliverable_status(
  p_deliverable_id uuid,
  p_to_status text
)
returns public.deliverables
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid; v_project uuid; v_from text; v_row public.deliverables;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id, status into v_tenant, v_project, v_from
    from public.deliverables where id = p_deliverable_id;
  if not found then raise exception 'deliverable not found' using errcode='P0002'; end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for deliverable status transition' using errcode='42501';
  end if;
  if p_to_status not in ('planned','in_progress','in_review','approved','suspended') then
    raise exception 'invalid status %', p_to_status using errcode='22023';
  end if;
  -- 'approved' transition is owned by PROJ-105 (formal Freigabe-Workflow / gate).
  if p_to_status = 'approved' then
    raise exception 'approved is set by the PROJ-105 approval workflow, not here' using errcode='42501';
  end if;
  if v_from = 'planned' and p_to_status not in ('in_progress','suspended') then
    raise exception 'cannot transition from % to %', v_from, p_to_status using errcode='23514';
  elsif v_from = 'in_progress' and p_to_status not in ('in_review','planned','suspended') then
    raise exception 'cannot transition from % to %', v_from, p_to_status using errcode='23514';
  elsif v_from = 'in_review' and p_to_status not in ('in_progress','suspended') then
    raise exception 'cannot transition from % to %', v_from, p_to_status using errcode='23514';
  elsif v_from = 'suspended' and p_to_status not in ('planned') then
    raise exception 'cannot transition from % to %', v_from, p_to_status using errcode='23514';
  elsif v_from = 'approved' then
    raise exception 'approved is terminal in PROJ-104 (PROJ-105 owns further transitions)' using errcode='23514';
  end if;
  update public.deliverables set status = p_to_status, updated_at = now()
    where id = p_deliverable_id returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.transition_deliverable_status(uuid, text) from public;
revoke execute on function public.transition_deliverable_status(uuid, text) from anon;
grant execute on function public.transition_deliverable_status(uuid, text) to authenticated;

-- Section 5: set/clear_deliverable_raci (mirror set_work_item_raci) ----------
create or replace function public.set_deliverable_raci(
  p_deliverable_id uuid, p_role_key text, p_raci_letter text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_caller uuid := auth.uid(); v_tenant uuid; v_project uuid; v_id uuid;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_raci_letter not in ('R','A','C','I') then raise exception 'invalid RACI letter %', p_raci_letter using errcode='22023'; end if;
  if coalesce(length(trim(p_role_key)),0)=0 then raise exception 'role_key required' using errcode='22023'; end if;
  select tenant_id, project_id into v_tenant, v_project from public.deliverables where id = p_deliverable_id;
  if not found then raise exception 'deliverable not found' using errcode='02000'; end if;
  if not (public.is_tenant_admin(v_tenant) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = v_project and pm.user_id = v_caller and pm.role in ('lead','editor'))) then
    raise exception 'insufficient role to edit RACI' using errcode='42501';
  end if;
  insert into public.raci_assignments
    (tenant_id, project_id, target_type, target_id, role_key, raci_letter, created_by)
  values (v_tenant, v_project, 'deliverable', p_deliverable_id, trim(p_role_key), p_raci_letter, v_caller)
  on conflict (target_type, target_id, role_key)
    do update set raci_letter = excluded.raci_letter, updated_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'deliverable_id', p_deliverable_id,
    'role_key', trim(p_role_key), 'raci_letter', p_raci_letter);
end;
$$;
revoke execute on function public.set_deliverable_raci(uuid, text, text) from public;
revoke execute on function public.set_deliverable_raci(uuid, text, text) from anon;
grant execute on function public.set_deliverable_raci(uuid, text, text) to authenticated;

create or replace function public.clear_deliverable_raci(
  p_deliverable_id uuid, p_role_key text
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_caller uuid := auth.uid(); v_tenant uuid; v_project uuid;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id, project_id into v_tenant, v_project from public.deliverables where id = p_deliverable_id;
  if not found then raise exception 'deliverable not found' using errcode='02000'; end if;
  if not (public.is_tenant_admin(v_tenant) or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = v_project and pm.user_id = v_caller and pm.role in ('lead','editor'))) then
    raise exception 'insufficient role to edit RACI' using errcode='42501';
  end if;
  delete from public.raci_assignments
    where target_type='deliverable' and target_id = p_deliverable_id and role_key = trim(p_role_key);
end;
$$;
revoke execute on function public.clear_deliverable_raci(uuid, text) from public;
revoke execute on function public.clear_deliverable_raci(uuid, text) from anon;
grant execute on function public.clear_deliverable_raci(uuid, text) to authenticated;

-- Section 6: audit trio recreate (LIVE defs + deliverables/deliverable_documents) --
create or replace function public._tracked_audit_columns(p_table text)
returns text[] language sql immutable security definer set search_path to 'public','pg_temp'
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
    when 'deliverables' then array['name','description','phase_id','workstream_id','responsible_user_id','due_date','status','confidentiality_level','sort_order']
    when 'deliverable_documents' then array['title','url','tag_keys']
    else array[]::text[]
  end
$$;
revoke execute on function public._tracked_audit_columns(text) from public;

create or replace function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public'
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
    when 'deliverables' then select project_id into v_project from public.deliverables where id = p_entity_id;
    when 'deliverable_documents' then
      select d.project_id into v_project from public.deliverable_documents dd
      join public.deliverables d on d.id = dd.deliverable_id where dd.id = p_entity_id;
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;

-- Section 7: workstream_dashboard — real deliverable counts (INVOKER kept) ----
-- Signature changes (new deliverables_overdue col) -> drop + create. Deliverable
-- counts as subqueries (avoid LEFT-JOIN row multiplication with work_items).
drop function if exists public.workstream_dashboard(uuid);
create function public.workstream_dashboard(p_project_id uuid)
returns table (
  workstream_id      uuid,
  tasks_total        bigint,
  tasks_done         bigint,
  open_risks         bigint,
  deliverables_total bigint,
  deliverables_overdue bigint
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
    (select count(*) from public.deliverables dl where dl.workstream_id = w.id),
    (select count(*) from public.deliverables dl
       where dl.workstream_id = w.id
         and dl.due_date < current_date
         and dl.status not in ('approved','suspended'))
  from public.workstreams w
  left join public.work_items wi
    on wi.workstream_id = w.id and wi.is_deleted = false
  where w.project_id = p_project_id
  group by w.id;
$$;
revoke execute on function public.workstream_dashboard(uuid) from public;
revoke execute on function public.workstream_dashboard(uuid) from anon;
grant execute on function public.workstream_dashboard(uuid) to authenticated;
