# PROJ-139: Core — Phasen-Status „ausgesetzt" (suspended) + State-Machine

## Status: In Progress (Backend gebaut 2026-06-24 — CHECK 4→5 + RPC-Übergänge live, UI + Impact-Analyse + Live-Smoke; → /qa)
**Created:** 2026-06-24
**Origin:** CIA-Review zu PROJ-95 (M&A-Phasenmodell) 2026-06-24 — E6 als eigene Core-Vor-Slice herausgelöst (User-bestätigt)
**Priority:** P1 (Vorbedingung für PROJ-95 AC-95-2)

## Implementation Notes — Backend + UI (2026-06-24)

Gebaut als isolierte Core-Slice (kein M&A-Sonderweg), genau nach Tech-Design. **Kein neuer Dep.**

**Migration** `20260624105817_proj139_phase_suspended_status.sql` (in Prod; Repo-Dateiname == prod-registrierte Version per PROJ-134):
- `phases_status_check` idempotent 4→5 (`+ suspended`); Bestandszeilen unberührt (Default unverändert).
- `transition_phase_status` (CREATE OR REPLACE, Body verbatim aus Live-Prod via `pg_get_functiondef`, nur Übergangskette geändert; ACL/SECURITY DEFINER/search_path erhalten): neue Übergänge `in_progress→suspended`, `suspended→in_progress`, `suspended→cancelled`. Alle übrigen unverändert.

**Pflicht-Impact-Analyse** (AC-139-3): `docs/proj139-phase-suspended-impact-analysis.md` — alle `phases.status`-Leser inventarisiert + auf Verträglichkeit geprüft. Befund: Blast-Radius TypeScript-erzwungen (zwei `Record<PhaseStatus>`-Maps → Compile-Fehler bis behandelt), `switch`-Leser (Gantt/Timeline) fail-safe via `default`, Method-Gating + Reports lesen den Wert nicht erschöpfend, Audit bereits aktiv. **Kein stiller Bruch.**

