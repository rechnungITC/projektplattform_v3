-- PROJ-139 — Core phase status "suspended" + state-machine transitions.
-- Extends the deployed phases.status CHECK (4 -> 5 values) and the
-- transition_phase_status RPC with: in_progress -> suspended (aussetzen),
-- suspended -> in_progress (fortsetzen), suspended -> cancelled (abbrechen).
-- Idempotent CHECK swap; existing rows unaffected. RPC body verbatim from
-- the live prod definition, only the transition chain changed. CREATE OR
-- REPLACE preserves the existing ACL (anon/authenticated already revoked).
-- Repo filename version == prod-registered version (PROJ-134 convention).

alter table public.phases drop constraint if exists phases_status_check;
alter table public.phases add constraint phases_status_check
  check (status = any (array['planned','in_progress','completed','cancelled','suspended']));

create or replace function public.transition_phase_status(p_phase_id uuid, p_to_status text, p_comment text, p_actor_user_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
      and role in ('lead','editor')
  );
  if not (v_is_admin or v_role_ok) then
    raise exception 'insufficient role for phase status transition'
      using errcode = '42501';
  end if;

  if v_from_status = 'planned' and p_to_status not in ('in_progress', 'cancelled') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'in_progress' and p_to_status not in ('completed', 'cancelled', 'planned', 'suspended') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'completed' and p_to_status not in ('in_progress') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'cancelled' and p_to_status not in ('planned') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'suspended' and p_to_status not in ('in_progress', 'cancelled') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  end if;

  update public.phases
     set status = p_to_status,
         actual_start = case
           when p_to_status = 'in_progress' and actual_start is null then current_date
           else actual_start
         end,
         actual_end = case
           when p_to_status = 'completed' and actual_end is null then current_date
           else actual_end
         end,
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
$function$;
