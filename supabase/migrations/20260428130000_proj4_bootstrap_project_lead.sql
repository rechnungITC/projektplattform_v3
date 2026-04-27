-- =============================================================================
-- PROJ-4 M1: bootstrap_project_lead RPC
-- =============================================================================
-- Closes the auto-lead-on-create gap: a non-admin tenant_member who creates
-- a new project cannot satisfy the project_memberships INSERT policy
-- (`is_tenant_admin OR is_project_lead`) because no lead exists yet at the
-- moment of the second INSERT. This SECURITY DEFINER RPC bypasses RLS for
-- exactly that bootstrap and refuses every other case.
--
-- Hard preconditions (all must hold):
--   1. auth.uid() = p_user_id           — no privilege-escalation on others
--   2. project exists and is not deleted
--   3. caller is a tenant member of the project's tenant
--   4. no project_memberships rows exist for the project yet  (one-shot)
--
-- After bootstrap, regular RLS takes over and further membership management
-- goes through the normal POST /members path.

create or replace function public.bootstrap_project_lead(
  p_project_id uuid,
  p_user_id uuid
)
returns public.project_memberships
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller       uuid := (select auth.uid());
  v_tenant_id    uuid;
  v_existing     int;
  v_tenant_role  text;
  v_row          public.project_memberships;
begin
  -- 1. Caller must be the user being bootstrapped.
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_caller <> p_user_id then
    raise exception 'caller must bootstrap themselves' using errcode = '42501';
  end if;

  -- 2. Project must exist (and not be soft-deleted).
  select tenant_id into v_tenant_id
    from public.projects
    where id = p_project_id and is_deleted = false;
  if v_tenant_id is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- 3. Caller must be a tenant member of the project's tenant.
  select role into v_tenant_role
    from public.tenant_memberships
    where tenant_id = v_tenant_id and user_id = v_caller;
  if v_tenant_role is null then
    raise exception 'caller is not a member of the project tenant'
      using errcode = '42501';
  end if;

  -- 4. One-shot: no memberships may exist yet on this project.
  select count(*) into v_existing
    from public.project_memberships
    where project_id = p_project_id;
  if v_existing > 0 then
    raise exception 'project already has memberships; use POST /members'
      using errcode = '22023';
  end if;

  -- All preconditions met — insert the lead row.
  insert into public.project_memberships (project_id, user_id, role, created_by)
    values (p_project_id, p_user_id, 'lead', p_user_id)
    returning * into v_row;

  return v_row;
end;
$$;

-- Lock down the surface: only authenticated callers may invoke; anon and the
-- public pseudo-role get nothing.
revoke execute on function public.bootstrap_project_lead(uuid, uuid)
  from public, anon;
grant execute on function public.bootstrap_project_lead(uuid, uuid)
  to authenticated;