**UI** (AC-139-4): `src/types/phase.ts` (`PhaseStatus` + `PHASE_STATUSES` + Label „Ausgesetzt" + `ALLOWED_PHASE_TRANSITIONS`), `phase-status-badge` (amber, kein Strike-through), `gantt-view.barClasses` + `phases-timeline.pillClasses` (amber, distinkt von cancelled). `phase-status-transition-dialog` propagiert „Aussetzen/Fortsetzen" automatisch über `ALLOWED_PHASE_TRANSITIONS`.

**Audit** (AC-139-5): `_tracked_audit_columns('phases')` enthält `status` bereits → Übergänge auf/aus `suspended` werden automatisch auditiert (verifiziert, kein Neubau).

**Live-RPC-Smoke** (AC-139-6, Pflicht, gegen Prod, 0 Residue via ROLLBACK_MARKER): `in_progress→suspended` ✓, `suspended→in_progress` ✓, `suspended→cancelled` ✓, Negativfall `suspended→completed` = REJECTED(23514). Phase nach Smoke unverändert `planned`.

**Quality-Gates:** lint 0, tsc 14 baseline/0 neu (die 2 routing.test.ts-`assistant_settings`-Fehler sind Bestand), vitest grün (143 Regression + 4 neue `phase.test.ts`), build clean.

**Offen:** /qa (Regression PROJ-19/26 + E2E suspended-Darstellung).

> **Reuse-Klasse:** Core-Hygiene/Erweiterung (analog PROJ-29/PROJ-68). **Kein M&A-Sonderweg** — `phases.status` ist eine Querschnitts-Kerntabelle; „ausgesetzt" ist auch für Nicht-M&A-Projekte sinnvoll und gehört deshalb in den Core, nicht in eine M&A-Feature-Slice.

## Summary

Die deployte `phases`-Tabelle (PROJ-19, Migration `20260428090000`) erlaubt im `status`-CHECK nur **vier** Werte: `planned, in_progress, completed, cancelled`. PROJ-95 (AC-95-2) und allgemeine Projektsteuerung brauchen einen **fünften** Zustand **„ausgesetzt" (`suspended`)** — eine Phase, die temporär pausiert ist (z. B. Deal on hold), ohne abgebrochen (`cancelled`) zu sein.

Diese Slice erweitert den Core um genau diesen Status — Schema-CHECK **und** State-Machine (`transition_phase_status`) **und** UI-Anzeige — als **eine kleine, isoliert revertierbare Hygiene-Slice mit Pflicht-Impact-Analyse**. Sie wurde aus PROJ-95 herausgelöst, weil `phases.status` von 15+ Migrationen, der State-Machine, Gantt-/Timeline-UI, Method-Gating (PROJ-26), Audit-Whitelist und Report-Snapshots gelesen wird → **HOCH-Blast-Radius**, der nicht en passant in einer M&A-Feature-Slice landen darf.

## Dependencies

- **Requires:** PROJ-19 (Phasen/Milestones — die zu erweiternde Tabelle + `transition_phase_status`-RPC).
- **Blocks:** PROJ-95 AC-95-2 („Status … ausgesetzt" pflegbar). PROJ-95 ist ansonsten unabhängig baubar; nur dieses eine AC hängt an PROJ-139.
- **Influences:** PROJ-26 (Method-Gating liest `phases.status`), Gantt/Timeline-UI, PROJ-21 Report-Snapshots.

## User Stories

- **Als Projektleiter:in** möchte ich eine Phase **aussetzen** können (nicht abbrechen), wenn der Deal/das Projekt temporär pausiert, damit die Phase erhalten bleibt und später fortgesetzt werden kann.
- **Als Entwickler:in** möchte ich, dass „ausgesetzt" ein **erstklassiger Core-Status** mit definierten Übergängen ist (nicht ein M&A-Sonderfeld), damit Gantt, Timeline, Method-Gating und Audit ihn einheitlich behandeln.

## Acceptance Criteria

- [ ] `phases.status`-CHECK akzeptiert zusätzlich `suspended` (idempotente Migration auf die deployte Tabelle; Bestandsdaten unverändert).
- [ ] `transition_phase_status` kennt definierte Übergänge: `in_progress → suspended` (aussetzen) und `suspended → in_progress` (fortsetzen); `suspended → cancelled` (endgültig abbrechen) erlaubt. **Keine** unerreichbaren oder unkontrolliert verlassbaren Zustände — jeder erlaubte Übergang ist explizit, alle anderen abgewiesen.
- [ ] **Pflicht-Impact-Analyse dokumentiert** (gitnexus/grep): alle Leser von `phases.status` (State-Machine, `components/phases/*`, `use-phases`, PROJ-26 Method-Gating, Report-Snapshots, Audit-Whitelist) sind aufgelistet und auf Verträglichkeit mit dem neuen Wert geprüft.
- [ ] UI zeigt `suspended` korrekt an: `phase-status-badge` (eigene Farbe/Label „Ausgesetzt"), `phase-status-transition-dialog` (Aktion „Aussetzen"/„Fortsetzen"), Gantt/Timeline-Darstellung.
- [ ] `phases.status` ist bereits in `_tracked_audit_columns` (PROJ-10) → Statuswechsel auf/aus `suspended` werden auditiert (verifizieren, kein Neubau).
- [ ] **Live-RPC-Smoke (Pflicht)** gegen Prod: `in_progress→suspended→in_progress` und `suspended→cancelled` durchspielen, 0 Residue.
- [ ] Regression: bestehende PROJ-19-Phasen- + PROJ-26-Method-Gating-Tests unverändert grün; vitest grün; lint 0; build clean.

## Out of Scope

- M&A-spezifische Phasen-Logik (das ist PROJ-95).
- `milestones.status` (separate Domäne, kein „suspended"-Bedarf belegt).
- Genehmigungspflicht beim Aussetzen/Fortsetzen (Approval-Quorum) → PROJ-110/PROJ-31.

## Tech Design (Solution Architect)

> **Authored:** 2026-06-24 · CIA-reviewed (E6, HOCH-Risiko). Keine Code-/SQL-Snippets.

### Was gebaut wird
```
PROJ-139 Core suspended-status
├── Migration (idempotent) auf deployte `phases`
│   └── status-CHECK: 4 → 5 Werte (+ suspended)
├── transition_phase_status (RPC) — Übergangsregeln ergänzt
│   └── in_progress→suspended, suspended→in_progress, suspended→cancelled
├── UI
│   ├── phase-status-badge        ← Label „Ausgesetzt" + Farbe (REUSE-Erweiterung)
│   ├── phase-status-transition-dialog ← Aktionen Aussetzen/Fortsetzen
│   └── gantt-view / phases-timeline   ← Darstellung suspended
└── Impact-Analyse-Doc (Pflicht) — alle status-Leser verifiziert
```

### Datenmodell in Klartext
Ein **zusätzlicher erlaubter Wert** in einer bestehenden Statusspalte — **keine neue Tabelle, keine neue Spalte**. Der Wert verhält sich wie ein normaler Phasen-Status; die State-Machine definiert, von wo man hinein- und herauskommt. Bestandsphasen bleiben unberührt (Default unverändert).

### Tech-Entscheidung (CIA-gelockt, E6)
**Core-CHECK erweitern statt M&A-Sonderweg** — ein paralleler M&A-Status-Mechanismus würde Gantt/Timeline/Method-Gating zweigleisig machen. „Ausgesetzt" ist allgemein sinnvoll → Core. **Trade-off:** HOCH-Risiko-Migration auf eine quer referenzierte Tabelle → daher Pflicht-Impact-Analyse + eigene kleine Slice (nicht in PROJ-95 vermengt) + Live-Smoke.

### Migration / Was sich außerhalb ändert
- `supabase/migrations/…_proj139_phase_suspended_status.sql` (CHECK-Erweiterung; idempotent).
- `transition_phase_status`-RPC-Body (Übergangsregeln) — Patch-Muster wie bei bestehenden State-Machine-RPCs.
- `components/phases/{phase-status-badge, phase-status-transition-dialog, gantt-view, phases-timeline}` — Anzeige.
- **Impact-Analyse Pflicht** auf `transition_phase_status` + PROJ-26 Method-Gating **vor** Umsetzung (gitnexus `gitnexus_impact`).

### Risiko + Trade-off
| Risiko | Sev | Mitigation |
|---|---|---|
| Neuer Enum-Wert ohne Übergangsregeln → unerreichbarer/unkontrolliert verlassbarer Zustand | HOCH | Explizite Übergänge in State-Machine; alle anderen abgewiesen; Live-Smoke. |
| Stiller Leser von `status` bricht an neuem Wert (z. B. Method-Gating, Report) | HOCH | Pflicht-Impact-Analyse listet + prüft alle Leser vor Merge. |
| UI zeigt unbekannten Status als leeres Badge | NIEDRIG | Badge/Dialog/Gantt explizit erweitert + getestet. |

### Dependencies (Pakete)
**Keine neuen npm-Pakete.**

### Locked design decisions
1. **Core-Erweiterung**, kein M&A-Sonderweg.
2. Übergänge: `in_progress↔suspended`, `suspended→cancelled`.
3. **Pflicht-Impact-Analyse** + **Live-RPC-Smoke** vor Approved.
4. Eigene Slice, isoliert revertierbar (eine Migration + RPC-Patch + UI).

---
<!-- Sections below are added by subsequent skills -->
