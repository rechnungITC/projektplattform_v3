-- =============================================================================
-- Fix handle_new_user: column reference "tenant_id" is ambiguous
-- =============================================================================
-- Bug: the function returned `TABLE (tenant_id uuid, role text)`, which
-- creates implicit OUT parameters with those names in the function scope.
-- The `INSERT ... ON CONFLICT (tenant_id, user_id)` clause then tripped
-- on the ambiguity between the OUT parameter `tenant_id` and the actual
-- column `tenant_memberships.tenant_id`.
--
-- Fix: switch to `RETURNS jsonb` so there are no shadowed table columns.
-- The Edge Function already handles both array and scalar response shapes,
-- so no client change is needed.
-- =============================================================================

drop function if exists public.handle_new_user(uuid, text, text, uuid, text);

create or replace function public.handle_new_user(
  p_user_id            uuid,
  p_email              text,
  p_display_name       text,
  p_invited_to_tenant  uuid,
  p_invited_role       text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_role       text;
  v_domain     text;
begin
  -- 1. Upsert profile (display_name falls back to email's local part).
  insert into public.profiles (id, email, display_name)
  values (
    p_user_id,
    p_email,
    coalesce(nullif(trim(p_display_name), ''), split_part(p_email, '@', 1))
  )
  on conflict (id) do update
    set email        = excluded.email,
        display_name = coalesce(
          nullif(trim(excluded.display_name), ''),
          public.profiles.display_name
        ),
        updated_at   = now();

  -- 2. Tenant routing: invite metadata wins over domain matching.
  if p_invited_to_tenant is not null then
    if p_invited_role is null
       or p_invited_role not in ('admin', 'member', 'viewer') then
      raise exception 'invalid invited_role: %', p_invited_role
        using errcode = 'invalid_parameter_value';
    end if;
    v_tenant_id := p_invited_to_tenant;
    v_role := p_invited_role;
  else
    v_domain := lower(split_part(p_email, '@', 2));
    if v_domain = '' then
      raise exception 'cannot derive domain from email: %', p_email
        using errcode = 'invalid_parameter_value';
    end if;

    select t.id into v_tenant_id
    from public.tenants t
    where t.domain = v_domain
    limit 1;

    if v_tenant_id is null then
      insert into public.tenants (name, domain, created_by)
      values (v_domain, null, p_user_id)
      returning id into v_tenant_id;
      v_role := 'admin';
    else
      v_role := 'member';
    end if;
  end if;

  -- 3. Insert membership idempotently.
  insert into public.tenant_memberships (tenant_id, user_id, role)
  values (v_tenant_id, p_user_id, v_role)
  on conflict (tenant_id, user_id) do nothing;

  -- 4. Return resolved tenant + role as JSONB.
  return jsonb_build_object(
    'tenant_id', v_tenant_id,
    'role',      v_role
  );
end;
$$;

revoke all on function public.handle_new_user(uuid, text, text, uuid, text) from public;
revoke all on function public.handle_new_user(uuid, text, text, uuid, text) from authenticated;
revoke all on function public.handle_new_user(uuid, text, text, uuid, text) from anon;
grant execute on function public.handle_new_user(uuid, text, text, uuid, text) to service_role;
