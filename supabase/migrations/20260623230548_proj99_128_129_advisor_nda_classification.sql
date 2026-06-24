-- ---------------------------------------------------------------------------
-- PROJ-99 / PROJ-128 / PROJ-129 — Confidentiality bundle (advisor / NDA /
-- classification), built as an EXTEND on the PROJ-100a need-to-know gate.
--
-- Three new governance tables:
--   ma_advisor_profiles   (PROJ-99)  — one external advisor per (project,user)
--   ma_ndas               (PROJ-128) — NDA register (governance object)
--   ma_nda_assignments    (PROJ-128) — NDA <-> person/organisation
--
-- Three new explicit-user gate helpers (SECURITY DEFINER STABLE), reusable by
-- both the gate (for auth.uid()) and the 129 explain RPC (for any user):
--   is_external_advisor(project, user)
--   has_active_mandate(project, user)
--   has_valid_nda(project, user, level)
--
-- The PROJ-100a gate can_access_classified(project, level) is MODIFIED (in
-- place, same signature) to AND-in the advisor NDA+mandate conditions. This is
-- ADDITIVE: it only ever NARROWS access for users who have an advisor profile
-- in the project. Tenant-admins (bypass) and internal members (no advisor
-- profile) are unaffected -> the PROJ-100a pentest stays green. Every
-- RESTRICTIVE policy that already calls the gate (projects/phases/work_items +
-- every future DD table) inherits the advisor gate automatically.
--
-- PROJ-129 adds ma_access_explain(project, level): a manager-gated read-only
-- "who-can-see, and why" RPC that mirrors the gate rule for every relevant
-- user. Like 100b's who_can_access it is an explain-view, never a second gate.
--
-- Class-3 (privacy_class) is untouched — orthogonal AI/privacy axis.
-- ---------------------------------------------------------------------------

-- Section 1: advisor_type enum + ma_advisor_profiles ------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ma_advisor_type') then
    create type public.ma_advisor_type as enum
      ('legal','tax','financial','commercial','it','hr','other');
  end if;
  if not exists (select 1 from pg_type where typname = 'ma_mandate_status') then
    create type public.ma_mandate_status as enum
      ('planned','active','expired','blocked');
  end if;
end $$;

create table if not exists public.ma_advisor_profiles (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  organization        text not null,
  advisor_type        public.ma_advisor_type not null,
  mandate_start       date,
  mandate_end         date,
  mandate_status      public.ma_mandate_status not null default 'planned',
  responsible_user_id uuid references public.profiles(id),
  scope               text,
  notes               text,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ma_advisor_profiles_project_user_uniq unique (project_id, user_id)
);
create index if not exists ma_advisor_profiles_tenant_idx  on public.ma_advisor_profiles (tenant_id);
create index if not exists ma_advisor_profiles_project_idx on public.ma_advisor_profiles (project_id);
create index if not exists ma_advisor_profiles_user_idx    on public.ma_advisor_profiles (user_id);

alter table public.ma_advisor_profiles enable row level security;

-- SELECT: project members (which includes tenant-admins via is_project_member)
drop policy if exists ma_advisor_profiles_select on public.ma_advisor_profiles;
create policy ma_advisor_profiles_select on public.ma_advisor_profiles
  for select to authenticated
  using (public.is_project_member(project_id));

-- write: managers only (tenant-admin or project lead) — specific policies per
-- PROJ-68 hygiene (no FOR ALL). tenant_id must match the project's tenant.
drop policy if exists ma_advisor_profiles_insert on public.ma_advisor_profiles;
create policy ma_advisor_profiles_insert on public.ma_advisor_profiles
  for insert to authenticated
  with check (
    (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
    and tenant_id = (select p.tenant_id from public.projects p where p.id = project_id)
  );
drop policy if exists ma_advisor_profiles_update on public.ma_advisor_profiles;
create policy ma_advisor_profiles_update on public.ma_advisor_profiles
  for update to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));
drop policy if exists ma_advisor_profiles_delete on public.ma_advisor_profiles;
create policy ma_advisor_profiles_delete on public.ma_advisor_profiles
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

-- Section 2: ma_ndas (NDA register) -----------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ma_nda_status') then
    create type public.ma_nda_status as enum
      ('draft','in_review','valid','expired','revoked');
  end if;
  if not exists (select 1 from pg_type where typname = 'ma_nda_scope_kind') then
    create type public.ma_nda_scope_kind as enum
      ('project','phase','dd_stream','advisor_group','person');
  end if;
end $$;

