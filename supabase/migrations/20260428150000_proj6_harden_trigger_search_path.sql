-- =============================================================================
-- PROJ-6 follow-up: harden search_path on the new trigger functions.
-- =============================================================================
-- Addresses Supabase advisor lint `function_search_path_mutable` for the three
-- triggers introduced in `20260428140000_proj6_method_lock_and_subprojects.sql`.

create or replace function public.enforce_method_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if OLD.project_method is null then return NEW; end if;
  if NEW.project_method is not distinct from OLD.project_method then return NEW; end if;
  raise exception 'project_method is immutable once set; use a method-migration RPC'
    using errcode = '42501';
end;
$$;

create or replace function public.enforce_parent_project_in_tenant()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_parent_tenant uuid;
begin
  if NEW.parent_project_id is null then return NEW; end if;
  select tenant_id into v_parent_tenant from public.projects where id = NEW.parent_project_id;
  if v_parent_tenant is null then
    raise exception 'parent project not found' using errcode = '23503';
  end if;
  if v_parent_tenant <> NEW.tenant_id then
    raise exception 'sub-project must be in the same tenant as its parent' using errcode = '22023';
  end if;
  return NEW;
end;
$$;

create or replace function public.enforce_project_hierarchy_depth()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_grandparent uuid;
begin
  if NEW.parent_project_id is null then return NEW; end if;
  if NEW.parent_project_id = NEW.id then
    raise exception 'project cannot be its own parent' using errcode = '22023';
  end if;
  select parent_project_id into v_grandparent
    from public.projects where id = NEW.parent_project_id;
  if v_grandparent is not null then
    raise exception 'project hierarchy depth is limited to 2 levels (parent + child)'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.projects where parent_project_id = NEW.id) then
    raise exception 'cannot become a sub-project: this project already has its own sub-projects'
      using errcode = '22023';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.enforce_method_immutable() from public, anon, authenticated;
revoke execute on function public.enforce_parent_project_in_tenant() from public, anon, authenticated;
revoke execute on function public.enforce_project_hierarchy_depth() from public, anon, authenticated;
