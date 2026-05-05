-- =============================================================================
-- PROJ-9 R2 follow-up — INSERT/DELETE row-snapshot audit on dependencies
-- =============================================================================
-- The existing `audit_changes_dependencies` trigger on AFTER UPDATE uses
-- the PROJ-10 `record_audit_changes` field-level pipeline. INSERT and
-- DELETE were left as a documented follow-up because that pipeline is
-- UPDATE-only.
--
-- This migration adds two tiny SECURITY DEFINER trigger functions that
-- write a single audit_log_entries row per INSERT/DELETE with the row
-- as JSONB. Pattern: store the snapshot under field_name='__row__' so
-- the audit-log UI can recognise this as a row-level event distinct
-- from field-level diffs.
--
-- Why row-snapshot rather than per-column inserts?
--   * Dependencies are immutable in practice (no UPDATE policy). They're
--     created and either kept or deleted — column-level history is
--     overkill.
--   * One INSERT row + one DELETE row per dependency lifetime is the
--     minimum that gives auditors what they need.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- INSERT trigger function
-- ---------------------------------------------------------------------------
create or replace function public.record_dependency_insert_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
begin
  v_actor := auth.uid();
  v_reason := nullif(current_setting('audit.change_reason', true), '');
  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  )
  values (
    NEW.tenant_id, 'dependencies', NEW.id, '__row__',
    null, to_jsonb(NEW), v_actor, coalesce(v_reason, 'insert')
  );
  return NEW;
end;
$$;

revoke execute on function public.record_dependency_insert_audit() from public;

-- ---------------------------------------------------------------------------
-- DELETE trigger function
-- ---------------------------------------------------------------------------
create or replace function public.record_dependency_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_reason text;
begin
  v_actor := auth.uid();
  v_reason := nullif(current_setting('audit.change_reason', true), '');
  insert into public.audit_log_entries (
    tenant_id, entity_type, entity_id, field_name,
    old_value, new_value, actor_user_id, change_reason
  )
  values (
    OLD.tenant_id, 'dependencies', OLD.id, '__row__',
    to_jsonb(OLD), null, v_actor, coalesce(v_reason, 'delete')
  );
  return OLD;
end;
$$;

revoke execute on function public.record_dependency_delete_audit() from public;

-- ---------------------------------------------------------------------------
-- Wire the triggers
-- ---------------------------------------------------------------------------
drop trigger if exists audit_dependencies_insert on public.dependencies;
create trigger audit_dependencies_insert
  after insert on public.dependencies
  for each row execute function public.record_dependency_insert_audit();

drop trigger if exists audit_dependencies_delete on public.dependencies;
create trigger audit_dependencies_delete
  after delete on public.dependencies
  for each row execute function public.record_dependency_delete_audit();
