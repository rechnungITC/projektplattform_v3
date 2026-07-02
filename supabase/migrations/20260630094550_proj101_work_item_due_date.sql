-- PROJ-101 — Frist (deadline) for work items.
-- Core-wide nullable deadline, distinct from Gantt's planned_start/planned_end.
-- Deliberately NO CHECK against planned_end (a deadline may legitimately
-- precede the planned work end). Partial index supports the "Fristfenster"
-- (due-window) list filter at scale (DoD: >=10k tasks/project).
--
-- Reuse-class DUP→REUSE on PROJ-9 work_items (kind='task'); an M&A "Aufgabe"
-- is a work_item, not a new table. See features/PROJ-101 Tech Design.
alter table public.work_items
  add column if not exists due_date date;

comment on column public.work_items.due_date is
  'PROJ-101: deadline (Frist), distinct from planned_start/planned_end (Gantt scheduling). Nullable, core-wide. No CHECK vs planned_end by design.';

create index if not exists work_items_project_due_date_idx
  on public.work_items (project_id, due_date)
  where is_deleted = false;
