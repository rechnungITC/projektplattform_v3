-- =============================================================================
-- PROJ-35 Phase 35-β: phases.is_critical — Critical-Path-Marker
-- =============================================================================
-- Domain-autoritativer Marker für PMs: "Diese Phase ist auf dem kritischen
-- Pfad" (z.B. ERP-Datenmigration, Cutover, Genehmigung). Treibt den
-- Critical-Path-Indikator im Stakeholder-Health-Dashboard (Phase 35-γ).
--
-- Default false — opt-in. Heuristik (milestone.target_date < project.end - 14d)
-- bleibt in der TS-Compute als Fallback wenn alle Phasen false sind.
-- =============================================================================

alter table public.phases
  add column if not exists is_critical boolean not null default false;

comment on column public.phases.is_critical is
  'PROJ-35 Phase 35-β — Domain-Marker: PM kennzeichnet Phase als kritisch '
  'für den Projekterfolg. Treibt Critical-Path-Indikator + Stakeholder-Health-'
  'Dashboard. Default false (opt-in).';
