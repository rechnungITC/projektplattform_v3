-- =============================================================================
-- PROJ-62: Organization Master Data + Tree-View
-- =============================================================================
--
-- Purpose
--   Stammdaten-Backbone fuer die Unternehmensorganisation eines Tenants.
--   Liefert eine selbstreferenzierende `organization_units`-Hierarchie + eine
--   Standorte-Tabelle + 3 nullable FK-Spalten an existierenden Identitaets-
--   Tabellen, ohne eine 5. Personen-Repraesentation einzufuehren (CIA-Lock
--   2026-05-09).
--
-- What this migration does
--   1. Creates `public.organization_units` (selbstreferenzierende Hierarchie).
--   2. Creates `public.locations` (Standorte als eigene Stammdaten).
--   3. Adds nullable `organization_unit_id` FK columns to `stakeholders`,
--      `resources`, `tenant_memberships` (ON DELETE SET NULL).
--   4. Adds same-tenant-parent enforcement via BEFORE INSERT/UPDATE trigger.
--   5. Extends `_tracked_audit_columns` whitelist for both new tables.
--   6. Extends `audit_log_entity_type_check` constraint.
--   7. Installs `record_audit_changes` AFTER UPDATE triggers on both tables.
--   8. Creates SECURITY-DEFINER RPC `move_organization_unit` with DB-side
--      cycle detection + same-tenant validation + optimistic-lock.
--   9. Creates SECURITY-INVOKER read-only view `tenant_organization_landscape`
--      joining org_units + vendors with a `kind` discriminator.
--  10. Adds the `organization` key to TOGGLEABLE_MODULES via tenant_settings
--      backfill + bootstrap function update (default-on for new tenants).
--
-- What this migration does NOT do
--   - No `persons` table; identity stays in stakeholders/resources/users.
--   - No `Roles` table; role_key from PROJ-6 catalog + role_rates is the
--     existing role surface.
--   - No `OrganizationRelation` polymorphic edge table; only parent_id
--     hierarchy in MVP. Other relations (`reports_to`, `responsible_for`)
--     deferred to PROJ-58 graph view.
--   - No vendor migration into organization_units; vendors stay in
--     `public.vendors` (PROJ-15) and surface via the read-only landscape view.
--
-- RLS
--   - organization_units / locations: tenant-member SELECT,
--     tenant-admin INSERT/UPDATE/DELETE.
--   - The added FK columns inherit existing parent-table RLS without change.
--
-- Reversibility
--   Pure additive on existing tables (FK columns, audit-list, constraint).
--   New tables drop cleanly. Module-toggle row entries are idempotent.
-- =============================================================================

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. locations -- created first so organization_units.location_id FK is valid
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  country text,
  city text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_name_length check (char_length(name) between 1 and 120),
  constraint locations_country_length check (country is null or char_length(country) <= 80),
  constraint locations_city_length check (city is null or char_length(city) <= 80),
  constraint locations_address_length check (address is null or char_length(address) <= 200)
);

create index if not exists locations_tenant_idx on public.locations (tenant_id);
create index if not exists locations_tenant_active_name_idx
  on public.locations (tenant_id, name)
  where is_active = true;

alter table public.locations enable row level security;

create policy "locations_select_member" on public.locations
  for select using (public.is_tenant_member(tenant_id));

create policy "locations_insert_admin" on public.locations
  for insert with check (public.is_tenant_admin(tenant_id));

create policy "locations_update_admin" on public.locations
  for update using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "locations_delete_admin" on public.locations
  for delete using (public.is_tenant_admin(tenant_id));


-- ---------------------------------------------------------------------------
-- 2. organization_units
-- ---------------------------------------------------------------------------
create table if not exists public.organization_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  parent_id uuid references public.organization_units(id) on delete restrict,
  name text not null,
  code text,
  type text not null,
  location_id uuid references public.locations(id) on delete set null,
  description text,
  is_active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_units_name_length check (char_length(name) between 1 and 200),
  constraint organization_units_code_length check (code is null or char_length(code) <= 50),
  constraint organization_units_description_length check (description is null or char_length(description) <= 2000),
  constraint organization_units_type_check check (
    type in ('group','company','department','team','project_org','external_org')
  ),
  constraint organization_units_no_self_loop check (parent_id is null or parent_id <> id)
);

create index if not exists organization_units_tenant_idx
  on public.organization_units (tenant_id);
create index if not exists organization_units_tenant_parent_idx
  on public.organization_units (tenant_id, parent_id);
create index if not exists organization_units_tenant_type_idx
  on public.organization_units (tenant_id, type)
  where is_active = true;
create unique index if not exists organization_units_tenant_code_unique
  on public.organization_units (tenant_id, code)
  where code is not null;

alter table public.organization_units enable row level security;

create policy "organization_units_select_member" on public.organization_units
  for select using (public.is_tenant_member(tenant_id));

create policy "organization_units_insert_admin" on public.organization_units
  for insert with check (public.is_tenant_admin(tenant_id));

