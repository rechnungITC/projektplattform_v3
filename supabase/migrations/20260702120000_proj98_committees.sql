-- ---------------------------------------------------------------------------
-- PROJ-98 — Committees & steering bodies (M&A governance)
--
-- Implements features/PROJ-98-*.md Tech Design (CIA GO with ADJUST, 2026-07-01).
-- EXTEND on the deployed PROJ-112 (dd_streams) backbone recipe.
--
-- Two tables:
--   * committees — per-project governance body (SteerCo / Core Team / IMO …).
--     Adopts the PROJ-100a need-to-know recipe (confidentiality_level + 3
--     RESTRICTIVE policies) so the PROJ-99/128 advisor/NDA gate wraps it for
--     free. Field-level audited (PROJ-10) incl. a can_read_audit_entry branch.
--   * committee_members — stakeholder-centric membership (stakeholder_id NOT
--     NULL; the platform-user link inherits via stakeholders.linked_user_id →
--     invariant #4). Visibility inherits from the parent committee (EXISTS gate),
--     so the confidentiality level applies transitively.
--
-- All mutations go through SECURITY DEFINER RPCs with NO actor param (auth.uid()
-- only, execute revoked from public/anon — PROJ-94 impersonation lesson). RLS
-- policies are a defense-in-depth backstop for any direct PostgREST write.
--
-- Idempotent (create ... if not exists / create or replace / drop ... if exists).
-- ---------------------------------------------------------------------------

-- Section 0: extend the audit entity-type CHECK BEFORE any write -------------
-- (PROJ-114-H-1 lesson: the CHECK must already allow the new entity types
-- before the record_audit_changes trigger fires the first UPDATE.) Recreated
-- verbatim from the live constraint + 'committees' + 'committee_members'.
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
      'ma_confidentiality_clearances','ma_clearance_profiles',
      'ma_advisor_profiles','ma_ndas','ma_nda_assignments','dd_streams',
      'ma_clearance_grant_requests','ma_clearance_approval_policies',
      'raci_assignments','dd_questions','dd_findings',
      'committees','committee_members'
    ]::text[])
  );

-- Section 1: committees — per-project governance body ------------------------
create table if not exists public.committees (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  project_id               uuid not null references public.projects(id) on delete cascade,
  name                     text not null,
  purpose                  text,
  cadence                  text,
  decision_scope           text,
  value_threshold_eur      numeric,
  value_threshold_currency text,
  escalation_scope         text,
  confidentiality_level    public.ma_confidentiality_level not null default 'standard',
  sort_order               integer not null default 0,
  created_by               uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint committees_name_not_blank check (length(btrim(name)) > 0),
  constraint committees_threshold_nonneg
    check (value_threshold_eur is null or value_threshold_eur >= 0),
  constraint committees_threshold_currency_format
    check (value_threshold_currency is null or value_threshold_currency ~ '^[A-Z]{3}$')
);

create index if not exists committees_project_idx on public.committees (project_id);
create index if not exists committees_tenant_idx on public.committees (tenant_id);

alter table public.committees enable row level security;

-- Permissive tenant/project policies (PROJ-4 pattern).
drop policy if exists committees_select on public.committees;
create policy committees_select on public.committees
  for select to authenticated
  using (public.is_project_member(project_id));

drop policy if exists committees_insert on public.committees;
create policy committees_insert on public.committees
  for insert to authenticated
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop policy if exists committees_update on public.committees;
create policy committees_update on public.committees
  for update to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

drop policy if exists committees_delete on public.committees;
create policy committees_delete on public.committees
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

-- RESTRICTIVE need-to-know gate (PROJ-100a recipe, AND-ed with the above).
drop policy if exists committees_confidentiality_gate on public.committees;
create policy committees_confidentiality_gate on public.committees
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists committees_confidentiality_gate_write on public.committees;
create policy committees_confidentiality_gate_write on public.committees
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists committees_confidentiality_gate_delete on public.committees;
create policy committees_confidentiality_gate_delete on public.committees
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

