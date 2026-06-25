-- PROJ-97b — RACI engine. Polymorphic raci_assignments: one (target, role) ->
-- one RACI letter. Carrier is the professional ROLE (role_key), not the person,
-- so role swaps keep RACI consistent (Invariante #4). Polymorphic target
-- (target_type) admits only 'work_item' today; 'deliverable' is unlocked by
-- PROJ-104. "Accountable = exactly one per target" is a DB constraint, not UI.
-- Repo filename version == prod-registered version (PROJ-134 convention).

create table public.raci_assignments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  role_key    text not null,
  raci_letter text not null,
  created_by  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint raci_target_type_check check (target_type in ('work_item')),
  constraint raci_letter_check check (raci_letter in ('R','A','C','I')),
  constraint raci_role_key_not_blank check (length(trim(role_key)) > 0)
);

create unique index raci_unique_target_role
  on public.raci_assignments (target_type, target_id, role_key);
create unique index raci_one_accountable
  on public.raci_assignments (target_type, target_id)
  where raci_letter = 'A';
create index raci_target_idx  on public.raci_assignments (target_type, target_id);
create index raci_project_idx on public.raci_assignments (project_id);
create index raci_tenant_idx  on public.raci_assignments (tenant_id);

alter table public.raci_assignments enable row level security;

create policy raci_select on public.raci_assignments
  for select using (
    public.is_project_member(project_id) or public.is_tenant_admin(tenant_id)
  );
create policy raci_insert on public.raci_assignments
  for insert with check (
    public.is_tenant_admin(tenant_id)
    or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = raci_assignments.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('lead','editor')
    )
  );
create policy raci_update on public.raci_assignments
  for update using (
    public.is_tenant_admin(tenant_id)
    or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = raci_assignments.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('lead','editor')
    )
  );
create policy raci_delete on public.raci_assignments
  for delete using (
    public.is_tenant_admin(tenant_id)
    or exists (
      select 1 from public.project_memberships pm
      where pm.project_id = raci_assignments.project_id
        and pm.user_id = (select auth.uid())
        and pm.role in ('lead','editor')
    )
  );

-- Audit wiring (PROJ-10).
alter table public.audit_log_entries drop constraint audit_log_entity_type_check;
alter table public.audit_log_entries add constraint audit_log_entity_type_check
  check (entity_type = any (array[
    'stakeholders','work_items','phases','milestones','projects','risks','decisions',
    'open_items','tenants','tenant_settings','communication_outbox','resources',
    'work_item_resources','tenant_project_type_overrides','tenant_method_overrides',
    'vendors','vendor_project_assignments','vendor_evaluations','vendor_documents',
    'compliance_tags','work_item_documents','budget_categories','budget_items',
    'budget_postings','vendor_invoices','report_snapshots','role_rates',
    'work_item_cost_lines','dependencies','tenant_ai_keys','tenant_ai_providers',
    'tenant_ai_provider_priority','tenant_ai_cost_caps','tenant_memberships',
    'organization_units','locations','stakeholder_interactions',
    'stakeholder_interaction_participants','organization_imports','releases',
    'stakeholder_coaching_recommendations','project_goals','sprints','risk_links',
    'ma_confidentiality_clearances','ma_clearance_profiles','ma_advisor_profiles',
    'ma_ndas','ma_nda_assignments','dd_streams','ma_clearance_grant_requests',
    'ma_clearance_approval_policies','raci_assignments'
  ]));

create or replace function public._tracked_audit_columns(p_table text)
returns text[] language sql immutable security definer set search_path to 'public','pg_temp'
as $function$
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
    when 'sprints' then select project_id into v_project from public.sprints where id = p_entity_id;
    when 'ma_project_profiles' then select project_id into v_project from public.ma_project_profiles where id = p_entity_id;
    when 'ma_advisor_profiles' then select project_id into v_project from public.ma_advisor_profiles where id = p_entity_id;
    when 'ma_ndas' then select project_id into v_project from public.ma_ndas where id = p_entity_id;
    when 'dd_streams' then select project_id into v_project from public.dd_streams where id = p_entity_id;
    when 'raci_assignments' then select project_id into v_project from public.raci_assignments where id = p_entity_id;
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$function$;

create trigger raci_assignments_audit
  after update on public.raci_assignments
  for each row execute function public.record_audit_changes();

create or replace function public.set_work_item_raci(
  p_work_item_id uuid, p_role_key text, p_raci_letter text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_caller  uuid := auth.uid();
  v_tenant  uuid;
  v_project uuid;
  v_id      uuid;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_raci_letter not in ('R','A','C','I') then
    raise exception 'invalid RACI letter %', p_raci_letter using errcode = '22023';
  end if;
  if coalesce(length(trim(p_role_key)),0) = 0 then
    raise exception 'role_key required' using errcode = '22023';
  end if;

  select tenant_id, project_id into v_tenant, v_project
    from public.work_items where id = p_work_item_id and is_deleted = false;
  if not found then
    raise exception 'work item not found' using errcode = '02000';
  end if;

  if not (
    public.is_tenant_admin(v_tenant)
    or exists (select 1 from public.project_memberships pm
               where pm.project_id = v_project and pm.user_id = v_caller
                 and pm.role in ('lead','editor'))
  ) then
    raise exception 'insufficient role to edit RACI' using errcode = '42501';
  end if;

  insert into public.raci_assignments
    (tenant_id, project_id, target_type, target_id, role_key, raci_letter, created_by)
  values (v_tenant, v_project, 'work_item', p_work_item_id, trim(p_role_key), p_raci_letter, v_caller)
  on conflict (target_type, target_id, role_key)
    do update set raci_letter = excluded.raci_letter, updated_at = now()
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'work_item_id', p_work_item_id,
    'role_key', trim(p_role_key), 'raci_letter', p_raci_letter
  );
end;
$function$;

create or replace function public.clear_work_item_raci(
  p_work_item_id uuid, p_role_key text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_caller  uuid := auth.uid();
  v_tenant  uuid;
  v_project uuid;
  v_deleted integer;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select tenant_id, project_id into v_tenant, v_project
    from public.work_items where id = p_work_item_id and is_deleted = false;
  if not found then
    raise exception 'work item not found' using errcode = '02000';
  end if;
  if not (
    public.is_tenant_admin(v_tenant)
    or exists (select 1 from public.project_memberships pm
               where pm.project_id = v_project and pm.user_id = v_caller
                 and pm.role in ('lead','editor'))
  ) then
    raise exception 'insufficient role to edit RACI' using errcode = '42501';
  end if;

  delete from public.raci_assignments
   where target_type = 'work_item' and target_id = p_work_item_id
     and role_key = trim(p_role_key);
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('deleted', v_deleted);
end;
$function$;

revoke all on function public.set_work_item_raci(uuid,text,text) from public;
revoke all on function public.set_work_item_raci(uuid,text,text) from anon;
grant execute on function public.set_work_item_raci(uuid,text,text) to authenticated;
revoke all on function public.clear_work_item_raci(uuid,text) from public;
revoke all on function public.clear_work_item_raci(uuid,text) from anon;
grant execute on function public.clear_work_item_raci(uuid,text) to authenticated;