create policy "organization_units_update_admin" on public.organization_units
  for update using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "organization_units_delete_admin" on public.organization_units
  for delete using (public.is_tenant_admin(tenant_id));


-- ---------------------------------------------------------------------------
-- 3. Same-tenant-parent + same-tenant-location enforcement.
--
-- RLS already prevents reading cross-tenant rows, but a cooperative caller
-- could still try INSERT with a parent_id that lives in a different tenant
-- (the FK only checks existence, not tenant). This BEFORE-trigger refuses
-- such writes server-side.
-- ---------------------------------------------------------------------------
create or replace function public.tg_organization_units_validate_parent_tenant_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_parent_tenant uuid;
  v_location_tenant uuid;
begin
  if NEW.parent_id is not null then
    select tenant_id into v_parent_tenant
      from public.organization_units
     where id = NEW.parent_id;
    if v_parent_tenant is null then
      raise exception 'parent_not_found' using errcode = 'P0002';
    end if;
    if v_parent_tenant <> NEW.tenant_id then
      raise exception 'cross_tenant_parent' using errcode = 'P0003';
    end if;
  end if;

  if NEW.location_id is not null then
    select tenant_id into v_location_tenant
      from public.locations
     where id = NEW.location_id;
    if v_location_tenant is null then
      raise exception 'location_not_found' using errcode = 'P0002';
    end if;
    if v_location_tenant <> NEW.tenant_id then
      raise exception 'cross_tenant_location' using errcode = 'P0003';
    end if;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.tg_organization_units_validate_parent_tenant_fn()
  from public, anon, authenticated;

drop trigger if exists organization_units_validate_parent_tenant
  on public.organization_units;
create trigger organization_units_validate_parent_tenant
  before insert or update of parent_id, location_id, tenant_id
  on public.organization_units
  for each row
  execute function public.tg_organization_units_validate_parent_tenant_fn();


-- ---------------------------------------------------------------------------
-- 4. FK columns on identity tables (nullable, ON DELETE SET NULL).
--
-- The CIA-locked design (2026-05-09) avoids a 5th persons-table by linking
-- existing identity rows to organization_units via these soft-FK columns.
-- ---------------------------------------------------------------------------
alter table public.stakeholders
  add column if not exists organization_unit_id uuid
    references public.organization_units(id) on delete set null;
create index if not exists stakeholders_organization_unit_idx
  on public.stakeholders (organization_unit_id)
  where organization_unit_id is not null;

alter table public.resources
  add column if not exists organization_unit_id uuid
    references public.organization_units(id) on delete set null;
create index if not exists resources_organization_unit_idx
  on public.resources (organization_unit_id)
  where organization_unit_id is not null;

alter table public.tenant_memberships
  add column if not exists organization_unit_id uuid
    references public.organization_units(id) on delete set null;
create index if not exists tenant_memberships_organization_unit_idx
  on public.tenant_memberships (organization_unit_id)
  where organization_unit_id is not null;


-- ---------------------------------------------------------------------------
-- 5. Audit-tracked-columns whitelist (PROJ-10 + PROJ-21 + PROJ-53-β pattern).
--
-- Recreates the function with the canonical entity-type list as of the most
-- recent migration (PROJ-53-β), then adds `organization_units` and
-- `locations` entries.
-- ---------------------------------------------------------------------------
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
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
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
      'name','code','type','parent_id','location_id','description','is_active','sort_order'
    ]
    when 'locations' then array['name','country','city','address','is_active']
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;


-- ---------------------------------------------------------------------------
-- 6. audit_log_entity_type_check — extend whitelist
-- ---------------------------------------------------------------------------
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items','tenants','tenant_settings',
      'communication_outbox','resources','work_item_resources',
      'tenant_project_type_overrides','tenant_method_overrides',
      'vendors','vendor_project_assignments','vendor_evaluations',
      'vendor_documents','compliance_tags','work_item_documents',
      'budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates',
      'work_item_cost_lines','dependencies',
      'tenant_ai_keys','tenant_ai_providers','tenant_ai_provider_priority',
      'tenant_ai_cost_caps',
      'tenant_memberships',
      'organization_units','locations'
    )
  );


-- ---------------------------------------------------------------------------
-- 7. AFTER UPDATE audit triggers on both new tables.
--
-- The `record_audit_changes` function is generic and uses
-- `_tracked_audit_columns` to know which fields to emit per entity_type.
-- ---------------------------------------------------------------------------
drop trigger if exists organization_units_audit_update on public.organization_units;
create trigger organization_units_audit_update
  after update on public.organization_units
  for each row execute function public.record_audit_changes();

drop trigger if exists locations_audit_update on public.locations;
create trigger locations_audit_update
  after update on public.locations
  for each row execute function public.record_audit_changes();


