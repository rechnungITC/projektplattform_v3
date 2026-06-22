-- ---------------------------------------------------------------------------
-- PROJ-100a — Need-to-Know RLS Foundation (M&A Release 0)
--
-- Implements the locked design from features/PROJ-100-*.md (Tech Design) +
-- docs/decisions/ma-domain-architecture.md Fork 2/3:
--
--   Need-to-Know is an ADDITIVE confidentiality gate that sits *inside* the
--   tenant, beneath the tenant-RLS. Every request already passes the tenant
--   gate (is_tenant_member etc.). This adds a second, AND-ed gate via a
--   RESTRICTIVE policy that requires can_access_classified(...). A restrictive
--   policy is AND-ed with the existing permissive policies — the existing
--   tenant conditions are NEVER rewritten or weakened; the new gate can only
--   further restrict. Default-deny above 'standard'.
--
-- Orthogonal to Class-3 (privacy_class): confidentiality_level is the M&A
-- need-to-know axis, NOT the data-privacy axis. They are two independent
-- gates and are never mixed (Fork 3).
--
-- Scope 100a: levels + per-object level column on the Release-0 foundation
-- tables (projects/phases/work_items) + clearance table + the gate helper +
-- restrictive policies + admin/lead-only grant/revoke RPCs with audit.
-- NOT in 100a (-> 100b): permission profiles, 4-eyes, who-can-see-what view.
-- ---------------------------------------------------------------------------

-- Section 1: ordered confidentiality-level type ------------------------------
-- Ordered by declaration: standard < confidential < strict. Enum comparison
-- operators (>=, <) follow declaration order, which is what the gate needs.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'ma_confidentiality_level') then
    create type public.ma_confidentiality_level as enum ('standard', 'confidential', 'strict');
  end if;
end $$;

-- Section 2: per-object level on the Release-0 foundation tables --------------
-- Default 'standard' => existing rows stay visible to every tenant member
-- exactly as today (the gate is a no-op at 'standard').
alter table public.projects   add column if not exists confidentiality_level public.ma_confidentiality_level not null default 'standard';
alter table public.phases     add column if not exists confidentiality_level public.ma_confidentiality_level not null default 'standard';
alter table public.work_items add column if not exists confidentiality_level public.ma_confidentiality_level not null default 'standard';

-- Section 3: clearance (inner-circle membership) -----------------------------
-- Highest level a user is cleared for, per (tenant, project). Multi-tenant
-- invariant: tenant_id NOT NULL REFERENCES tenants ON DELETE CASCADE.
create table if not exists public.ma_confidentiality_clearances (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  max_level   public.ma_confidentiality_level not null,
  valid_until timestamptz,
  granted_by  uuid references public.profiles(id),
  granted_at  timestamptz not null default now(),
  unique (tenant_id, project_id, user_id)
);

create index if not exists ma_clearances_lookup_idx
  on public.ma_confidentiality_clearances (project_id, user_id);
create index if not exists ma_clearances_tenant_idx
  on public.ma_confidentiality_clearances (tenant_id);

alter table public.ma_confidentiality_clearances enable row level security;

-- SELECT: only the people who manage clearances (tenant-admin or project-lead)
-- may read the inner-circle composition. Broad "who-can-see-what" view is 100b.
drop policy if exists ma_clearances_select_managers on public.ma_confidentiality_clearances;
create policy ma_clearances_select_managers on public.ma_confidentiality_clearances
  for select to authenticated
  using (
    public.is_tenant_admin(tenant_id)
    or public.is_project_lead(project_id)
  );

-- No direct INSERT/UPDATE/DELETE for authenticated: all mutations go through
-- the SECURITY DEFINER RPCs below. This structurally blocks self-grant
-- escalation (pentest vector 2) — an end user simply cannot write this table.

-- Section 4: the confidentiality gate ----------------------------------------
-- SECURITY DEFINER + STABLE, mirrors is_tenant_member (PROJ-1): reads the
-- clearance table as the function owner so it is usable inside RLS without
-- recursion. Returns true iff the current user may access an object that
-- carries level p_level in project p_project_id.
--
--   * 'standard'           -> always true (tenant gate already governs it)
--   * tenant-admin         -> always true (administers everything; also
--                             bootstraps the first clearance / classification)
--   * otherwise            -> a non-expired clearance with max_level >= p_level
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

  return exists (
    select 1
    from public.ma_confidentiality_clearances c
    where c.project_id = p_project_id
      and c.user_id = auth.uid()
      and c.max_level >= p_level
      and (c.valid_until is null or c.valid_until > now())
  );
end;
$$;

comment on function public.can_access_classified(uuid, public.ma_confidentiality_level) is
  'PROJ-100a need-to-know gate: true if auth.uid() may access an object at the given confidentiality level in the given project. Standard=open, tenant-admin=full, else requires a non-expired clearance >= level. Orthogonal to privacy_class (Class-3).';

revoke execute on function public.can_access_classified(uuid, public.ma_confidentiality_level) from public;
grant execute on function public.can_access_classified(uuid, public.ma_confidentiality_level) to authenticated;

