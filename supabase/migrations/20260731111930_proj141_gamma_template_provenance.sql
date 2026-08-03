-- PROJ-141-γ3-supplement — additives Provenance-Scaffolding für ma_project_profiles.
--
-- Historie: PROJ-141-γ shippte im Merge #288 (2026-07-31) mit einem schmalen
-- γ3-Fix, der nur die FKs auf `workstreams`/`deliverables.source_template_id`
-- von ON DELETE SET NULL → RESTRICT umschwenkte (siehe die parallele Migration
-- `20260731100000_proj141_gamma3_template_provenance_restrict.sql`). Diese
-- Supplement-Migration wurde in derselben γ-Session parallel gegen Prod
-- appliziert (via MCP `apply_migration`, Prod-Version 20260731111930) und
-- fügt zusätzlich pro Projekt einen Text-Snapshot der Template-Herkunft
-- hinzu, sodass Provenance-Identität eine Template-Löschung überlebt (Label +
-- Version + Zeitpunkt bleiben in `ma_project_profiles`, auch wenn der Katalog-
-- Eintrag verschwindet). Das FK-Enforcement dieses Supplements ist deckungs-
-- gleich mit #288 (RESTRICT auf denselben Spalten) — konvergent + idempotent.
--
-- Aktueller Konsumenten-Status: die Snapshot-Spalten werden bei jedem
-- `apply_ma_project_template`-Aufruf gestempelt (siehe recreate weiter unten),
-- aber vom aktuellen Read-Path noch nicht angezeigt. Sie stehen als Vorarbeit
-- für PROJ-Y-96c (immutable Versionshistorie) + PROJ-Y-96d (Deep-Editor mit
-- „Herkunft"-Anzeige) bereit.
--
-- Was diese Migration konkret tut:
--   1) `ma_project_profiles` bekommt 4 nullable Snapshot-Spalten pro Projekt
--      (source_template_id + text-label + integer-version-snapshot + apply-time).
--   2) Die neue FK auf `ma_project_profiles.source_template_id` läuft mit
--      ON DELETE RESTRICT — verhindert Template-Löschung, solange irgendein
--      Projekt-Profil darauf zeigt.
--   3) Die bestehenden FKs auf `workstreams`/`deliverables.source_template_id`
--      wechseln von SET NULL → RESTRICT (No-op nach #288, aber idempotent).
--   4) `apply_ma_project_template` befüllt die Snapshot-Spalten atomar im
--      selben Aufruf.
--   5) Historische Zeilen werden aus workstreams-Provenance rückwirkend
--      gestempelt (label kommt aus dem Live-Katalog, applied_at bleibt NULL
--      da der historische Zeitpunkt nicht rekonstruierbar ist).
--
-- Idempotent (add column if not exists / drop constraint if exists / create or
-- replace function). Non-destruktiv: Bestandsdaten bleiben unangetastet, alte
-- 1-Arg-Callers laufen weiter.

-- ---- 1) Snapshot-Spalten auf ma_project_profiles --------------------------
alter table public.ma_project_profiles
  add column if not exists source_template_id uuid,
  add column if not exists source_template_label text,
  add column if not exists source_template_version_snapshot integer,
  add column if not exists source_template_applied_at timestamptz;

-- ---- 2) FK ma_project_profiles.source_template_id → ma_project_templates (RESTRICT)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'ma_project_profiles'
      and constraint_name = 'ma_project_profiles_source_template_id_fkey'
  ) then
    alter table public.ma_project_profiles
      drop constraint ma_project_profiles_source_template_id_fkey;
  end if;
end $$;

alter table public.ma_project_profiles
  add constraint ma_project_profiles_source_template_id_fkey
    foreign key (source_template_id)
    references public.ma_project_templates(id)
    on delete restrict;

-- ---- 3) FKs workstreams/deliverables: SET NULL → RESTRICT ------------------
alter table public.workstreams
  drop constraint if exists workstreams_source_template_id_fkey;
alter table public.workstreams
  add constraint workstreams_source_template_id_fkey
    foreign key (source_template_id)
    references public.ma_project_templates(id)
    on delete restrict;

alter table public.deliverables
  drop constraint if exists deliverables_source_template_id_fkey;
alter table public.deliverables
  add constraint deliverables_source_template_id_fkey
    foreign key (source_template_id)
    references public.ma_project_templates(id)
    on delete restrict;

-- ---- 4) Backfill historischer ma_project_profiles-Zeilen -------------------
-- Pick one workstream per project (all share the same template-apply within
-- one project by construction). applied_at bleibt NULL — der historische
-- Zeitpunkt ist nicht rekonstruierbar; label kommt aus dem Live-Katalog
-- (falls das Template noch existiert; sonst bleibt label NULL).
update public.ma_project_profiles p
set source_template_id = ws.source_template_id,
    source_template_version_snapshot = ws.source_template_version,
    source_template_label = t.name
