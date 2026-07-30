-- PROJ-77-γ reconcile: a concurrent migration recreated _tracked_audit_columns
-- from a live def that predated the γ migration, dropping the
-- skill_knowledge_links branch (can_read_audit_entry + entity_type CHECK +
-- the audit trigger survived; only the tracked-columns branch was lost →
-- include_subtree/link_mode edits stopped being field-level audited).
-- Idempotent re-add via anchor-replace: no-op if the branch is already present,
-- so this is safe both on prod and in the schema-drift fresh-replay ordering
-- (this migration sorts last → the final replayed state always contains the branch).
do $wire$
declare src text; patched text;
begin
  src := pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure);
  if position('skill_knowledge_links' in src) = 0 then
    patched := replace(
      src,
      'else array[]::text[]',
      'when ''skill_knowledge_links'' then array[''include_subtree'',''link_mode'',''document_node_id'']'
      || E'\n    else array[]::text[]'
    );
    if patched = src then raise exception 'reconcile: _tracked_audit_columns anchor not found'; end if;
    execute patched;
    if position('skill_knowledge_links' in pg_get_functiondef('public._tracked_audit_columns(text)'::regprocedure)) = 0 then
      raise exception 'reconcile: patch did not apply';
    end if;
  end if;
end
$wire$;
grant execute on function public._tracked_audit_columns(text) to authenticated;
