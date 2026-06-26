-- ---------------------------------------------------------------------------
-- PROJ-Y-112c — close the need-to-know gap in transition_dd_stream_status
--
-- transition_dd_stream_status (PROJ-112) is SECURITY DEFINER and bypasses the
-- RESTRICTIVE can_access_classified policy on dd_streams. It checked only the
-- project role (tenant-admin OR project-lead), so a project lead WITHOUT a
-- clearance for a `strict`/`confidential` stream could blind-transition its
-- status (couldn't see it, but could change it). Same class of gap the PROJ-113
-- live-smoke found in transition_dd_question_status (fixed at build).
--
-- Fix: the RPC re-checks can_access_classified(project, level) after the role
-- check (admin + cleared pass; 'standard' passes for all). Reproduced verbatim
-- from the live definition + the clearance guard. Idempotent (create or replace).
-- ---------------------------------------------------------------------------

create or replace function public.transition_dd_stream_status(
  p_stream_id uuid,
  p_to_status text,
  p_comment   text default null
)
returns public.dd_streams
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller      uuid := auth.uid();
  v_tenant      uuid;
  v_project     uuid;
  v_from_status text;
  v_level       public.ma_confidentiality_level;
  v_row         public.dd_streams;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select tenant_id, project_id, status, confidentiality_level
    into v_tenant, v_project, v_from_status, v_level
    from public.dd_streams where id = p_stream_id;
  if not found then
    raise exception 'dd_stream not found' using errcode = 'P0002';
  end if;

  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(v_project)) then
    raise exception 'insufficient role for dd_stream status transition'
      using errcode = '42501';
  end if;

  -- need-to-know: the RPC bypasses the RESTRICTIVE RLS gate, so re-check it.
  if not public.can_access_classified(v_project, v_level) then
    raise exception 'insufficient clearance for dd_stream status transition'
      using errcode = '42501';
  end if;

  if p_to_status not in ('not_started','started','in_review','findings_consolidated','completed') then
    raise exception 'invalid status %', p_to_status using errcode = '22023';
  end if;

  if v_from_status = 'not_started' and p_to_status not in ('started') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'started' and p_to_status not in ('in_review','not_started') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'in_review' and p_to_status not in ('findings_consolidated','started') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'findings_consolidated' and p_to_status not in ('completed','in_review') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  elsif v_from_status = 'completed' and p_to_status not in ('findings_consolidated') then
    raise exception 'cannot transition from % to %', v_from_status, p_to_status using errcode = '23514';
  end if;

  update public.dd_streams
     set status = p_to_status,
         updated_at = now()
   where id = p_stream_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.transition_dd_stream_status(uuid, text, text) from public;
revoke execute on function public.transition_dd_stream_status(uuid, text, text) from anon;
grant execute on function public.transition_dd_stream_status(uuid, text, text) to authenticated;
