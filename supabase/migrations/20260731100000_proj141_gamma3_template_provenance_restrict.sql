-- PROJ-141-γ3 (M-3) — harden M&A template provenance FK.
--
-- `workstreams.source_template_id` and `deliverables.source_template_id` carried
-- the FK to ma_project_templates(id) with ON DELETE SET NULL (PROJ-96,
-- 20260724120055). SET NULL orphans provenance identity on template deletion:
-- source_template_version survives as an isolated int with no template to name it.
--
-- γ3 fork (CIA-reviewed 2026-07-31, user-locked): ON DELETE RESTRICT — a template
-- with live project provenance is not deletable. Minimal, honest invariant that
-- protects exactly what the provenance semantics promise. No version-bump trigger
-- (no child-edit path exists → would never fire → over-engineering, deferred to
-- PROJ-Y-96c/96d). No soft-delete (would double the existing is_active axis;
-- right only once template-delete UI ships → PROJ-Y-96d).
--
-- Live state verified 2026-07-31: 0 templates seeded, 0 provenance rows in prod →
-- the constraint swap validates nothing on existing data. Idempotent swap over the
-- auto-named constraints on both tables.

alter table public.workstreams
  drop constraint if exists workstreams_source_template_id_fkey;
alter table public.workstreams
  add constraint workstreams_source_template_id_fkey
  foreign key (source_template_id) references public.ma_project_templates(id)
  on delete restrict;

alter table public.deliverables
  drop constraint if exists deliverables_source_template_id_fkey;
alter table public.deliverables
  add constraint deliverables_source_template_id_fkey
  foreign key (source_template_id) references public.ma_project_templates(id)
  on delete restrict;

comment on constraint workstreams_source_template_id_fkey on public.workstreams is
  'PROJ-141-γ3: ON DELETE RESTRICT — template with live provenance is not deletable (protects provenance identity).';
comment on constraint deliverables_source_template_id_fkey on public.deliverables is
  'PROJ-141-γ3: ON DELETE RESTRICT — template with live provenance is not deletable (protects provenance identity).';
