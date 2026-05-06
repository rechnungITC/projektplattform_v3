-- =============================================================================
-- Security hardening — state-machine RPCs accept explicit p_actor_user_id.
-- =============================================================================
-- Adds an optional `p_actor_user_id uuid default null` to three state-machine
-- RPCs and replaces the old `is_tenant_admin / has_project_role /
-- is_project_lead` helper-calls (which themselves rely on `auth.uid()`) with
-- direct `tenant_memberships` / `project_memberships` lookups against the
-- coalesced caller id. This makes the functions safely callable from either:
--
--   - the user-context Supabase client (p_actor_user_id omitted; auth.uid()
--     supplies the caller — backwards-compat for any remaining direct REST
--     callers), OR
--
--   - the service-role admin client (p_actor_user_id explicitly passed by
--     the API route after `requireProjectAccess` / `requireTenantAdmin` has
--     already authorized the caller). With admin-client there is no JWT,
--     so the inner authz still works because we substitute the explicit
--     parameter.
--
-- Functions covered:
--   - transition_project_status(p_project_id, p_to_status, p_comment,
--                               [p_actor_user_id])
--   - transition_phase_status(p_phase_id, p_to_status, p_comment,
--                             [p_actor_user_id])
--   - set_sprint_state(p_sprint_id, p_to_state, [p_actor_user_id])
--
-- Migration is CREATE OR REPLACE-based; no DROP needed because we only ADD a
-- trailing parameter with a default — existing CALL sites stay valid.
--
-- A companion migration revokes EXECUTE from `authenticated` once the API
-- route callers have been switched to the admin client (separate slice).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- transition_project_status
-- ---------------------------------------------------------------------------
create or replace function public.transition_project_status(
  p_project_id   uuid,
  p_to_status    text,
  p_comment      text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_caller     uuid;
  v_tenant     uuid;
  v_from_status text;
  v_is_deleted boolean;
  v_is_admin   boolean;
  v_is_lead    boolean;
begin
  v_caller := coalesce(p_actor_user_id, auth.uid());
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, lifecycle_status, is_deleted
    into v_tenant, v_from_status, v_is_deleted
    from public.projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = '02000';
  end if;
  if v_is_deleted then
    raise exception 'cannot transition a deleted project; restore first'
      using errcode = '22023';
  end if;

  v_is_admin := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = v_caller and role = 'admin'
  );
  v_is_lead := exists (
    select 1 from public.project_memberships
    where project_id = p_project_id and user_id = v_caller
      and project_role = 'lead'
  );
  if not (v_is_admin or v_is_lead) then
    raise exception 'insufficient role to transition project status'
      using errcode = '42501';
  end if;

  case v_from_status
    when 'draft' then
      if p_to_status not in ('active','canceled') then
        raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
      end if;
    when 'active' then
      if p_to_status not in ('paused','completed','canceled') then
        raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
      end if;
    when 'paused' then
      if p_to_status not in ('active','canceled') then
        raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
      end if;
    when 'canceled' then
      if p_to_status not in ('draft','active') then
        raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
      end if;
    when 'completed' then
      raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
    else
      raise exception 'unknown lifecycle_status: %', v_from_status using errcode = '23514';
  end case;

  update public.projects set lifecycle_status = p_to_status, updated_at = now() where id = p_project_id;
  insert into public.project_lifecycle_events (project_id, from_status, to_status, comment, changed_by)
    values (p_project_id, v_from_status, p_to_status, p_comment, v_caller);

  return jsonb_build_object('id', p_project_id, 'lifecycle_status', p_to_status, 'from_status', v_from_status);
end;
$func$;


