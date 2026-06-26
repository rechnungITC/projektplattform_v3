-- PROJ-114 follow-up: restore EXECUTE on can_read_audit_entry to authenticated.
-- The function is called by the audit_log_entries RLS SELECT policy and is
-- evaluated as the querying role; it had lost its authenticated grant during the
-- recent recreate-via-pg_get_functiondef chain (PROJ-112/113/97), which silently
-- broke PROJ-10 HistoryTab reads for normal users. Idempotent restore.
grant execute on function public.can_read_audit_entry(text, uuid, uuid) to authenticated;
