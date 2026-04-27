-- =============================================================================
-- PROJ-7: Add project_method column to projects
-- =============================================================================
-- The method (Scrum/Kanban/SAFe/Waterfall/PMI/general) determines the
-- project room dashboard rendering, sidebar sections, allowed AI kinds,
-- and stakeholder-attachable kinds (per features/PROJ-7 Tech Design).
-- Default 'general' means no method commitment yet — all kinds visible.

alter table public.projects
  add column project_method text not null default 'general';

alter table public.projects
  add constraint projects_project_method_check
  check (project_method in ('scrum', 'kanban', 'safe', 'waterfall', 'pmi', 'general'));
