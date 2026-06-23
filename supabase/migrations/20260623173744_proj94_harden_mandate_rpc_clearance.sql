-- PROJ-94 security hardening — patch the already-deployed transition_mandate_status RPC.
--
-- The base migration 20260619143423_proj94_ma_project_profile created
-- transition_mandate_status as SECURITY DEFINER, which bypasses table RLS — and
-- therefore also bypassed the PROJ-100a need-to-know confidentiality gate. A
-- sponsor / deal-lead WITHOUT a confidentiality clearance could transition the
-- mandate status of a classified M&A profile.
--
-- The fix is in the base migration FILE (cherry-picked from fix/proj94-ma-security),
-- but that file was already applied to prod, so editing it is a no-op for the live
-- database. This migration re-applies the corrected RPC body so the
-- can_access_classified() gate actually reaches production. Idempotent
-- (create or replace) and signature-identical to the deployed function.

create or replace function public.transition_mandate_status(
  p_project_id uuid,
  p_to_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_responsible uuid;
  v_from_status text;
  v_sponsor uuid;
  v_confidentiality_level public.ma_confidentiality_level;
  v_authorized boolean;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_to_status not in ('draft', 'submitted', 'approved') then
    raise exception 'unknown mandate_status: %', p_to_status using errcode = '23514';
  end if;

  select
      p.tenant_id,
      p.responsible_user_id,
      mp.mandate_status,
      mp.sponsor_user_id,
      mp.confidentiality_level
    into
      v_tenant,
      v_responsible,
      v_from_status,
      v_sponsor,
      v_confidentiality_level
    from public.projects p
    join public.ma_project_profiles mp on mp.project_id = p.id
    where p.id = p_project_id;
  if not found then
    raise exception 'M&A project profile not found' using errcode = 'P0002';
  end if;

  v_authorized :=
    exists (
      select 1 from public.tenant_memberships
      where tenant_id = v_tenant and user_id = v_caller and role = 'admin'
    )
    or exists (
      select 1 from public.project_memberships
      where project_id = p_project_id and user_id = v_caller and role = 'lead'
    )
    or v_caller = v_responsible
    or v_caller = v_sponsor;
  if not v_authorized then
    raise exception 'insufficient role to change mandate status' using errcode = '42501';
  end if;

  if not public.can_access_classified(p_project_id, v_confidentiality_level) then
    raise exception 'insufficient clearance to change mandate status' using errcode = '42501';
  end if;

  case v_from_status
    when 'draft' then
      if p_to_status not in ('submitted', 'approved') then
        raise exception 'cannot transition mandate from % to %', v_from_status, p_to_status using errcode = '23514';
      end if;
    when 'submitted' then
      if p_to_status not in ('approved', 'draft') then
        raise exception 'cannot transition mandate from % to %', v_from_status, p_to_status using errcode = '23514';
      end if;
    when 'approved' then
      raise exception 'mandate already approved (terminal)' using errcode = '23514';
    else
      raise exception 'unknown mandate_status: %', v_from_status using errcode = '23514';
  end case;

  update public.ma_project_profiles
    set mandate_status = p_to_status, updated_at = now()
    where project_id = p_project_id;

  return jsonb_build_object(
    'project_id', p_project_id,
    'mandate_status', p_to_status,
    'from_status', v_from_status
  );
end;
$$;

revoke execute on function public.transition_mandate_status(uuid, text) from public, anon;
grant execute on function public.transition_mandate_status(uuid, text) to authenticated;