drop trigger if exists committees_set_updated_at on public.committees;
create trigger committees_set_updated_at
  before update on public.committees
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists audit_changes_committees on public.committees;
create trigger audit_changes_committees
  after update on public.committees
  for each row execute function public.record_audit_changes();

-- Section 2: committee_members — stakeholder-centric membership --------------
create table if not exists public.committee_members (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  committee_id       uuid not null references public.committees(id) on delete cascade,
  stakeholder_id     uuid not null references public.stakeholders(id) on delete cascade,
  role_in_committee  text not null default 'member'
    check (role_in_committee in ('chair','member','observer')),
  is_voting          boolean not null default true,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  unique (committee_id, stakeholder_id)
);

create index if not exists committee_members_committee_idx on public.committee_members (committee_id);
create index if not exists committee_members_stakeholder_idx on public.committee_members (stakeholder_id);
create index if not exists committee_members_tenant_idx on public.committee_members (tenant_id);

alter table public.committee_members enable row level security;

-- Visibility inherits from the parent committee: the EXISTS subquery only sees
-- committees the caller may SELECT (already member + need-to-know gated), so the
-- confidentiality level applies transitively without a second gate.
drop policy if exists committee_members_select on public.committee_members;
create policy committee_members_select on public.committee_members
  for select to authenticated
  using (exists (select 1 from public.committees c where c.id = committee_id));

drop policy if exists committee_members_insert on public.committee_members;
create policy committee_members_insert on public.committee_members
  for insert to authenticated
  with check (exists (
    select 1 from public.committees c
    where c.id = committee_id
      and (public.is_tenant_admin(c.tenant_id) or public.is_project_lead(c.project_id))
  ));

drop policy if exists committee_members_update on public.committee_members;
create policy committee_members_update on public.committee_members
  for update to authenticated
  using (exists (
    select 1 from public.committees c
    where c.id = committee_id
      and (public.is_tenant_admin(c.tenant_id) or public.is_project_lead(c.project_id))
  ))
  with check (exists (
    select 1 from public.committees c
    where c.id = committee_id
      and (public.is_tenant_admin(c.tenant_id) or public.is_project_lead(c.project_id))
  ));

drop policy if exists committee_members_delete on public.committee_members;
create policy committee_members_delete on public.committee_members
  for delete to authenticated
  using (exists (
    select 1 from public.committees c
    where c.id = committee_id
      and (public.is_tenant_admin(c.tenant_id) or public.is_project_lead(c.project_id))
  ));

drop trigger if exists audit_changes_committee_members on public.committee_members;
create trigger audit_changes_committee_members
  after update on public.committee_members
  for each row execute function public.record_audit_changes();

-- Section 3: mutation RPCs (SECURITY DEFINER, no actor param) ----------------
-- Authority: tenant-admin OR project-lead; need-to-know enforced via
-- can_access_classified so you can't touch a committee at a level you can't see.

