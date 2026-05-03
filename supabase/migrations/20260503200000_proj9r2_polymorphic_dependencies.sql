-- =============================================================================
-- PROJ-9 Round 2 — Polymorphic Dependencies
-- =============================================================================
-- Replaces the deployed Round-1 `dependencies` table (work-item ↔ work-item only)
-- with a polymorphic edge that connects projects, phases, work_packages, and
-- todos in any combination — within the same tenant. Cross-project dependencies
-- are now ALLOWED (ADR `project-phase-workpackage-todo-hierarchy.md` § Polymorphic
-- Dependencies).
--
-- Companion to PROJ-36-α (`20260503180000_proj36a_wbs_hierarchy_rollup.sql`).
-- That migration installed `outline_path`, `wbs_code`, `derived_*` on
-- `work_items` and is already in production. Round 2 here is the dependencies
-- half — additive on the schema side (new table), but data-migrating on the
-- old `dependencies` table (snapshot → rebuild → swap).
--
-- Migration steps (single transaction, Supabase wraps the file):
--   A. Snapshot the deployed Round-1 table to `dependencies_legacy` (rollback
--      anchor; never read by application code).
--   B. Build `dependencies_v2` with the new shape + indexes + checks.
--   C. Migrate Round-1 rows into v2 with kind-based type mapping
--      (work_package → 'work_package', everything else → 'todo').
--   D. Define trigger functions (polymorphic FK validation, tenant-boundary,
--      cycle prevention, ON-DELETE cleanup on projects/phases/work_items).
--   E. Drop the old `dependencies` table, rename `dependencies_v2`
--      to `dependencies` (one canonical name, snapshot kept under
--      `dependencies_legacy`).
--   F. Attach all triggers (BEFORE INSERT/UPDATE on `dependencies`,
--      AFTER DELETE on the three source tables).
--   G. Enable RLS + 4 policies (SELECT/INSERT/UPDATE/DELETE).
--   H. Audit-Whitelist extension (entity_type constraint + tracked-columns
--      whitelist) + audit trigger on UPDATE.
--   I. Verification: row-counts + RAISE NOTICE.
--
-- Rollback (manual, separate migration if ever needed):
--   - drop dependencies; rename dependencies_legacy → dependencies; restore
--     Round-1 triggers and policies. The Round-1 migration file is the
--     authoritative reference.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. Snapshot the existing Round-1 table.
-- ---------------------------------------------------------------------------
-- `dependencies_legacy` is the rollback anchor. It is a plain table copy (no
-- triggers, no RLS, no FKs). The application MUST NOT read from it.
drop table if exists public.dependencies_legacy;
create table public.dependencies_legacy as
  select * from public.dependencies;

comment on table public.dependencies_legacy is
  'PROJ-9-Round-2 — snapshot of the deployed Round-1 dependencies table taken '
  'just before the polymorphic rebuild. Read-only rollback anchor; no RLS, no FKs.';

-- ---------------------------------------------------------------------------
-- B. Build the new polymorphic table under a temporary name.
-- ---------------------------------------------------------------------------
create table public.dependencies_v2 (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  from_type       text not null,
  from_id         uuid not null,
  to_type         text not null,
  to_id           uuid not null,
  constraint_type text not null default 'FS',
  lag_days        integer not null default 0,
  created_at      timestamptz not null default now(),
  created_by      uuid,

  constraint dependencies_v2_tenant_fkey
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint dependencies_v2_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint dependencies_v2_from_type_check
    check (from_type in ('project','phase','work_package','todo')),
  constraint dependencies_v2_to_type_check
    check (to_type in ('project','phase','work_package','todo')),
  constraint dependencies_v2_constraint_type_check
    check (constraint_type in ('FS','SS','FF','SF')),
  constraint dependencies_v2_no_self
    check ((from_type, from_id) is distinct from (to_type, to_id)),
  constraint dependencies_v2_unique_edge
    unique (from_type, from_id, to_type, to_id, constraint_type)
);

comment on table public.dependencies_v2 is
  'PROJ-9-Round-2 — polymorphic dependency edges between project / phase / '
  'work_package / todo. Same-tenant only (trigger-enforced). Cross-project '
  'allowed within tenant. Will be renamed to `dependencies` at end of '
  'this migration.';

