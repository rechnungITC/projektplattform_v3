-- PROJ-69 beta: drop zero-scan indexes (Phase-1 class 'alpha' triage, re-confirmed zero-scan in fresh advisor 2026-06-10)
-- ki_provenance duplicates are covered by their UNIQUE twins (ki_provenance_entity_unique / ki_provenance_suggestion_unique);
-- projects.tenant_id remains covered by projects_tenant_id_lifecycle_status_idx (leading column);
-- created_by single-column indexes have no route/RPC/test filter dependency (grep-verified 2026-06-10).

drop index if exists public.dependencies_created_by_idx;
drop index if exists public.ki_provenance_entity_idx;
drop index if exists public.ki_provenance_suggestion_idx;
drop index if exists public.projects_tenant_id_idx;
drop index if exists public.sprints_created_by_idx;
drop index if exists public.tenants_created_by_idx;
drop index if exists public.work_items_created_by_idx;
