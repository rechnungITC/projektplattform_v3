-- ---------------------------------------------------------------------------
-- PROJ-79-α — dms_quota_status RPC (companion to the DMS foundation migration).
--
-- tenant_storage_quotas SELECT is tenant-admin-only, but the upload pre-flight
-- (413 quota-exceeded) runs as a non-admin project editor and must still read
-- the tenant's max/usage. This SECURITY DEFINER helper exposes read-only quota
-- status to any PROJECT MEMBER (also feeds the UI quota bar) without widening
-- the base-table SELECT policy. Returns tier defaults when no row exists yet.
-- Idempotent DDL.
-- ---------------------------------------------------------------------------
create or replace function public.dms_quota_status(p_project_id uuid)
returns table (
  max_bytes           bigint,
  current_usage_bytes bigint,
  soft_warning_pct    integer
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_caller uuid := auth.uid(); v_tenant uuid;
begin
  if v_caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  select tenant_id into v_tenant from public.projects where id = p_project_id and is_deleted = false;
  if v_tenant is null then raise exception 'project not found' using errcode='P0002'; end if;
  if not public.is_project_member(p_project_id) then
    raise exception 'not a project member' using errcode='42501';
  end if;
  return query
    select coalesce(q.max_bytes, 5368709120::bigint),
           coalesce(q.current_usage_bytes, 0::bigint),
           coalesce(q.soft_warning_pct, 80)
    from (select 1) one
    left join public.tenant_storage_quotas q on q.tenant_id = v_tenant;
end;
$$;
revoke execute on function public.dms_quota_status(uuid) from public;
revoke execute on function public.dms_quota_status(uuid) from anon;
grant execute on function public.dms_quota_status(uuid) to authenticated;