create index dependencies_v2_from_idx
  on public.dependencies_v2 (tenant_id, from_type, from_id);
create index dependencies_v2_to_idx
  on public.dependencies_v2 (tenant_id, to_type, to_id);
create index dependencies_v2_tenant_idx
  on public.dependencies_v2 (tenant_id);

-- ---------------------------------------------------------------------------
-- C. Data migration from Round-1 `dependencies` to `dependencies_v2`.
-- ---------------------------------------------------------------------------
-- Map kind → type:
--   work_items.kind = 'work_package' → 'work_package'
--   else (epic/feature/story/task/subtask/bug)            → 'todo'
-- The legacy snapshot in `dependencies_legacy` keeps the original payload
-- around verbatim should we need it.
do $$
declare
  v_old_count bigint;
  v_new_count bigint;
begin
  insert into public.dependencies_v2 (
    id, tenant_id, from_type, from_id, to_type, to_id,
    constraint_type, lag_days, created_at, created_by
  )
  select
    d.id,
    d.tenant_id,
    case when wi_pred.kind = 'work_package' then 'work_package' else 'todo' end as from_type,
    d.predecessor_id as from_id,
    case when wi_succ.kind = 'work_package' then 'work_package' else 'todo' end as to_type,
    d.successor_id as to_id,
    d.type as constraint_type,
    d.lag_days,
    d.created_at,
    d.created_by
  from public.dependencies d
  join public.work_items wi_pred on wi_pred.id = d.predecessor_id
  join public.work_items wi_succ on wi_succ.id = d.successor_id;

  select count(*) into v_old_count from public.dependencies;
  select count(*) into v_new_count from public.dependencies_v2;
  if v_old_count <> v_new_count then
    raise exception 'PROJ-9-R2 migration mismatch: legacy=% migrated=%',
      v_old_count, v_new_count;
  end if;
  raise notice 'PROJ-9-R2 migration: % rows migrated to dependencies_v2', v_new_count;
end $$;

-- ---------------------------------------------------------------------------
-- D. Trigger functions (defined now, attached after the table swap in F).
-- ---------------------------------------------------------------------------

-- D1. Polymorphic-FK validation (BEFORE INSERT/UPDATE).
-- Verifies that NEW.from_id resp. NEW.to_id exist in the table designated by
-- NEW.from_type / NEW.to_type. Static CASE — no dynamic SQL (defense in depth,
-- V3 convention).
create or replace function public.tg_dep_validate_polymorphic_fk_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_exists boolean;
begin
  -- from-side lookup
  case NEW.from_type
    when 'project' then
      select exists(select 1 from public.projects where id = NEW.from_id) into v_exists;
    when 'phase' then
      select exists(select 1 from public.phases where id = NEW.from_id) into v_exists;
    when 'work_package' then
      select exists(
        select 1 from public.work_items
        where id = NEW.from_id and kind = 'work_package'
      ) into v_exists;
    when 'todo' then
      select exists(
        select 1 from public.work_items
        where id = NEW.from_id and kind <> 'work_package'
      ) into v_exists;
    else
      raise exception 'unknown from_type %', NEW.from_type using errcode = '22023';
  end case;
  if not v_exists then
    raise exception 'dependency from-entity (%, %) does not exist',
      NEW.from_type, NEW.from_id using errcode = '23503';
  end if;

  -- to-side lookup
  case NEW.to_type
    when 'project' then
      select exists(select 1 from public.projects where id = NEW.to_id) into v_exists;
    when 'phase' then
      select exists(select 1 from public.phases where id = NEW.to_id) into v_exists;
    when 'work_package' then
      select exists(
        select 1 from public.work_items
        where id = NEW.to_id and kind = 'work_package'
      ) into v_exists;
    when 'todo' then
      select exists(
        select 1 from public.work_items
        where id = NEW.to_id and kind <> 'work_package'
      ) into v_exists;
    else
      raise exception 'unknown to_type %', NEW.to_type using errcode = '22023';
  end case;
  if not v_exists then
    raise exception 'dependency to-entity (%, %) does not exist',
      NEW.to_type, NEW.to_id using errcode = '23503';
  end if;

  return NEW;
