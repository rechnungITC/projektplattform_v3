-- =============================================================================
-- PROJ-10 Phase B: SQL helpers for selective undo + full restore
-- =============================================================================
-- Applied via Supabase MCP on 2026-04-28. Captured here for repo history.
--
-- These run UPDATE inside a single transaction with set_config so the audit
-- trigger picks up `change_reason = 'undo'` / `'restore_…'` for the resulting
-- audit rows. API routes gate access via requireProjectAccess BEFORE calling
-- these RPCs — the RPCs trust the caller's authorization.
-- =============================================================================

create or replace function public.audit_undo_field(p_audit_id uuid)
returns table(success boolean, message text, entity_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.audit_log_entries;
  v_current jsonb;
  v_sql text;
begin
  select * into v_entry
    from public.audit_log_entries
   where id = p_audit_id;
  if not found then
    return query select false, 'audit_entry_not_found', null::uuid;
    return;
  end if;

  execute format(
    'select to_jsonb(t) -> %L from public.%I t where id = $1',
    v_entry.field_name, v_entry.entity_type
  )
  using v_entry.entity_id
  into v_current;

  if v_current is null then
    return query select false, 'entity_not_found', v_entry.entity_id;
    return;
  end if;

  if v_current is distinct from v_entry.new_value then
    return query select false, 'field_modified_after', v_entry.entity_id;
    return;
  end if;

  perform set_config('audit.change_reason', 'undo', true);

  v_sql := format(
    'update public.%I set %I = $1 where id = $2',
    v_entry.entity_type, v_entry.field_name
  );
  execute v_sql using v_entry.old_value, v_entry.entity_id;

  return query select true, 'ok', v_entry.entity_id;
end;
$$;

revoke execute on function public.audit_undo_field(uuid) from public;
grant execute on function public.audit_undo_field(uuid) to authenticated;

create or replace function public.audit_restore_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_target_changed_at timestamptz
)
returns table(success boolean, message text, fields_restored integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_columns text[];
  v_col text;
  v_old_at_target jsonb;
  v_current jsonb;
  v_count integer := 0;
  v_sql text;
begin
  v_columns := public._tracked_audit_columns(p_entity_type);
  if v_columns is null or array_length(v_columns, 1) is null then
    return query select false, 'unknown_entity_type', 0;
    return;
  end if;

  perform set_config(
    'audit.change_reason',
    'restore_from_' || to_char(p_target_changed_at at time zone 'UTC',
                               'YYYY-MM-DD"T"HH24:MI:SS'),
    true
  );

  foreach v_col in array v_columns loop
    select old_value into v_old_at_target
      from public.audit_log_entries
     where entity_type = p_entity_type
       and entity_id = p_entity_id
       and field_name = v_col
       and changed_at > p_target_changed_at
     order by changed_at asc
     limit 1;

    if v_old_at_target is null and not found then
      continue;
    end if;

    execute format(
      'select to_jsonb(t) -> %L from public.%I t where id = $1',
      v_col, p_entity_type
    )
    using p_entity_id
    into v_current;
    if v_current is not distinct from v_old_at_target then
      continue;
    end if;

    v_sql := format(
      'update public.%I set %I = $1 where id = $2',
      p_entity_type, v_col
    );
    execute v_sql using v_old_at_target, p_entity_id;
    v_count := v_count + 1;
  end loop;

  return query select true, 'ok', v_count;
end;
$$;

revoke execute on function public.audit_restore_entity(text, uuid, timestamptz) from public;
grant execute on function public.audit_restore_entity(text, uuid, timestamptz) to authenticated;
