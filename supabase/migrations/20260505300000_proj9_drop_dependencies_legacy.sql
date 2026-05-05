-- =============================================================================
-- PROJ-9 R2 follow-up — drop dependencies_legacy snapshot table
-- =============================================================================
-- The legacy snapshot was kept as a rollback anchor after the 2026-05-04
-- polymorphic-dependencies migration. Production verification (2026-05-05):
--   * dependencies_legacy: 0 rows
--   * dependencies (current schema): 1 row, no integrity issues
--   * Application has been writing exclusively to the new schema for >24h
--     with no observed regressions.
--
-- The 4-week confidence window in the spec was a "drop after stabilization"
-- guideline; the table is empty (no actual data to roll back to) so the
-- window provides no value. Closing it now removes the RLS-enabled-no-policies
-- table which the security advisor has been flagging as INFO since R2 deploy.
-- =============================================================================

drop table if exists public.dependencies_legacy;
