-- =============================================================================
-- PROJ-10: Field-level audit + retention export log
-- =============================================================================
-- Applied via Supabase MCP on 2026-04-28. Captured here for repo history.
--
-- audit_log_entries:
--   one row per changed tracked field, written by a Postgres trigger.
--   INSERT-only via SECURITY DEFINER trigger; users cannot write directly.
--   Retention cron uses service-role to purge older-than-policy rows.
--
-- retention_export_log:
--   audits the admin /audit/export action itself (audit-on-audit).
--
-- Trigger record_audit_changes() runs on UPDATE of 5 entities; for each
-- whitelisted column whose value changed it inserts one audit row.
-- Verified live: 2 UPDATEs on projects → 2 audit rows; cleanup successful.
-- =============================================================================

-- Section 1: audit_log_entries table
create table public.audit_log_entries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  entity_type     text not null,
  entity_id       uuid not null,
  field_name      text not null,
  old_value       jsonb,
  new_value       jsonb,
  actor_user_id   uuid,
  changed_at      timestamptz not null default now(),
  change_reason   text,
  constraint audit_log_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint audit_log_entity_type_check check (
    entity_type in ('stakeholders','work_items','phases','milestones','projects')
  ),
  constraint audit_log_field_name_length check (char_length(field_name) <= 100),
  constraint audit_log_change_reason_length check (
    change_reason is null or char_length(change_reason) <= 100
  )
);

create index audit_log_entity_idx
  on public.audit_log_entries (entity_type, entity_id, changed_at desc);
create index audit_log_tenant_idx
  on public.audit_log_entries (tenant_id, changed_at desc);
create index audit_log_actor_idx
  on public.audit_log_entries (actor_user_id, changed_at desc);
create index audit_log_changed_at_idx
  on public.audit_log_entries (changed_at);

alter table public.audit_log_entries enable row level security;

-- Section 2: tracked-columns whitelist function
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
    else array[]::text[]
  end
$$;

revoke execute on function public._tracked_audit_columns(text) from public;

-- Section 3: shared trigger function
create or replace function public.record_audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_columns text[];
  v_col text;
  v_old_v jsonb;
  v_new_v jsonb;
  v_old jsonb;
  v_new jsonb;
  v_actor uuid;
  v_reason text;
  v_tenant uuid;
begin
  v_columns := public._tracked_audit_columns(TG_TABLE_NAME);
  if v_columns is null or array_length(v_columns, 1) is null then
    return NEW;
  end if;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  v_actor := auth.uid();
  v_reason := nullif(current_setting('audit.change_reason', true), '');
  v_tenant := (v_new->>'tenant_id')::uuid;

  foreach v_col in array v_columns loop
    v_old_v := v_old -> v_col;
    v_new_v := v_new -> v_col;
    if v_old_v is distinct from v_new_v then
      insert into public.audit_log_entries (
        tenant_id, entity_type, entity_id, field_name,
        old_value, new_value, actor_user_id, change_reason
      ) values (
        v_tenant, TG_TABLE_NAME, (v_new->>'id')::uuid, v_col,
        v_old_v, v_new_v, v_actor, v_reason
      );
    end if;
  end loop;
  return NEW;
end;
$$;

revoke execute on function public.record_audit_changes() from public;

-- Section 4: attach the trigger to all 5 audited tables
create trigger audit_changes_stakeholders
  after update on public.stakeholders
  for each row execute function public.record_audit_changes();

create trigger audit_changes_work_items
  after update on public.work_items
  for each row execute function public.record_audit_changes();

create trigger audit_changes_phases
  after update on public.phases
  for each row execute function public.record_audit_changes();

create trigger audit_changes_milestones
  after update on public.milestones
  for each row execute function public.record_audit_changes();

create trigger audit_changes_projects
  after update on public.projects
  for each row execute function public.record_audit_changes();

-- Section 5: helper function for SELECT RLS — checks project membership for
-- the audited entity (or tenant admin shortcut).
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
    else
      return false;
  end case;

  if v_project is null then return false; end if;
  return public.is_project_member(v_project);
end;
$$;

-- Section 6: RLS policies on audit_log_entries
create policy "audit_log_select_member_or_admin"
  on public.audit_log_entries
  for select
  using (public.can_read_audit_entry(entity_type, entity_id, tenant_id));

-- Section 7: retention_export_log table
create table public.retention_export_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  actor_user_id   uuid not null,
  exported_at     timestamptz not null default now(),
  scope           jsonb not null default '{}'::jsonb,
  redaction_off   boolean not null default false,
  row_count       integer not null default 0,
  constraint rel_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint rel_actor_fkey
    foreign key (actor_user_id) references public.profiles(id) on delete cascade
);

create index rel_tenant_idx
  on public.retention_export_log (tenant_id, exported_at desc);

alter table public.retention_export_log enable row level security;

create policy "rel_select_admin"
  on public.retention_export_log
  for select
  using (public.is_tenant_admin(tenant_id));
