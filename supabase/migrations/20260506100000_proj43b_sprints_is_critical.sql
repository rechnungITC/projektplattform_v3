-- =============================================================================
-- PROJ-43 Phase 43-β: sprints.is_critical — Critical-Path-Marker for Sprints
-- =============================================================================
-- Companion column to phases.is_critical (PROJ-35-β). PMs flag a sprint as
-- "on the critical path" so that every stakeholder assigned to a work-item
-- in that sprint receives the Critical-Path-Badge in the
-- Stakeholder-Health-Dashboard.
--
-- The endpoint /api/projects/[id]/stakeholder-health applies method-gating
-- (PROJ-26 SCHEDULE_CONSTRUCT_METHOD_VISIBILITY): the sprint path is only
-- evaluated for projects whose method allows sprints (Scrum, SAFe) — and
-- for projects whose method is NULL (still in setup).
--
-- Default false — opt-in. No backfill needed; existing sprints remain
-- non-critical until a PM explicitly marks them.
--
-- Audit-tracking: deliberately NOT added to public._tracked_audit_columns.
-- Mirrors the precedent set by phases.is_critical (PROJ-35-β): marker
-- booleans are PM hand-assertions, orthogonal to field-level audit. The
-- dashboard reflects the change immediately; reverting is a single click.
-- =============================================================================

alter table public.sprints
  add column if not exists is_critical boolean not null default false;

comment on column public.sprints.is_critical is
  'PROJ-43 Phase 43-β — Domain-Marker: PM kennzeichnet Sprint als kritisch '
  'fuer den Projekterfolg. Treibt Critical-Path-Indikator + Stakeholder-Health-'
  'Dashboard. Method-gated (Scrum/SAFe/NULL only). Default false (opt-in).';