create table if not exists public.ma_ndas (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  counterparty        text not null,
  responsible_user_id uuid references public.profiles(id),
  status              public.ma_nda_status not null default 'draft',
  signed_date         date,
  valid_from          date,
  valid_until         date,
  scope_kind          public.ma_nda_scope_kind not null default 'project',
  scope_ref           uuid,
  -- the maximum confidentiality level a valid instance of this NDA covers
  covered_level       public.ma_confidentiality_level not null default 'confidential',
  document_link       text,
  reminder_date       date,
  notes               text,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists ma_ndas_tenant_idx          on public.ma_ndas (tenant_id);
create index if not exists ma_ndas_project_idx         on public.ma_ndas (project_id);
create index if not exists ma_ndas_project_status_idx  on public.ma_ndas (project_id, status);

alter table public.ma_ndas enable row level security;

drop policy if exists ma_ndas_select on public.ma_ndas;
create policy ma_ndas_select on public.ma_ndas
  for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists ma_ndas_insert on public.ma_ndas;
create policy ma_ndas_insert on public.ma_ndas
  for insert to authenticated
  with check (
    (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
    and tenant_id = (select p.tenant_id from public.projects p where p.id = project_id)
  );
drop policy if exists ma_ndas_update on public.ma_ndas;
create policy ma_ndas_update on public.ma_ndas
  for update to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
  with check (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));
drop policy if exists ma_ndas_delete on public.ma_ndas;
create policy ma_ndas_delete on public.ma_ndas
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

-- Section 3: ma_nda_assignments (NDA <-> person/org) ------------------------
create table if not exists public.ma_nda_assignments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  nda_id       uuid not null references public.ma_ndas(id) on delete cascade,
  -- denormalised for fast gate/RLS lookup (no join to ma_ndas in the gate path)
  project_id   uuid not null references public.projects(id) on delete cascade,
  -- a real account is what grants platform access; contact-only rows are
  -- documentary (signatory list) and never confer access.
  user_id      uuid references public.profiles(id) on delete cascade,
  contact_name text,
  contact_org  text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  constraint ma_nda_assignments_identifies_someone
    check (user_id is not null or contact_name is not null)
);
-- one assignment per (nda, account); contact-only rows are not constrained
create unique index if not exists ma_nda_assignments_nda_user_uniq
  on public.ma_nda_assignments (nda_id, user_id) where user_id is not null;
create index if not exists ma_nda_assignments_tenant_idx        on public.ma_nda_assignments (tenant_id);
create index if not exists ma_nda_assignments_nda_idx           on public.ma_nda_assignments (nda_id);
create index if not exists ma_nda_assignments_project_user_idx  on public.ma_nda_assignments (project_id, user_id);

alter table public.ma_nda_assignments enable row level security;

drop policy if exists ma_nda_assignments_select on public.ma_nda_assignments;
create policy ma_nda_assignments_select on public.ma_nda_assignments
  for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists ma_nda_assignments_insert on public.ma_nda_assignments;
create policy ma_nda_assignments_insert on public.ma_nda_assignments
  for insert to authenticated
  with check (
    (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id))
    and tenant_id = (select p.tenant_id from public.projects p where p.id = project_id)
  );
drop policy if exists ma_nda_assignments_delete on public.ma_nda_assignments;
create policy ma_nda_assignments_delete on public.ma_nda_assignments
  for delete to authenticated
  using (public.is_tenant_admin(tenant_id) or public.is_project_lead(project_id));

-- Section 4: gate helpers (explicit-user, SECURITY DEFINER STABLE) ----------
-- All take an explicit p_user_id so they can be reused by both the gate (for
-- auth.uid()) and the 129 explain RPC (for any user). SECURITY DEFINER so they
-- read the governance tables irrespective of the caller's RLS.

create or replace function public.is_external_advisor(
  p_project_id uuid,
  p_user_id uuid
) returns boolean
language sql security definer stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.ma_advisor_profiles
    where project_id = p_project_id and user_id = p_user_id
  );
$$;
revoke execute on function public.is_external_advisor(uuid, uuid) from public, anon;
grant execute on function public.is_external_advisor(uuid, uuid) to authenticated;

