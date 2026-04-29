-- =============================================================================
-- PROJ-17: Tenant Administration — base data + tenant_settings (MVP slice)
-- =============================================================================
-- 1. Extend tenants with language + branding
-- 2. Create tenant_settings (1:1, admin-only RLS, JSONB config blob)
-- 3. Trigger to bootstrap a tenant_settings row on tenant insert
-- 4. Backfill existing tenants with default settings
-- 5. Extend PROJ-10 audit whitelist + tracked columns + UPDATE triggers so
--    admin actions on tenants.language/branding and tenant_settings.* are
--    audit-logged per the spec
-- =============================================================================

-- Section 1: tenants.language + tenants.branding
alter table public.tenants
  add column language text not null default 'de',
  add column branding jsonb not null default '{}'::jsonb;

alter table public.tenants
  add constraint tenants_language_check check (language in ('de','en'));

alter table public.tenants
  add constraint tenants_branding_shape_check check (
    jsonb_typeof(branding) = 'object'
  );

-- Section 2: tenant_settings
create table public.tenant_settings (
  tenant_id              uuid primary key,
  active_modules         jsonb not null default '["risks","decisions","ai_proposals","audit_reports"]'::jsonb,
  privacy_defaults       jsonb not null default '{"default_class":3}'::jsonb,
  ai_provider_config     jsonb not null default '{"external_provider":"none"}'::jsonb,
  retention_overrides    jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint tenant_settings_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint tenant_settings_active_modules_array
    check (jsonb_typeof(active_modules) = 'array'),
  constraint tenant_settings_privacy_default_class_range
    check (
      (privacy_defaults->>'default_class')::int between 1 and 3
    ),
  constraint tenant_settings_external_provider_check
    check (
      ai_provider_config->>'external_provider' in ('anthropic','none')
    ),
  constraint tenant_settings_retention_shape
    check (jsonb_typeof(retention_overrides) = 'object')
);

create index tenant_settings_tenant_idx on public.tenant_settings (tenant_id);

alter table public.tenant_settings enable row level security;

create policy "tenant_settings_select_admin"
  on public.tenant_settings for select
  using (public.is_tenant_admin(tenant_id));

create policy "tenant_settings_update_admin"
  on public.tenant_settings for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- INSERT happens only via the AFTER-INSERT trigger (SECURITY DEFINER) and
-- the backfill below — no INSERT policy for users.

create trigger tenant_settings_set_updated_at
  before update on public.tenant_settings
  for each row execute procedure extensions.moddatetime ('updated_at');

-- Section 3: AFTER-INSERT trigger on tenants
create or replace function public.tenants_after_insert_bootstrap_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_settings (tenant_id) values (NEW.id)
  on conflict (tenant_id) do nothing;
  return NEW;
end;
$$;

revoke execute on function public.tenants_after_insert_bootstrap_settings() from public, anon, authenticated;

create trigger tenants_bootstrap_settings
  after insert on public.tenants
  for each row execute function public.tenants_after_insert_bootstrap_settings();

-- Section 4: Backfill existing tenants
insert into public.tenant_settings (tenant_id)
  select id from public.tenants
   where id not in (select tenant_id from public.tenant_settings)
on conflict (tenant_id) do nothing;

-- Section 5: PROJ-10 audit hook extensions
alter table public.audit_log_entries
  drop constraint audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'stakeholders','work_items','phases','milestones','projects',
      'risks','decisions','open_items',
      'tenants','tenant_settings'
    )
  );

create or replace function public._tracked_audit_columns(p_table text)
returns text[]
language sql
immutable
security definer
set search_path = public
as $$
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
    else array[]::text[]
  end
$$;

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
as $$
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
    when 'tenants' then return false;
    when 'tenant_settings' then return false;
    else return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

create trigger audit_changes_tenants
  after update on public.tenants
  for each row execute function public.record_audit_changes();

create trigger audit_changes_tenant_settings
  after update on public.tenant_settings
  for each row execute function public.record_audit_changes();
