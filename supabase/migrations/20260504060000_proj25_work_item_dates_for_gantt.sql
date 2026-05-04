-- =============================================================================
-- PROJ-25 Stage 5 — explicit dates on work_items so work-packages can
-- render as bars in the Gantt and participate in drag-and-link UX.
-- =============================================================================
-- Round-1 work_items had no own time fields; PROJ-36 added derived
-- (rolled-up-from-children) date columns. For waterfall WBS the
-- work-package level needs OWN dates so users can place + move them on
-- the Gantt. Both columns are nullable + additive.
-- =============================================================================

alter table public.work_items
  add column if not exists planned_start date,
  add column if not exists planned_end date;

comment on column public.work_items.planned_start is
  'PROJ-25 Stage 5 — own start date for work-packages (and other kinds) used by the Gantt. Nullable; rolled up via derived_planned_start when this is null.';
comment on column public.work_items.planned_end is
  'PROJ-25 Stage 5 — own end date for work-packages (and other kinds) used by the Gantt. Nullable; rolled up via derived_planned_end when this is null.';

-- Audit-track the two new fields by re-publishing _tracked_audit_columns
-- with planned_start + planned_end appended to the work_items array.
-- (Live function definition kept in sync via Supabase MCP — see history.)