end;
$$;

revoke execute on function public.tg_dep_validate_polymorphic_fk_fn() from public, anon, authenticated;

-- D2. Tenant-boundary trigger (BEFORE INSERT/UPDATE).
-- Both ends must belong to NEW.tenant_id. Defense-in-depth to RLS.
create or replace function public.tg_dep_validate_tenant_boundary_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_from_tenant uuid;
  v_to_tenant uuid;
begin
  case NEW.from_type
    when 'project' then
      select tenant_id into v_from_tenant from public.projects where id = NEW.from_id;
    when 'phase' then
      select tenant_id into v_from_tenant from public.phases where id = NEW.from_id;
    when 'work_package' then
      select tenant_id into v_from_tenant from public.work_items where id = NEW.from_id;
    when 'todo' then
      select tenant_id into v_from_tenant from public.work_items where id = NEW.from_id;
  end case;

  case NEW.to_type
    when 'project' then
      select tenant_id into v_to_tenant from public.projects where id = NEW.to_id;
    when 'phase' then
      select tenant_id into v_to_tenant from public.phases where id = NEW.to_id;
    when 'work_package' then
      select tenant_id into v_to_tenant from public.work_items where id = NEW.to_id;
    when 'todo' then
      select tenant_id into v_to_tenant from public.work_items where id = NEW.to_id;
  end case;

  if v_from_tenant is null or v_to_tenant is null then
    raise exception 'dependency tenant lookup failed (from=%, to=%)',
      v_from_tenant, v_to_tenant using errcode = '22023';
  end if;
  if v_from_tenant <> NEW.tenant_id or v_to_tenant <> NEW.tenant_id then
    raise exception 'cross-tenant dependencies are not allowed (from_tenant=%, to_tenant=%, edge_tenant=%)',
      v_from_tenant, v_to_tenant, NEW.tenant_id using errcode = '22023';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.tg_dep_validate_tenant_boundary_fn() from public, anon, authenticated;

-- D3. Cycle prevention (BEFORE INSERT/UPDATE) — recursive CTE over the
-- polymorphic edge graph. Walks NEW.to_id forward; if it reaches NEW.from_id
-- the new edge would close a cycle. LIMIT 10000 is the safety net.
create or replace function public.tg_dep_prevent_polymorphic_cycle_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_hit boolean;
begin
  with recursive walk as (
    select NEW.to_type as t_type, NEW.to_id as t_id, 1 as depth
    union all
    select d.to_type, d.to_id, w.depth + 1
    from public.dependencies d
    join walk w on d.from_type = w.t_type and d.from_id = w.t_id
    where w.depth < 10000
  )
  select exists(
    select 1 from walk
    where t_type = NEW.from_type and t_id = NEW.from_id
  ) into v_hit;

  if v_hit then
    raise exception 'dependency cycle detected (% % → % %)',
      NEW.from_type, NEW.from_id, NEW.to_type, NEW.to_id
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.tg_dep_prevent_polymorphic_cycle_fn() from public, anon, authenticated;

-- D4. ON-DELETE cleanup triggers — polymorphic FKs cannot be expressed as
-- native Postgres FKs, so we wire AFTER DELETE triggers on the source tables.
create or replace function public.tg_projects_cleanup_dependencies_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  delete from public.dependencies
  where (from_type = 'project' and from_id = OLD.id)
     or (to_type   = 'project' and to_id   = OLD.id);
  return OLD;
end;
$$;

revoke execute on function public.tg_projects_cleanup_dependencies_fn() from public, anon, authenticated;

create or replace function public.tg_phases_cleanup_dependencies_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  delete from public.dependencies
  where (from_type = 'phase' and from_id = OLD.id)
     or (to_type   = 'phase' and to_id   = OLD.id);
  return OLD;
end;
$$;

revoke execute on function public.tg_phases_cleanup_dependencies_fn() from public, anon, authenticated;

create or replace function public.tg_work_items_cleanup_dependencies_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_type text;
begin
  v_type := case when OLD.kind = 'work_package' then 'work_package' else 'todo' end;
  delete from public.dependencies
  where (from_type = v_type and from_id = OLD.id)
     or (to_type   = v_type and to_id   = OLD.id);
  return OLD;