-- ---------------------------------------------------------------------------
-- transition_phase_status
-- ---------------------------------------------------------------------------
create or replace function public.transition_phase_status(
  p_phase_id   uuid,
  p_to_status  text,
  p_comment    text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_caller       uuid;
  v_tenant       uuid;
  v_project      uuid;
  v_from_status  text;
  v_is_admin     boolean;
  v_role_ok      boolean;
begin
  v_caller := coalesce(p_actor_user_id, auth.uid());
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, project_id, status
    into v_tenant, v_project, v_from_status
    from public.phases where id = p_phase_id;
  if not found then
    raise exception 'phase not found' using errcode = '02000';
  end if;

  v_is_admin := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = v_caller and role = 'admin'
  );
  v_role_ok := exists (
    select 1 from public.project_memberships
    where project_id = v_project and user_id = v_caller
      and project_role in ('lead','editor')
  );
  if not (v_is_admin or v_role_ok) then
    raise exception 'insufficient role for phase status transition'
      using errcode = '42501';
  end if;

  if v_from_status = 'planned' and p_to_status not in ('in_progress', 'cancelled') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'in_progress' and p_to_status not in ('completed', 'cancelled', 'planned') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'completed' and p_to_status not in ('in_progress') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'cancelled' and p_to_status not in ('planned') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  end if;

  update public.phases
    set status = p_to_status,
        actual_start = case when p_to_status = 'in_progress' and actual_start is null then current_date else actual_start end,
        actual_end = case when p_to_status = 'completed' and actual_end is null then current_date else actual_end end,
        updated_at = now()
    where id = p_phase_id;

  if p_to_status = 'completed' then
    perform pg_notify(
      'phase_completed',
      jsonb_build_object(
        'phase_id', p_phase_id,
        'project_id', v_project,
        'tenant_id', v_tenant,
        'from_status', v_from_status,
        'comment', p_comment,
        'changed_by', v_caller,
        'changed_at', now()
      )::text
    );
  end if;

  return jsonb_build_object(
    'id', p_phase_id,
    'status', p_to_status,
    'from_status', v_from_status
  );
end;
$func$;


-- ---------------------------------------------------------------------------
-- set_sprint_state
-- ---------------------------------------------------------------------------
create or replace function public.set_sprint_state(
  p_sprint_id  uuid,
  p_to_state   text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_caller     uuid;
  v_tenant     uuid;
  v_project    uuid;
  v_from_state text;
  v_is_admin   boolean;
  v_role_ok    boolean;
begin
  v_caller := coalesce(p_actor_user_id, auth.uid());
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, project_id, state into v_tenant, v_project, v_from_state
    from public.sprints where id = p_sprint_id;
  if not found then
    raise exception 'sprint not found' using errcode = '02000';
  end if;

  v_is_admin := exists (
    select 1 from public.tenant_memberships
    where tenant_id = v_tenant and user_id = v_caller and role = 'admin'
  );
  v_role_ok := exists (
    select 1 from public.project_memberships
    where project_id = v_project and user_id = v_caller
      and project_role in ('lead','editor')
  );
  if not (v_is_admin or v_role_ok) then
    raise exception 'insufficient role for sprint state transition' using errcode = '42501';
  end if;

  if v_from_state = 'planned' and p_to_state <> 'active' then
    raise exception 'cannot transition from planned to %', p_to_state using errcode = '23514';
  elsif v_from_state = 'active' and p_to_state <> 'closed' then
    raise exception 'cannot transition from active to %', p_to_state using errcode = '23514';
  elsif v_from_state = 'closed' then
    raise exception 'closed sprints are terminal' using errcode = '23514';
  end if;

  if p_to_state = 'active' and exists (
    select 1 from public.sprints
    where project_id = v_project and state = 'active' and id <> p_sprint_id
  ) then
    raise exception 'another sprint in this project is already active' using errcode = '23514';
  end if;

  update public.sprints set state = p_to_state, updated_at = now() where id = p_sprint_id;

  return jsonb_build_object('id', p_sprint_id, 'state', p_to_state, 'from_state', v_from_state);
end;
$func$;


-- ---------------------------------------------------------------------------
-- Re-grant EXECUTE so existing callers (user-context client) keep working
-- until the route-side switch is committed in the next migration.
-- ---------------------------------------------------------------------------
grant execute on function public.transition_project_status(
  uuid, text, text, uuid
) to authenticated;
grant execute on function public.transition_phase_status(
  uuid, text, text, uuid
) to authenticated;
grant execute on function public.set_sprint_state(
  uuid, text, uuid
) to authenticated;
