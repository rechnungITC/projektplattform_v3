-- =============================================================================
-- PROJ-16: Master Data Overrides
-- =============================================================================
-- tenant_project_type_overrides — additive deltas to the code-defined
--   PROJECT_TYPE_CATALOG. Whitelist enforced at the API layer (Zod);
--   DB stores `overrides jsonb`.
-- tenant_method_overrides — per-tenant enable/disable for the code-defined
--   METHOD_TEMPLATES (scrum, kanban, safe, waterfall, pmi, prince2, vxt2).
--
-- Both tables tenant-admin-only (RLS) + audited per PROJ-10.
-- A BEFORE-trigger on tenant_method_overrides enforces the invariant
-- "at least one method enabled per tenant", race-safe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tenant_project_type_overrides
-- ---------------------------------------------------------------------------
create table public.tenant_project_type_overrides (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  type_key        text not null,
  overrides       jsonb not null default '{}'::jsonb,
  updated_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tpto_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint tpto_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete restrict,
  constraint tpto_type_key_format
    check (type_key in ('erp','construction','software','general'))
);

create unique index tenant_project_type_overrides_unique
  on public.tenant_project_type_overrides (tenant_id, type_key);

alter table public.tenant_project_type_overrides enable row level security;

create policy "tpto_admin_select"
  on public.tenant_project_type_overrides for select
  using (public.is_tenant_admin(tenant_id));

create policy "tpto_admin_insert"
  on public.tenant_project_type_overrides for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "tpto_admin_update"
  on public.tenant_project_type_overrides for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "tpto_admin_delete"
  on public.tenant_project_type_overrides for delete
  using (public.is_tenant_admin(tenant_id));

create trigger tpto_set_updated_at
  before update on public.tenant_project_type_overrides
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- tenant_method_overrides
-- ---------------------------------------------------------------------------
create table public.tenant_method_overrides (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  method_key      text not null,
  enabled         boolean not null,
  updated_by      uuid not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tmo_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint tmo_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete restrict,
  constraint tmo_method_key_format
    check (method_key in ('scrum','kanban','safe','waterfall','pmi','prince2','vxt2'))
);

create unique index tenant_method_overrides_unique
  on public.tenant_method_overrides (tenant_id, method_key);

alter table public.tenant_method_overrides enable row level security;

create policy "tmo_admin_select"
  on public.tenant_method_overrides for select
  using (public.is_tenant_admin(tenant_id));

create policy "tmo_admin_insert"
  on public.tenant_method_overrides for insert
  with check (public.is_tenant_admin(tenant_id));

create policy "tmo_admin_update"
  on public.tenant_method_overrides for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "tmo_admin_delete"
  on public.tenant_method_overrides for delete
  using (public.is_tenant_admin(tenant_id));

create trigger tmo_set_updated_at
  before update on public.tenant_method_overrides
  for each row execute procedure extensions.moddatetime ('updated_at');


-- ---------------------------------------------------------------------------
-- "at least one method enabled" invariant
-- ---------------------------------------------------------------------------
-- Effectively-enabled = methods NOT in the override-set with enabled=false.
-- Default for a method without an override row is "enabled=true".
-- The trigger fires BEFORE INSERT/UPDATE/DELETE and computes the resulting
-- effectively-enabled count for the affected tenant. If 0, it raises with
-- errcode P0001 → API maps to 422.
--
-- Hardcoded valid-method-keys list mirrors METHOD_TEMPLATES in TS code; if
-- the code-side list grows, this trigger must grow in lockstep (migration).
-- ---------------------------------------------------------------------------
create or replace function public._valid_method_keys()
returns text[]
language sql
immutable
security definer
set search_path = public
as $func$
  select array['scrum','kanban','safe','waterfall','pmi','prince2','vxt2']::text[]
$func$;

create or replace function public.enforce_min_one_method_enabled()
returns trigger
language plpgsql
set search_path = public
as $func$
declare
  v_tenant uuid;
  v_disabled_count int;
  v_valid_count int;