end;
$$;

revoke execute on function public.tg_work_items_cleanup_dependencies_fn() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- E. Swap tables.
--   - drop the Round-1 `dependencies` (data is preserved in dependencies_legacy)
--   - rename dependencies_v2 → dependencies (canonical)
-- ---------------------------------------------------------------------------
-- The Round-1 triggers attached to `dependencies` go away with DROP TABLE.
drop table public.dependencies cascade;
alter table public.dependencies_v2 rename to dependencies;

-- Rename the indexes / constraints to match the canonical table name (cosmetic
-- but keeps SQL diagnostics consistent with the table name everyone reads).
alter index dependencies_v2_from_idx          rename to dependencies_from_idx;
alter index dependencies_v2_to_idx            rename to dependencies_to_idx;
alter index dependencies_v2_tenant_idx        rename to dependencies_tenant_idx;

alter table public.dependencies
  rename constraint dependencies_v2_tenant_fkey to dependencies_tenant_fkey;
alter table public.dependencies
  rename constraint dependencies_v2_created_by_fkey to dependencies_created_by_fkey;
alter table public.dependencies
  rename constraint dependencies_v2_from_type_check to dependencies_from_type_check;
alter table public.dependencies
  rename constraint dependencies_v2_to_type_check to dependencies_to_type_check;
alter table public.dependencies
  rename constraint dependencies_v2_constraint_type_check to dependencies_constraint_type_check;
alter table public.dependencies
  rename constraint dependencies_v2_no_self to dependencies_no_self;
alter table public.dependencies
  rename constraint dependencies_v2_unique_edge to dependencies_unique_edge;

-- ---------------------------------------------------------------------------
-- F. Attach triggers to the canonical `dependencies` table + source tables.
-- ---------------------------------------------------------------------------
-- BEFORE INSERT/UPDATE: validate polymorphic FK existence, tenant-boundary,
-- and cycle prevention. Order matters: FK first (cheap, fails fast), tenant
-- second, cycle last (most expensive).
create trigger tg_dep_validate_polymorphic_fk
  before insert or update of from_type, from_id, to_type, to_id
  on public.dependencies
  for each row execute function public.tg_dep_validate_polymorphic_fk_fn();

create trigger tg_dep_validate_tenant_boundary
  before insert or update of from_type, from_id, to_type, to_id, tenant_id
  on public.dependencies
  for each row execute function public.tg_dep_validate_tenant_boundary_fn();

create trigger tg_dep_prevent_polymorphic_cycle
  before insert or update of from_type, from_id, to_type, to_id
  on public.dependencies
  for each row execute function public.tg_dep_prevent_polymorphic_cycle_fn();

-- AFTER DELETE on the three source tables — clean up dangling edges.
create trigger tg_projects_cleanup_dependencies
  after delete on public.projects
  for each row execute function public.tg_projects_cleanup_dependencies_fn();

create trigger tg_phases_cleanup_dependencies
  after delete on public.phases
  for each row execute function public.tg_phases_cleanup_dependencies_fn();

create trigger tg_work_items_cleanup_dependencies
  after delete on public.work_items
  for each row execute function public.tg_work_items_cleanup_dependencies_fn();

-- ---------------------------------------------------------------------------
-- G. Row Level Security.
-- ---------------------------------------------------------------------------
alter table public.dependencies enable row level security;

-- SELECT: any tenant member can read every edge in the tenant. RLS-equivalent
-- to PROJ-31's pattern. (Project-scoped read is enforced by the consumer
-- query joining via from_id/to_id; cross-project reads inside the tenant are
-- legitimate now that the engine supports cross-project edges.)
create policy dependencies_select on public.dependencies
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- INSERT: tenant member. The triggers enforce same-tenant on both ends + FK
-- existence + cycle prevention; project-role policing happens at the API
-- boundary (callers already gate via `requireProjectAccess(..., 'edit')` for
-- the project-scoped route). Tenant admins bypass via is_tenant_admin.
create policy dependencies_insert on public.dependencies
  for insert to authenticated
  with check (public.is_tenant_member(tenant_id));

-- UPDATE: same. In practice the API mostly delete+recreate; UPDATE policy is
-- here for completeness and for `lag_days`/`constraint_type` tweaks.
create policy dependencies_update on public.dependencies
  for update to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- DELETE: tenant member.