-- Section 5: restrictive gate policies (additive — AND-ed with existing) ------
-- These do NOT replace any tenant policy. A restrictive policy is AND-ed with
-- the OR of all permissive policies, so the tenant conditions stay fully in
-- force and this only narrows access. SELECT/UPDATE/DELETE are gated (a user
-- who may not see a classified row must not blind-write it either). INSERT is
-- ungated: new rows default to 'standard'; raising classification is an UPDATE
-- whose WITH-CHECK (= USING here) requires clearance for the new level — you
-- cannot classify above your own clearance.

-- projects: the object's own id is the project scope
drop policy if exists projects_confidentiality_gate on public.projects;
create policy projects_confidentiality_gate on public.projects
  as restrictive for select to authenticated
  using (public.can_access_classified(id, confidentiality_level));
drop policy if exists projects_confidentiality_gate_write on public.projects;
create policy projects_confidentiality_gate_write on public.projects
  as restrictive for update to authenticated
  using (public.can_access_classified(id, confidentiality_level));
drop policy if exists projects_confidentiality_gate_delete on public.projects;
create policy projects_confidentiality_gate_delete on public.projects
  as restrictive for delete to authenticated
  using (public.can_access_classified(id, confidentiality_level));

-- phases
drop policy if exists phases_confidentiality_gate on public.phases;
create policy phases_confidentiality_gate on public.phases
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists phases_confidentiality_gate_write on public.phases;
create policy phases_confidentiality_gate_write on public.phases
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists phases_confidentiality_gate_delete on public.phases;
create policy phases_confidentiality_gate_delete on public.phases
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

-- work_items
drop policy if exists work_items_confidentiality_gate on public.work_items;
create policy work_items_confidentiality_gate on public.work_items
  as restrictive for select to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists work_items_confidentiality_gate_write on public.work_items;
create policy work_items_confidentiality_gate_write on public.work_items
  as restrictive for update to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));
drop policy if exists work_items_confidentiality_gate_delete on public.work_items;
create policy work_items_confidentiality_gate_delete on public.work_items
  as restrictive for delete to authenticated
  using (public.can_access_classified(project_id, confidentiality_level));

-- Section 6: grant / revoke RPCs (admin or project-lead only) -----------------
-- All clearance mutations funnel through these. They enforce authority,
-- enforce the multi-tenant invariant (project's tenant), and write an explicit
-- audit_log_entries row (PROJ-10 table) for the grant/revoke event — the
-- UPDATE-only record_audit_changes trigger cannot capture INSERT/DELETE, so
-- the RPC logs into the same single audit system directly.
create or replace function public.grant_confidentiality_clearance(
  p_project_id uuid,
  p_user_id uuid,
  p_max_level public.ma_confidentiality_level,
  p_valid_until timestamptz default null
)
returns public.ma_confidentiality_clearances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_row public.ma_confidentiality_clearances;
  v_actor uuid := auth.uid();
begin
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to grant clearances' using errcode = '42501';
  end if;

  -- target must be a member of the same tenant (no cross-tenant grant)
  if not exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = v_tenant and m.user_id = p_user_id
  ) then
    raise exception 'target user is not a member of this tenant' using errcode = '42501';
  end if;

  insert into public.ma_confidentiality_clearances
    (tenant_id, project_id, user_id, max_level, valid_until, granted_by)
  values (v_tenant, p_project_id, p_user_id, p_max_level, p_valid_until, v_actor)
  on conflict (tenant_id, project_id, user_id)
  do update set max_level = excluded.max_level,
                valid_until = excluded.valid_until,
                granted_by = excluded.granted_by,
                granted_at = now()
  returning * into v_row;

  insert into public.audit_log_entries
    (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
  values
    (v_tenant, 'ma_confidentiality_clearances', v_row.id, 'max_level',
     null, to_jsonb(p_max_level::text), v_actor,
     nullif(current_setting('audit.change_reason', true), ''));

  return v_row;
end;
$$;

revoke execute on function public.grant_confidentiality_clearance(uuid, uuid, public.ma_confidentiality_level, timestamptz) from public;
grant execute on function public.grant_confidentiality_clearance(uuid, uuid, public.ma_confidentiality_level, timestamptz) to authenticated;

create or replace function public.revoke_confidentiality_clearance(
  p_project_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_id uuid;
  v_actor uuid := auth.uid();
begin
  select tenant_id into v_tenant from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to revoke clearances' using errcode = '42501';
  end if;

  delete from public.ma_confidentiality_clearances
  where tenant_id = v_tenant and project_id = p_project_id and user_id = p_user_id
  returning id into v_id;

  if v_id is not null then
    insert into public.audit_log_entries
      (tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, change_reason)
    values
      (v_tenant, 'ma_confidentiality_clearances', v_id, 'max_level',
       to_jsonb('revoked'::text), null, v_actor,
       nullif(current_setting('audit.change_reason', true), ''));
  end if;
end;
$$;

revoke execute on function public.revoke_confidentiality_clearance(uuid, uuid) from public;
grant execute on function public.revoke_confidentiality_clearance(uuid, uuid) to authenticated;

-- Section 7: audit the confidentiality_level changes on the foundation tables -
-- record_audit_changes() (PROJ-10, UPDATE-only) already runs on
-- projects/phases/work_items; adding 'confidentiality_level' to their
-- whitelist makes every reclassification field-level audited. The function is
-- reproduced verbatim from 20260513140000_proj34_gamma2 with only the three
-- confidentiality_level additions.
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
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;