-- ---------------------------------------------------------------------------
-- 8. SECURITY DEFINER RPC: move_organization_unit
--
-- Atomic move with:
--   - tenant-admin authorization
--   - same-tenant-parent enforcement
--   - cycle detection via recursive CTE walk of descendants
--   - optimistic lock against `expected_updated_at`
--
-- Errors are raised with stable text codes that the API route maps to
-- HTTP 4xx codes.
-- ---------------------------------------------------------------------------
create or replace function public.move_organization_unit(
  p_unit_id uuid,
  p_new_parent_id uuid,
  p_expected_updated_at timestamptz
)
returns public.organization_units
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_unit public.organization_units;
  v_new_parent_tenant uuid;
  v_cycle_hit boolean;
begin
  -- 1. Load the unit (locks row for update).
  select * into v_unit
    from public.organization_units
   where id = p_unit_id
   for update;

  if not found then
    raise exception 'unit_not_found' using errcode = 'P0002';
  end if;

  -- 2. Authorization (caller must be tenant-admin of the unit's tenant).
  if not public.is_tenant_admin(v_unit.tenant_id) then
    raise exception 'forbidden' using errcode = 'P0003';
  end if;

  -- 3. Optimistic-lock check.
  if v_unit.updated_at <> p_expected_updated_at then
    raise exception 'version_conflict' using errcode = 'P0004';
  end if;

  -- 4. No-op short-circuit.
  if v_unit.parent_id is not distinct from p_new_parent_id then
    return v_unit;
  end if;

  -- 5. Self-loop is impossible (CHECK) but defend anyway.
  if p_new_parent_id = p_unit_id then
    raise exception 'cycle_detected' using errcode = 'P0001';
  end if;

  -- 6. Validate new parent (existence + same tenant).
  if p_new_parent_id is not null then
    select tenant_id into v_new_parent_tenant
      from public.organization_units
     where id = p_new_parent_id;
    if v_new_parent_tenant is null then
      raise exception 'parent_not_found' using errcode = 'P0002';
    end if;
    if v_new_parent_tenant <> v_unit.tenant_id then
      raise exception 'cross_tenant_parent' using errcode = 'P0003';
    end if;

    -- 7. Cycle-detection: walk descendants of v_unit; if any equals
    --    p_new_parent_id we'd close a loop.
    with recursive subtree as (
      select id from public.organization_units where parent_id = p_unit_id
      union all
      select c.id
        from public.organization_units c
        join subtree s on c.parent_id = s.id
    )
    select exists(select 1 from subtree where id = p_new_parent_id)
      into v_cycle_hit;

    if v_cycle_hit then
      raise exception 'cycle_detected' using errcode = 'P0001';
    end if;
  end if;

  -- 8. Apply the move. The AFTER-UPDATE audit trigger logs the parent_id
  --    change automatically.
  update public.organization_units
     set parent_id = p_new_parent_id,
         updated_at = now()
   where id = p_unit_id
   returning * into v_unit;

  return v_unit;
end;
$$;

revoke execute on function public.move_organization_unit(uuid, uuid, timestamptz)
  from public, anon;
grant execute on function public.move_organization_unit(uuid, uuid, timestamptz)
  to authenticated;


-- ---------------------------------------------------------------------------
-- 9. Read-only landscape view (org_units + vendors).
--
-- Used by the "Vendors einblenden" Tree-toggle. SECURITY INVOKER so RLS on
-- both base tables applies transitively.
-- ---------------------------------------------------------------------------
drop view if exists public.tenant_organization_landscape;
create view public.tenant_organization_landscape
with (security_invoker = true)
as
  select
    ou.id,
    ou.tenant_id,
    ou.name,
    'org_unit'::text as kind,
    ou.type as type,
    ou.parent_id,
    ou.location_id
  from public.organization_units ou
  where ou.is_active = true
  union all
  select
    v.id,
    v.tenant_id,
    v.name,
    'vendor'::text as kind,
    null::text as type,
    null::uuid as parent_id,
    null::uuid as location_id
  from public.vendors v
  where v.status = 'active';

grant select on public.tenant_organization_landscape to authenticated;


-- ---------------------------------------------------------------------------
-- 10. Module-toggle: register `organization` + idempotent backfill.
--
-- New tenants pick it up via `tenant_bootstrap_settings`; existing tenants
-- get it appended to their `active_modules` array if absent.
-- ---------------------------------------------------------------------------
update public.tenant_settings
   set active_modules = active_modules || '["organization"]'::jsonb
 where not (active_modules @> '["organization"]'::jsonb);

create or replace function public.tenant_bootstrap_settings(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.tenant_settings (tenant_id, active_modules)
  values (
    p_tenant_id,
    '["risks","decisions","ai_proposals","audit_reports","output_rendering","organization"]'::jsonb
  )
  on conflict (tenant_id) do update
    set active_modules = case
      when public.tenant_settings.active_modules @> '["organization"]'::jsonb
        then public.tenant_settings.active_modules
      else public.tenant_settings.active_modules || '["organization"]'::jsonb
    end;
end;
$$;

revoke execute on function public.tenant_bootstrap_settings(uuid)
  from public, anon, authenticated;


-- =============================================================================
-- End of PROJ-62 migration.
-- =============================================================================