from (
  select distinct on (project_id) project_id, source_template_id, source_template_version
  from public.workstreams
  where source_template_id is not null
  order by project_id, id
) ws
left join public.ma_project_templates t on t.id = ws.source_template_id
where p.project_id = ws.project_id
  and p.source_template_id is null;

-- ---- 5) apply_ma_project_template: schreibt jetzt zusätzlich den Snapshot --
create or replace function public.apply_ma_project_template(p_project_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_tenant uuid;
  v_type text;
  v_caller uuid := auth.uid();
  v_tpl public.ma_project_templates%rowtype;
  v_phase_result jsonb;
  v_ws_created int := 0;
  v_del_created int := 0;
  v_applied_at timestamptz := now();
begin
  select tenant_id, project_type into v_tenant, v_type
  from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if v_type is distinct from 'ma' then
    raise exception 'template apply is only allowed for M&A projects' using errcode = 'P0001';
  end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to apply a template to this project' using errcode = '42501';
  end if;

  select * into v_tpl from public.ma_project_templates
  where id = p_template_id and tenant_id = v_tenant and is_active = true;
  if not found then
    raise exception 'template not found or inactive in this tenant' using errcode = 'P0002';
  end if;

  -- hard re-apply block (workstreams have unique(project_id, workstream_key) -> avoid dupes/collisions)
  if exists (select 1 from public.workstreams where project_id = p_project_id) then
    raise exception 'project already has workstreams; template can only be applied to an empty M&A project'
      using errcode = 'P0001';
  end if;

  -- phases: reuse the deployed PROJ-95 phase-model activation (idempotent, mandate-gated phase 2)
  v_phase_result := public.activate_ma_phase_model(p_project_id);

  -- workstreams: decoupled copy + provenance stamp
  insert into public.workstreams
    (tenant_id, project_id, workstream_key, label, goal, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, tw.workstream_key, tw.label, tw.goal, tw.confidentiality_level, tw.sort_order,
         v_caller, v_tpl.id, v_tpl.version
  from public.ma_template_workstreams tw
  where tw.template_id = v_tpl.id;
  get diagnostics v_ws_created = row_count;

  -- deliverables: remap workstream_key -> freshly inserted workstream_id
  insert into public.deliverables
    (tenant_id, project_id, workstream_id, name, description, status, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, w.id, td.name, td.description, td.status, td.confidentiality_level, td.sort_order,
         v_caller, v_tpl.id, v_tpl.version
  from public.ma_template_deliverables td
  join public.workstreams w
    on w.project_id = p_project_id and w.workstream_key = td.workstream_key
  where td.template_id = v_tpl.id;
  get diagnostics v_del_created = row_count;

  -- PROJ-141-γ3: per-project provenance snapshot on ma_project_profiles.
  -- The profile is created before apply by wizard-finalize; if for some reason
  -- it's missing, the RPC still succeeds without snapshot (non-blocking
  -- hardening, not a correctness gate). UPDATE stays inside the same
  -- SECURITY DEFINER transaction — atomic with the workstream/deliverable
  -- copy above.
  update public.ma_project_profiles
  set source_template_id = v_tpl.id,
      source_template_label = v_tpl.name,
      source_template_version_snapshot = v_tpl.version,
      source_template_applied_at = v_applied_at
  where project_id = p_project_id;

  return jsonb_build_object(
    'template_id', v_tpl.id,
    'template_version', v_tpl.version,
    'phase_model', v_phase_result,
    'workstreams_created', v_ws_created,
    'deliverables_created', v_del_created,
    'applied_at', v_applied_at
  );
end;
$$;

revoke all on function public.apply_ma_project_template(uuid, uuid) from public, anon;
grant execute on function public.apply_ma_project_template(uuid, uuid) to authenticated;

-- ---- 6) Column + function comments ----------------------------------------
comment on column public.ma_project_profiles.source_template_id is
  'PROJ-141-γ3: template used to seed this M&A project (RESTRICT — the template cannot be dropped while a profile still references it).';
comment on column public.ma_project_profiles.source_template_label is
  'PROJ-141-γ3: text snapshot of the template label at apply-time (survives future label changes and template deletes; falls back to NULL for historical rows whose template has already been dropped).';
comment on column public.ma_project_profiles.source_template_version_snapshot is
  'PROJ-141-γ3: integer snapshot of the template version at apply-time (paired with source_template_label).';
comment on column public.ma_project_profiles.source_template_applied_at is
  'PROJ-141-γ3: timestamp when the template was applied. NULL for pre-γ3 rows (historical apply-time not reconstructable).';
comment on function public.apply_ma_project_template(uuid, uuid) is
  'PROJ-96 + PROJ-141-γ3: atomically seeds a fresh M&A project from a template (reuses activate_ma_phase_model for phases; copies workstreams + deliverables with provenance stamp; stamps ma_project_profiles.source_template_* snapshot columns). Hard re-apply block.';