create or replace function public.create_committee(
  p_project_id               uuid,
  p_name                     text,
  p_purpose                  text default null,
  p_cadence                  text default null,
  p_decision_scope           text default null,
  p_value_threshold_eur      numeric default null,
  p_value_threshold_currency text default null,
  p_escalation_scope         text default null,
  p_confidentiality_level    public.ma_confidentiality_level default 'standard'
)
returns public.committees
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  uuid := auth.uid();
  v_tenant  uuid;
  v_row     public.committees;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'insufficient role to create committee' using errcode = '42501';
  end if;
  if not public.can_access_classified(p_project_id, p_confidentiality_level) then
    raise exception 'insufficient clearance for confidentiality level' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name,''))) = 0 then
    raise exception 'name required' using errcode = '22023';
  end if;

  insert into public.committees (
    tenant_id, project_id, name, purpose, cadence, decision_scope,
    value_threshold_eur, value_threshold_currency, escalation_scope,
    confidentiality_level, created_by
  ) values (
    v_tenant, p_project_id, btrim(p_name), p_purpose, p_cadence, p_decision_scope,
    p_value_threshold_eur, p_value_threshold_currency, p_escalation_scope,
    coalesce(p_confidentiality_level, 'standard'), v_caller
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.update_committee(
  p_committee_id             uuid,
  p_name                     text,
  p_purpose                  text default null,
  p_cadence                  text default null,
  p_decision_scope           text default null,
  p_value_threshold_eur      numeric default null,
  p_value_threshold_currency text default null,
  p_escalation_scope         text default null,
  p_confidentiality_level    public.ma_confidentiality_level default null
)
returns public.committees
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller   uuid := auth.uid();
  v_c        public.committees;
  v_new_lvl  public.ma_confidentiality_level;
  v_row      public.committees;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_c from public.committees where id = p_committee_id;
  if v_c.id is null then
    raise exception 'committee not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_c.tenant_id) or public.is_project_lead(v_c.project_id)) then
    raise exception 'insufficient role to update committee' using errcode = '42501';
  end if;
  v_new_lvl := coalesce(p_confidentiality_level, v_c.confidentiality_level);
  -- Need clearance for BOTH the current and target level (no downgrade blindspot).
  if not public.can_access_classified(v_c.project_id, v_c.confidentiality_level)
     or not public.can_access_classified(v_c.project_id, v_new_lvl) then
    raise exception 'insufficient clearance for confidentiality level' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name,''))) = 0 then
    raise exception 'name required' using errcode = '22023';
  end if;

  update public.committees set
    name                     = btrim(p_name),
    purpose                  = p_purpose,
    cadence                  = p_cadence,
    decision_scope           = p_decision_scope,
    value_threshold_eur      = p_value_threshold_eur,
    value_threshold_currency = p_value_threshold_currency,
    escalation_scope         = p_escalation_scope,
    confidentiality_level    = v_new_lvl,
    updated_at               = now()
  where id = p_committee_id
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.delete_committee(p_committee_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_c      public.committees;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_c from public.committees where id = p_committee_id;
  if v_c.id is null then
    raise exception 'committee not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_c.tenant_id) or public.is_project_lead(v_c.project_id)) then
    raise exception 'insufficient role to delete committee' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_c.project_id, v_c.confidentiality_level) then
    raise exception 'insufficient clearance for confidentiality level' using errcode = '42501';
  end if;
  delete from public.committees where id = p_committee_id;
end;
$$;

