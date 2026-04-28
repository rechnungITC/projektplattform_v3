-- =============================================================================
-- PROJ-10 fix M1: warn when restore re-introduces redacted Class-3 values
-- =============================================================================
-- QA finding M1 (2026-04-28): audit_restore_entity() silently wrote old_value
-- back even when the current at-rest value was NULL on a Class-3 personal-data
-- field — i.e. the restore could undo a DSGVO clear without telling the caller.
--
-- This migration replaces audit_restore_entity() with a version that returns
-- a `warnings jsonb` payload listing every Class-3 field that was un-redacted
-- by the restore. The route handler surfaces these to the user; the restore
-- itself still proceeds (the spec contract is "log warning", not "block").
--
-- The Class-3 map currently covers stakeholders.{name, contact_email,
-- contact_phone, linked_user_id, notes}. Add to this map as new tables expose
-- personal data.
-- =============================================================================

drop function if exists public.audit_restore_entity(text, uuid, timestamptz);

create or replace function public.audit_restore_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_target_changed_at timestamptz
)
returns table(
  success boolean,
  message text,
  fields_restored integer,
  warnings jsonb
)
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
  v_warnings jsonb := '[]'::jsonb;
  v_sql text;
  v_is_class3 boolean;
begin
  v_columns := public._tracked_audit_columns(p_entity_type);
  if v_columns is null or array_length(v_columns, 1) is null then
    return query select false, 'unknown_entity_type', 0, '[]'::jsonb;
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

    -- Class-3 redaction-restore detection: if the field is personal data and
    -- the current at-rest value is NULL or a redaction sentinel while the
    -- target value is not, the restore re-introduces previously-cleared PII.
    v_is_class3 := (
      p_entity_type = 'stakeholders'
      and v_col in ('name', 'contact_email', 'contact_phone',
                    'linked_user_id', 'notes')
    );
    if v_is_class3
       and (
         v_current is null
         or v_current = 'null'::jsonb
         or v_current = to_jsonb('[redacted:class-3]'::text)
       )
       and v_old_at_target is not null
       and v_old_at_target <> 'null'::jsonb
    then
      v_warnings := v_warnings || jsonb_build_object(
        'field', v_col,
        'reason', 'class3_redaction_overwrite'
      );
    end if;

    v_sql := format(
      'update public.%I set %I = $1 where id = $2',
      p_entity_type, v_col
    );
    execute v_sql using v_old_at_target, p_entity_id;
    v_count := v_count + 1;
  end loop;

  return query select true, 'ok', v_count, v_warnings;
end;
$$;

revoke execute on function public.audit_restore_entity(text, uuid, timestamptz) from public;
grant execute on function public.audit_restore_entity(text, uuid, timestamptz) to authenticated;
