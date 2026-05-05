-- =============================================================================
-- PROJ-9 L1 follow-up — index missing FK columns
-- =============================================================================
-- Closes the Supabase-advisor INFO L1 from the original 2026-04-28 QA pass.
-- Adds CONCURRENTLY-friendly indexes on the FK columns where:
--   * the column is referenced by ad-hoc lookups beyond the existing
--     composite indexes
--   * the column is on a cascade path where unindexed FKs slow DELETEs
--
-- Skipped: tenant_id-alone indexes — every PROJ-9 query also filters by
-- project_id, so the existing composite (project_id, …) indexes are the
-- correct hot-path index. RLS uses SECURITY DEFINER helper functions, not
-- direct WHERE tenant_id queries.
-- =============================================================================

create index if not exists work_items_sprint_id_idx
  on public.work_items (sprint_id)
  where is_deleted = false and sprint_id is not null;

create index if not exists work_items_phase_id_idx
  on public.work_items (phase_id)
  where is_deleted = false and phase_id is not null;

create index if not exists work_items_milestone_id_idx
  on public.work_items (milestone_id)
  where is_deleted = false and milestone_id is not null;

create index if not exists work_items_created_by_idx
  on public.work_items (created_by);

create index if not exists dependencies_created_by_idx
  on public.dependencies (created_by);

create index if not exists sprints_created_by_idx
  on public.sprints (created_by);