create or replace function public.has_active_mandate(
  p_project_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql security definer stable
set search_path = public, pg_temp
as $$
begin
  -- not an external advisor -> mandate condition does not apply
  if not exists (
    select 1 from public.ma_advisor_profiles
    where project_id = p_project_id and user_id = p_user_id
  ) then
    return true;
  end if;
  return exists (
    select 1 from public.ma_advisor_profiles
    where project_id = p_project_id and user_id = p_user_id
      and mandate_status = 'active'
      and (mandate_end is null or mandate_end >= current_date)
  );
end;
$$;
revoke execute on function public.has_active_mandate(uuid, uuid) from public, anon;
grant execute on function public.has_active_mandate(uuid, uuid) to authenticated;

create or replace function public.has_valid_nda(
  p_project_id uuid,
  p_user_id uuid,
  p_level public.ma_confidentiality_level
) returns boolean
language plpgsql security definer stable
set search_path = public, pg_temp
as $$
begin
  if p_level = 'standard' then
    return true;
  end if;
  return exists (
    select 1
    from public.ma_nda_assignments a
    join public.ma_ndas n on n.id = a.nda_id
    where a.project_id = p_project_id
      and a.user_id = p_user_id
      and n.status = 'valid'
      and (n.valid_until is null or n.valid_until >= current_date)
      and n.covered_level >= p_level
  );
end;
$$;
revoke execute on function public.has_valid_nda(uuid, uuid, public.ma_confidentiality_level) from public, anon;
grant execute on function public.has_valid_nda(uuid, uuid, public.ma_confidentiality_level) to authenticated;

-- Section 5: MODIFY the PROJ-100a gate (additive advisor narrowing) ---------
-- Same signature, same standard/admin/clearance semantics for auth.uid() as
-- 20260616100000; the only change is the external-advisor branch, which can
-- only ever return false earlier (never widens access).
create or replace function public.can_access_classified(
  p_project_id uuid,
  p_level public.ma_confidentiality_level
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_uid uuid := auth.uid();
begin
  if p_level = 'standard' then
    return true;
  end if;

  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    return false;
  end if;

  if public.is_tenant_admin(v_tenant) then
    return true;
  end if;

  -- PROJ-99/128: external advisors additionally need an active mandate and a
  -- valid, scope-covering NDA before any clearance counts above 'standard'.
  if public.is_external_advisor(p_project_id, v_uid) then
    if not public.has_active_mandate(p_project_id, v_uid) then
      return false;
    end if;
    if not public.has_valid_nda(p_project_id, v_uid, p_level) then
      return false;
    end if;
  end if;

  return exists (
    select 1
    from public.ma_confidentiality_clearances c
    where c.project_id = p_project_id
      and c.user_id = v_uid
      and c.max_level >= p_level
      and (c.valid_until is null or c.valid_until > now())
  );
end;
$$;

comment on function public.can_access_classified(uuid, public.ma_confidentiality_level) is
  'PROJ-100a need-to-know gate (PROJ-99/128 extended): true if auth.uid() may access an object at the given confidentiality level. Standard=open, tenant-admin=full, external advisors additionally require active mandate + valid NDA >= level, then a non-expired clearance >= level. Orthogonal to privacy_class (Class-3).';

revoke execute on function public.can_access_classified(uuid, public.ma_confidentiality_level) from public, anon;
grant execute on function public.can_access_classified(uuid, public.ma_confidentiality_level) to authenticated;

-- Section 6: PROJ-129 who-can-see-and-why explain RPC -----------------------
-- Manager-gated (admin/lead). Mirrors the gate rule for every relevant user
-- (project members UNION advisors UNION clearance-holders). Admin set uses the
-- same role='admin' membership predicate as 100b who_can_access. NOT a gate.
create or replace function public.ma_access_explain(
  p_project_id uuid,
  p_level public.ma_confidentiality_level
)
returns table (
  user_id            uuid,
  is_member          boolean,
  is_external_advisor boolean,
  mandate_ok         boolean,
  nda_ok             boolean,
  cleared_level      public.ma_confidentiality_level,
  has_access         boolean,
  reason             text
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    return;
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to view the access overview' using errcode = '42501';
  end if;

  return query
  with relevant as (
    select m.user_id from public.project_memberships m where m.project_id = p_project_id
    union
    select a.user_id from public.ma_advisor_profiles a where a.project_id = p_project_id
    union
    select c.user_id from public.ma_confidentiality_clearances c where c.project_id = p_project_id
    union
    select tm.user_id from public.tenant_memberships tm where tm.tenant_id = v_tenant and tm.role = 'admin'
  )
  select
    r.user_id,
    exists (select 1 from public.project_memberships m where m.project_id = p_project_id and m.user_id = r.user_id) as is_member,
    public.is_external_advisor(p_project_id, r.user_id) as is_external_advisor,
    public.has_active_mandate(p_project_id, r.user_id) as mandate_ok,
    public.has_valid_nda(p_project_id, r.user_id, p_level) as nda_ok,
    (select c.max_level from public.ma_confidentiality_clearances c
       where c.project_id = p_project_id and c.user_id = r.user_id
         and (c.valid_until is null or c.valid_until > now())) as cleared_level,
    -- has_access mirrors can_access_classified for this user at p_level
    case
      when p_level = 'standard' then true
      when exists (select 1 from public.tenant_memberships tm
                   where tm.tenant_id = v_tenant and tm.user_id = r.user_id and tm.role = 'admin') then true
      when public.is_external_advisor(p_project_id, r.user_id)
           and (not public.has_active_mandate(p_project_id, r.user_id)
                or not public.has_valid_nda(p_project_id, r.user_id, p_level)) then false
      else exists (select 1 from public.ma_confidentiality_clearances c
                   where c.project_id = p_project_id and c.user_id = r.user_id
                     and c.max_level >= p_level
                     and (c.valid_until is null or c.valid_until > now()))
    end as has_access,
    case
      when p_level = 'standard' then 'baseline'
      when exists (select 1 from public.tenant_memberships tm
                   where tm.tenant_id = v_tenant and tm.user_id = r.user_id and tm.role = 'admin') then 'admin'
      when public.is_external_advisor(p_project_id, r.user_id)
           and not public.has_active_mandate(p_project_id, r.user_id) then 'mandate_inactive'
      when public.is_external_advisor(p_project_id, r.user_id)
           and not public.has_valid_nda(p_project_id, r.user_id, p_level) then 'nda_missing'
      when exists (select 1 from public.ma_confidentiality_clearances c
                   where c.project_id = p_project_id and c.user_id = r.user_id
                     and c.max_level >= p_level
                     and (c.valid_until is null or c.valid_until > now())) then 'cleared'
      else 'no_clearance'
    end as reason
  from relevant r;
end;
$$;
revoke execute on function public.ma_access_explain(uuid, public.ma_confidentiality_level) from public, anon;
grant execute on function public.ma_access_explain(uuid, public.ma_confidentiality_level) to authenticated;

comment on function public.ma_access_explain(uuid, public.ma_confidentiality_level) is
  'PROJ-129 read-only who-can-see-and-why: for every relevant user (project members UNION advisors UNION clearance-holders UNION tenant-admins), mirrors the can_access_classified rule and reports member/advisor/mandate/nda/clearance status + has_access + reason. Manager-gated. Explain-view, never a second gate.';

-- Section 7: audit wiring (PROJ-10) -----------------------------------------
-- entity_type CHECK must allow the new types BEFORE any write (PROJ-100a-H-1).
-- Recreate appending the 3 new types to the deployed 46-value set.
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
      'ma_advisor_profiles','ma_ndas','ma_nda_assignments'
    ]::text[])
  );

