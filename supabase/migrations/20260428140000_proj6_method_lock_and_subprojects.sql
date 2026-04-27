-- =============================================================================
-- PROJ-6: Method catalog tightening + method immutability + sub-project hierarchy
-- =============================================================================
-- Per the architecture pass on 2026-04-27, methods become a flat 7-entry list
-- (scrum, kanban, waterfall, safe, pmi, prince2, vxt2). 'general' retires —
-- "no method chosen" is now NULL. Once project_method is non-null it is hard-
-- locked (trigger). Sub-projects via parent_project_id (max depth 2 in v1)
-- give teams the escape valve when they need a different method.

-- ----------------------------------------------------------------------------
-- 1. Tighten projects.project_method
-- ----------------------------------------------------------------------------

-- 1a. Drop existing CHECK constraint and default; allow NULL.
alter table public.projects
  drop constraint if exists projects_project_method_check;
alter table public.projects
  alter column project_method drop default;
alter table public.projects
  alter column project_method drop not null;

-- 1b. Data migration: 'general' → NULL (no method chosen). 'pmi' stays
-- (it is now a first-class method).
update public.projects
  set project_method = null
  where project_method = 'general';

-- 1c. New CHECK constraint with 7 first-class methods, NULL allowed.
alter table public.projects
  add constraint projects_project_method_check
  check (project_method is null
         or project_method in (
           'scrum', 'kanban', 'waterfall', 'safe', 'pmi', 'prince2', 'vxt2'
         ));

-- ----------------------------------------------------------------------------
-- 2. Method immutability trigger
-- ----------------------------------------------------------------------------
-- Once project_method is non-null, blocks UPDATE that changes it. Allows
-- NULL → real value (initial choice). A future "migrate_project_method" RPC
-- will be the only legitimate way to change a locked method (audit-tracked).

create or replace function public.enforce_method_immutable()
returns trigger
language plpgsql
as $$
begin
  -- Allow if old was NULL (initial set).
  if OLD.project_method is null then
    return NEW;
  end if;
  -- Allow no-op writes (same value).
  if NEW.project_method is not distinct from OLD.project_method then
    return NEW;
  end if;
  raise exception 'project_method is immutable once set; use a method-migration RPC'
    using errcode = '42501';
end;
$$;

revoke execute on function public.enforce_method_immutable() from public, anon, authenticated;

drop trigger if exists projects_method_immutable on public.projects;
create trigger projects_method_immutable
  before update of project_method on public.projects
  for each row execute function public.enforce_method_immutable();

-- ----------------------------------------------------------------------------
-- 3. Sub-project hierarchy: parent_project_id + guards
-- ----------------------------------------------------------------------------

alter table public.projects
  add column parent_project_id uuid;

alter table public.projects
  add constraint projects_parent_project_id_fkey
  foreign key (parent_project_id) references public.projects(id)
  on delete restrict;

create index projects_parent_project_id_idx
  on public.projects (parent_project_id)
  where parent_project_id is not null;

-- 3a. Cross-tenant guard: a sub-project must share its parent's tenant.
create or replace function public.enforce_parent_project_in_tenant()
returns trigger
language plpgsql
as $$
declare
  v_parent_tenant uuid;
begin
  if NEW.parent_project_id is null then
    return NEW;
  end if;
  select tenant_id into v_parent_tenant
    from public.projects
    where id = NEW.parent_project_id;
  if v_parent_tenant is null then
    raise exception 'parent project not found' using errcode = '23503';
  end if;
  if v_parent_tenant <> NEW.tenant_id then
    raise exception 'sub-project must be in the same tenant as its parent'
      using errcode = '22023';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.enforce_parent_project_in_tenant() from public, anon, authenticated;

drop trigger if exists projects_parent_in_tenant on public.projects;
create trigger projects_parent_in_tenant
  before insert or update of parent_project_id, tenant_id on public.projects
  for each row execute function public.enforce_parent_project_in_tenant();

-- 3b. Depth ≤ 2: a project can have a parent, but the parent must NOT itself
-- have a parent. Plus a self-parent guard.
create or replace function public.enforce_project_hierarchy_depth()
returns trigger
language plpgsql
as $$
declare
  v_grandparent uuid;
begin
  if NEW.parent_project_id is null then
    return NEW;
  end if;
  if NEW.parent_project_id = NEW.id then
    raise exception 'project cannot be its own parent' using errcode = '22023';
  end if;
  select parent_project_id into v_grandparent
    from public.projects
    where id = NEW.parent_project_id;
  if v_grandparent is not null then
    raise exception 'project hierarchy depth is limited to 2 levels (parent + child)'
      using errcode = '22023';
  end if;
  -- Also reject if any existing children of NEW.id exist when becoming a
  -- sub-project (would create depth 3 via children's perspective).
  if exists (select 1 from public.projects where parent_project_id = NEW.id) then
    raise exception 'cannot become a sub-project: this project already has its own sub-projects'
      using errcode = '22023';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.enforce_project_hierarchy_depth() from public, anon, authenticated;

drop trigger if exists projects_hierarchy_depth on public.projects;
create trigger projects_hierarchy_depth
  before insert or update of parent_project_id on public.projects
  for each row execute function public.enforce_project_hierarchy_depth();