begin
  v_tenant := coalesce(NEW.tenant_id, OLD.tenant_id);

  -- Count valid methods that are explicitly disabled for this tenant
  -- AFTER this operation. We have to simulate the post-state.
  if (TG_OP = 'DELETE') then
    select count(*) into v_disabled_count
    from public.tenant_method_overrides
    where tenant_id = v_tenant
      and enabled = false
      and method_key = any(public._valid_method_keys())
      and id <> OLD.id;
  else
    -- INSERT or UPDATE: combine the existing rows (excluding the affected
    -- row by id) with the NEW row state.
    select count(*) into v_disabled_count
    from (
      select method_key, enabled
      from public.tenant_method_overrides
      where tenant_id = v_tenant
        and method_key = any(public._valid_method_keys())
        and (TG_OP = 'INSERT' or id <> NEW.id)
      union all
      select NEW.method_key, NEW.enabled
    ) merged
    where enabled = false;
  end if;

  v_valid_count := array_length(public._valid_method_keys(), 1);

  if v_disabled_count >= v_valid_count then
    raise exception 'min_one_method_enabled: tenant must keep at least one method enabled'
      using errcode = 'P0001';
  end if;

  if (TG_OP = 'DELETE') then return OLD; else return NEW; end if;
end;
$func$;

create trigger enforce_min_one_method
  before insert or update or delete on public.tenant_method_overrides
  for each row execute function public.enforce_min_one_method_enabled();


-- ---------------------------------------------------------------------------
-- Audit whitelist + tracked-columns extension
-- ---------------------------------------------------------------------------
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items',
      'tenants','tenant_settings',
      'communication_outbox',
      'resources','work_item_resources',
      'tenant_project_type_overrides','tenant_method_overrides'
    )
  );

create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public
as $func$
  select case p_table
    when 'stakeholders' then array['name','role_key','org_unit','contact_email','contact_phone','influence','impact','linked_user_id','notes','is_active','kind','origin']
    when 'work_items' then array['title','description','status','priority','responsible_user_id','kind','sprint_id','parent_id','story_points']
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides']
    when 'communication_outbox' then array['status','error_detail','sent_at']
    when 'resources' then array['display_name','kind','fte_default','availability_default','is_active','linked_user_id']
    when 'work_item_resources' then array['allocation_pct']
    when 'tenant_project_type_overrides' then array['overrides']
    when 'tenant_method_overrides' then array['enabled']
    else array[]::text[]
  end
$func$;

create or replace function public.can_read_audit_entry(
  p_entity_type text,
  p_entity_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $func$
declare
  v_project uuid;
begin
  if public.is_tenant_admin(p_tenant_id) then
    return true;
  end if;

  case p_entity_type
    when 'projects' then v_project := p_entity_id;
    when 'stakeholders' then
      select project_id into v_project from public.stakeholders where id = p_entity_id;
    when 'work_items' then
      select project_id into v_project from public.work_items where id = p_entity_id;
    when 'phases' then
      select project_id into v_project from public.phases where id = p_entity_id;
    when 'milestones' then
      select project_id into v_project from public.milestones where id = p_entity_id;
    when 'risks' then
      select project_id into v_project from public.risks where id = p_entity_id;
    when 'decisions' then
      select project_id into v_project from public.decisions where id = p_entity_id;
    when 'open_items' then
      select project_id into v_project from public.open_items where id = p_entity_id;
    when 'communication_outbox' then
      select project_id into v_project from public.communication_outbox where id = p_entity_id;
    when 'work_item_resources' then
      select project_id into v_project from public.work_item_resources where id = p_entity_id;
    when 'resources' then return false;
    when 'tenant_project_type_overrides' then return false;
    when 'tenant_method_overrides' then return false;
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$func$;

create trigger audit_changes_tpto
  after update on public.tenant_project_type_overrides
  for each row execute function public.record_audit_changes();

create trigger audit_changes_tmo
  after update on public.tenant_method_overrides
  for each row execute function public.record_audit_changes();
