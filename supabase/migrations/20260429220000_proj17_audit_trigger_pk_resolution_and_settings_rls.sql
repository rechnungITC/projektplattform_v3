-- =============================================================================
-- PROJ-17 fix H1 + H2 + H3
-- =============================================================================
-- H1 — record_audit_changes() reads (v_new->>'id') for entity_id, but
--      tenant_settings PK is tenant_id (no `id` column). Every UPDATE on
--      a tracked column rolls back with a NOT NULL violation.
--
-- H2 — Same trigger reads (v_new->>'tenant_id') for the audit row's
--      tenant_id, but the tenants table has no tenant_id column (it IS
--      the tenant). language/branding updates fail.
--
-- H3 — tenant_settings SELECT policy was admin-only. requireModuleActive
--      reads the row in the user's auth context; non-admins see 0 rows
--      and the helper falls open, silently disabling module gating for
--      the only users it's meant to constrain.
--
-- Fix: extend the trigger to resolve the PK column per TG_TABLE_NAME, and
-- widen the SELECT policy to tenant members. UPDATE stays admin-only.
-- =============================================================================

create or replace function public.record_audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_columns text[];
  v_col text;
  v_old_v jsonb;
  v_new_v jsonb;
  v_old jsonb;
  v_new jsonb;
  v_actor uuid;
  v_reason text;
  v_tenant uuid;
  v_entity_id uuid;
begin
  v_columns := public._tracked_audit_columns(TG_TABLE_NAME);
  if v_columns is null or array_length(v_columns, 1) is null then
    return NEW;
  end if;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  v_actor := auth.uid();
  v_reason := nullif(current_setting('audit.change_reason', true), '');

  -- Resolve entity_id + tenant_id per audited table. Most tables have
  -- both an `id` PK and a `tenant_id` FK; tenants and tenant_settings
  -- are the special cases.
  case TG_TABLE_NAME
    when 'tenants' then
      v_entity_id := (v_new->>'id')::uuid;
      v_tenant := (v_new->>'id')::uuid;
    when 'tenant_settings' then
      v_entity_id := (v_new->>'tenant_id')::uuid;
      v_tenant := (v_new->>'tenant_id')::uuid;
    else
      v_entity_id := (v_new->>'id')::uuid;
      v_tenant := (v_new->>'tenant_id')::uuid;
  end case;

  foreach v_col in array v_columns loop
    v_old_v := v_old -> v_col;
    v_new_v := v_new -> v_col;
    if v_old_v is distinct from v_new_v then
      insert into public.audit_log_entries (
        tenant_id, entity_type, entity_id, field_name,
        old_value, new_value, actor_user_id, change_reason
      ) values (
        v_tenant, TG_TABLE_NAME, v_entity_id, v_col,
        v_old_v, v_new_v, v_actor, v_reason
      );
    end if;
  end loop;
  return NEW;
end;
$$;

revoke execute on function public.record_audit_changes() from public, anon, authenticated;

-- H3: widen tenant_settings SELECT to tenant members so module gating
-- works in the user's auth context. UPDATE stays admin-only.
drop policy "tenant_settings_select_admin" on public.tenant_settings;

create policy "tenant_settings_select_member"
  on public.tenant_settings for select
  using (public.is_tenant_member(tenant_id));