create or replace function public.add_committee_member(
  p_committee_id      uuid,
  p_stakeholder_id    uuid,
  p_role_in_committee text default 'member',
  p_is_voting         boolean default true
)
returns public.committee_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller   uuid := auth.uid();
  v_c        public.committees;
  v_sk_proj  uuid;
  v_sk_ten   uuid;
  v_row      public.committee_members;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_c from public.committees where id = p_committee_id;
  if v_c.id is null then
    raise exception 'committee not found' using errcode = 'P0002';
  end if;
  if not (public.is_tenant_admin(v_c.tenant_id) or public.is_project_lead(v_c.project_id)) then
    raise exception 'insufficient role to add committee member' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_c.project_id, v_c.confidentiality_level) then
    raise exception 'insufficient clearance for confidentiality level' using errcode = '42501';
  end if;
  if coalesce(p_role_in_committee,'member') not in ('chair','member','observer') then
    raise exception 'invalid role_in_committee %', p_role_in_committee using errcode = '22023';
  end if;

  -- H5: stakeholder must belong to the SAME project + tenant as the committee.
  select project_id, tenant_id into v_sk_proj, v_sk_ten
    from public.stakeholders where id = p_stakeholder_id;
  if v_sk_proj is null then
    raise exception 'stakeholder not found' using errcode = 'P0002';
  end if;
  if v_sk_proj <> v_c.project_id or v_sk_ten <> v_c.tenant_id then
    raise exception 'stakeholder does not belong to this project' using errcode = '23514';
  end if;

  insert into public.committee_members (
    tenant_id, committee_id, stakeholder_id, role_in_committee, is_voting, created_by
  ) values (
    v_c.tenant_id, p_committee_id, p_stakeholder_id,
    coalesce(p_role_in_committee,'member'), coalesce(p_is_voting,true), v_caller
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.update_committee_member(
  p_member_id         uuid,
  p_role_in_committee text default null,
  p_is_voting         boolean default null
)
returns public.committee_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_m      public.committee_members;
  v_c      public.committees;
  v_row    public.committee_members;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_m from public.committee_members where id = p_member_id;
  if v_m.id is null then
    raise exception 'committee member not found' using errcode = 'P0002';
  end if;
  select * into v_c from public.committees where id = v_m.committee_id;
  if not (public.is_tenant_admin(v_c.tenant_id) or public.is_project_lead(v_c.project_id)) then
    raise exception 'insufficient role to update committee member' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_c.project_id, v_c.confidentiality_level) then
    raise exception 'insufficient clearance for confidentiality level' using errcode = '42501';
  end if;
  if p_role_in_committee is not null
     and p_role_in_committee not in ('chair','member','observer') then
    raise exception 'invalid role_in_committee %', p_role_in_committee using errcode = '22023';
  end if;

  update public.committee_members set
    role_in_committee = coalesce(p_role_in_committee, role_in_committee),
    is_voting         = coalesce(p_is_voting, is_voting)
  where id = p_member_id
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.remove_committee_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_m      public.committee_members;
  v_c      public.committees;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_m from public.committee_members where id = p_member_id;
  if v_m.id is null then
    raise exception 'committee member not found' using errcode = 'P0002';
  end if;
  select * into v_c from public.committees where id = v_m.committee_id;
  if not (public.is_tenant_admin(v_c.tenant_id) or public.is_project_lead(v_c.project_id)) then
    raise exception 'insufficient role to remove committee member' using errcode = '42501';
  end if;
  if not public.can_access_classified(v_c.project_id, v_c.confidentiality_level) then
    raise exception 'insufficient clearance for confidentiality level' using errcode = '42501';
  end if;
  delete from public.committee_members where id = p_member_id;
end;
$$;

revoke execute on function public.create_committee(uuid,text,text,text,text,numeric,text,text,public.ma_confidentiality_level) from public, anon;
grant  execute on function public.create_committee(uuid,text,text,text,text,numeric,text,text,public.ma_confidentiality_level) to authenticated;
revoke execute on function public.update_committee(uuid,text,text,text,text,numeric,text,text,public.ma_confidentiality_level) from public, anon;
grant  execute on function public.update_committee(uuid,text,text,text,text,numeric,text,text,public.ma_confidentiality_level) to authenticated;
revoke execute on function public.delete_committee(uuid) from public, anon;
grant  execute on function public.delete_committee(uuid) to authenticated;
revoke execute on function public.add_committee_member(uuid,uuid,text,boolean) from public, anon;
grant  execute on function public.add_committee_member(uuid,uuid,text,boolean) to authenticated;
revoke execute on function public.update_committee_member(uuid,text,boolean) from public, anon;
grant  execute on function public.update_committee_member(uuid,text,boolean) to authenticated;
revoke execute on function public.remove_committee_member(uuid) from public, anon;
grant  execute on function public.remove_committee_member(uuid) to authenticated;

-- Section 4: audit wiring — recreate _tracked_audit_columns + can_read_audit_entry
-- verbatim from the live definitions + 'committees'/'committee_members' branches.
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
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
    when 'committee_members' then array['stakeholder_id','role_in_committee','is_voting'] else array[]::text[]
  end
$$;

create or replace function public.can_read_audit_entry(p_entity_type text, p_entity_id uuid, p_tenant_id uuid)
returns boolean
language plpgsql
stable security definer
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
    else return false;
  end case;
  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$function$;