create policy dependencies_delete on public.dependencies
  for delete to authenticated
  using (public.is_tenant_member(tenant_id));

-- anon hardening (PROJ-1 convention).
revoke select on public.dependencies from anon;

-- ---------------------------------------------------------------------------
-- H. Audit-Whitelist extension (PROJ-10).
-- ---------------------------------------------------------------------------
-- Round 2 surfaces dependency mutations via the existing PROJ-10 audit
-- pipeline. UPDATE on `dependencies` is rare but possible (lag_days/constraint
-- tweaks) — those are now tracked. INSERT/DELETE on dependencies is NOT
-- captured by the existing pipeline; the row-as-whole audit for those
-- operations is tracked as a follow-up (see migration commentary).
-- Add 'dependencies' to the entity_type whitelist (preserve all existing values).
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
      'tenant_project_type_overrides','tenant_method_overrides',
      'vendors','vendor_project_assignments','vendor_evaluations',
      'vendor_documents','compliance_tags','work_item_documents',
      'budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates',
      'work_item_cost_lines',
      'dependencies'
    )
  );

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
      'communication_need','preferred_channel'
    ]
    when 'work_items' then array[
      'title','description','status','priority','responsible_user_id',
      'kind','sprint_id','parent_id','story_points',
      'wbs_code','wbs_code_is_custom'
    ]
    when 'phases' then array['name','description','planned_start','planned_end','status','sequence_number']
    when 'milestones' then array['name','description','target_date','actual_date','status','phase_id']
    when 'projects' then array['name','description','project_number','planned_start_date','planned_end_date','responsible_user_id','project_type','project_method','lifecycle_status','type_specific_data']
    when 'risks' then array['title','description','probability','impact','status','mitigation','responsible_user_id']
    when 'decisions' then array['is_revised']
    when 'open_items' then array['title','description','status','contact','contact_stakeholder_id','converted_to_entity_type','converted_to_entity_id']
    when 'tenants' then array['language','branding']
    when 'tenant_settings' then array['active_modules','privacy_defaults','ai_provider_config','retention_overrides','budget_settings','output_rendering_settings','cost_settings']
    when 'communication_outbox' then array['status','subject','body','channel','recipient_emails','sent_at','sent_by','provider_message_id']
    when 'resources' then array['name','role_key','default_capacity_hours_per_day','active','external_id','linked_stakeholder_id','linked_user_id','notes']
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
    -- PROJ-9-Round-2 — row-as-whole semantic; UPDATE on these columns is rare
    -- but tracked. INSERT/DELETE row-snapshot audit is a follow-up.
    when 'dependencies' then array[
      'tenant_id','from_type','from_id','to_type','to_id',
      'constraint_type','lag_days'
    ]
    else array[]::text[]
  end
$$;

-- Attach the shared audit trigger to `dependencies` (UPDATE-only, mirrors
-- the pattern used for the other audited tables).
drop trigger if exists audit_changes_dependencies on public.dependencies;
create trigger audit_changes_dependencies
  after update on public.dependencies
  for each row execute function public.record_audit_changes();

-- ---------------------------------------------------------------------------
-- I. Verification + comments.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows bigint;
  v_legacy bigint;
begin
  select count(*) into v_rows from public.dependencies;
  select count(*) into v_legacy from public.dependencies_legacy;
  raise notice 'PROJ-9-R2 summary: dependencies=% / dependencies_legacy=%',
    v_rows, v_legacy;
  if v_rows <> v_legacy then
    raise exception 'PROJ-9-R2 verification failed: row counts diverge (%/%)',
      v_rows, v_legacy;
  end if;
end $$;

comment on column public.dependencies.from_type is
  'PROJ-9-R2 — discriminator: project | phase | work_package | todo.';
comment on column public.dependencies.to_type is
  'PROJ-9-R2 — discriminator: project | phase | work_package | todo.';
comment on column public.dependencies.constraint_type is
  'PROJ-9-R2 — Gantt link semantic: FS / SS / FF / SF.';
comment on column public.dependencies.lag_days is
  'PROJ-9-R2 — signed integer; negative values = lead time.';
