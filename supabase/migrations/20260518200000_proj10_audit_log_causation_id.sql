-- =============================================================================
-- PROJ-10-Δ — `causation_id` extension on audit_log_entries
-- =============================================================================
-- Vor-Story für PROJ-65 ε.3 Live-Propagation (CIA-Review 2026-05-18, P1.3).
--
-- Motivation: Live-Plan-Mutates aus dem Trajectory-Graph schreiben
-- typischerweise N audit-rows in einer einzigen User-Aktion (z.B.
-- Stakeholder-Swap propagiert auf 7 Folge-Items = 7 audit-rows).
-- Ohne causation_id sind diese Rows nicht als zusammengehörig erkennbar
-- — Undo-Operationen können nicht atomar gruppiert werden, Audit-Anzeige
-- listet jede Field-Änderung einzeln statt als gruppierten Plan-Mutate.
--
-- Diese Migration:
--   1. Fügt `causation_id UUID NULL` an audit_log_entries an
--   2. Index für Lookup nach causation_id (Undo + UI-Gruppierung)
--   3. Keine Default-Werte, keine NOT-NULL — bestehender Audit-Code
--      schreibt weiter ohne Änderung. Nur PROJ-65-Live-Propagation
--      setzt explizit eine causation_id.
--
-- Reuse-Strategie: PROJ-10 bleibt kanonische Audit-Quelle. Eigene
-- plan_change_audit_log-Tabelle wurde im CIA-Review verworfen.
-- =============================================================================

alter table public.audit_log_entries
  add column if not exists causation_id uuid;

create index if not exists audit_log_causation_idx
  on public.audit_log_entries (causation_id, changed_at)
  where causation_id is not null;