-- Append tracked columns for the new tables (reproduced verbatim from the
-- 20260623222615 / 100b version with only the 3 new entries added).
create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select case p_table
    when 'stakeholders' then array[
      'name','role_key','org_unit','contact_email','contact_phone',
      'influence','impact','linked_user_id','notes','is_active',
      'kind','origin',
      'is_approver',
      'reasoning','stakeholder_type_key','management_level',
      'decision_authority','attitude','conflict_potential',
      'communication_need','preferred_channel',
      'organization_unit_id'
    ]
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
    when 'resources' then array[
      'name','role_key','default_capacity_hours_per_day','active','external_id',
      'linked_stakeholder_id','linked_user_id','notes',
      'daily_rate_override','daily_rate_override_currency',
      'organization_unit_id'
    ]
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
    when 'organization_units' then array[
      'name','code','type','parent_id','location_id','description',
      'is_active','sort_order','import_id'
    ]
    when 'locations' then array[
      'name','code','country','city','address','is_active','import_id'
    ]
    when 'stakeholder_interactions' then array[
      'summary','channel','direction','interaction_date',
      'awaiting_response','response_due_date','response_received_date',
      'replies_to_interaction_id','deleted_at'
    ]
    when 'stakeholder_interaction_participants' then array[
      'participant_sentiment','participant_sentiment_source',
      'participant_sentiment_model','participant_sentiment_provider',
      'participant_sentiment_confidence',
      'participant_cooperation_signal','participant_cooperation_signal_source'
    ]
    when 'ma_clearance_profiles' then array['name','description','granted_level','is_active']
    when 'ma_advisor_profiles' then array['organization','advisor_type','mandate_start','mandate_end','mandate_status','responsible_user_id','scope']
    when 'ma_ndas' then array['counterparty','responsible_user_id','status','signed_date','valid_from','valid_until','scope_kind','scope_ref','covered_level','document_link','reminder_date']
    when 'ma_nda_assignments' then array['user_id','contact_name','contact_org']
    else array[]::text[]
  end
$$;
revoke execute on function public._tracked_audit_columns(text) from public;

-- UPDATE-audit triggers (status/mandate/expiry transitions are the security
-- events; creation is captured via created_by/created_at).
drop trigger if exists audit_changes_ma_advisor_profiles on public.ma_advisor_profiles;
create trigger audit_changes_ma_advisor_profiles
  after update on public.ma_advisor_profiles
  for each row execute function public.record_audit_changes();

drop trigger if exists audit_changes_ma_ndas on public.ma_ndas;
create trigger audit_changes_ma_ndas
  after update on public.ma_ndas
  for each row execute function public.record_audit_changes();