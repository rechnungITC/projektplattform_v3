# PROJ-25: Drag-and-Drop Stack — Backlog↔Sprint + Gantt voll

## Status: Planned
**Created:** 2026-04-30
**Last Updated:** 2026-04-30

## Summary
Macht das Backlog + den Gantt interaktiv per Drag-and-Drop. Drei Surfaces:

1. **Backlog ↔ Sprint** — Stories per DnD vom Backlog in den aktuellen Sprint ziehen (oder zurück).
2. **Gantt-Verschieben + Resize** — Phasen-/Meilenstein-Balken mit der Maus verschieben (Datumsverschiebung) oder die rechte Kante ziehen (Dauer-Resize).
3. **Gantt-Dependencies-Linien** — per Drag von einem Balken zum anderen eine Vorgänger-Nachfolger-Beziehung modellieren; visualisiert als Pfeil-Linie.

Alle drei Surfaces sind Erweiterungen bestehender PROJ-7- und PROJ-19-Module. Keine neuen Datentabellen, aber ggf. neue Spalten/Felder + neue API-Endpunkte für Bulk-Updates und Dependency-Pflege.

## Dependencies
- **Requires PROJ-7** (Project Room — Kanban / Scrum / Gantt-Slices) — Surface, das interaktiv wird.
- **Requires PROJ-9** (Work Items + sprint_id).
- **Requires PROJ-19** (Phases + Milestones — Gantt-Datengrundlage).
- **Requires PROJ-23** (Sidebar-Layout) — DnD-Targets brauchen einen stabilen Layout-Wrapper. **Empfehlung**: PROJ-25 wird erst nach PROJ-23 gebaut.
- **Soft requires PROJ-24** (Cost-Stack) — beim Drag-Feedback wäre eine Cost-Anzeige hilfreich, ist aber nicht hard-required.

## V2 Reference Material
- V2 hatte rudimentäre DnD-Patterns aber kein Gantt mit Dependencies-Linien. V3 setzt hier neu auf.

## User Stories
- **Als Scrum-Master** möchte ich beim Sprint-Planning Stories mit der Maus aus dem Backlog in den aktiven Sprint ziehen — ohne Modal, ohne extra Klicks.
- **Als Scrum-Master** möchte ich eine Story aus dem aktuellen Sprint per Drag wieder in den Backlog zurückziehen können, falls wir nicht mehr alles schaffen.
- **Als Projektleiter:in (Wasserfall/PMI)** möchte ich Phasen-Balken im Gantt einfach mit der Maus verschieben, statt Datums-Felder einzutippen.
- **Als Projektleiter:in** möchte ich die Dauer einer Phase ziehen, indem ich an der rechten Kante des Balkens fasse — sofort visuelles Feedback, sofortige Plan-End-Datum-Aktualisierung.
- **Als Projektleiter:in** möchte ich Vorgänger-Nachfolger-Beziehungen direkt im Gantt ziehen — von der rechten Kante einer Phase auf die linke Kante einer anderen — sodass eine sichtbare Pfeil-Verknüpfung entsteht.
- **Als Auditor:in** möchte ich, dass jede DnD-Aktion einen Audit-Eintrag erzeugt, damit nachvollziehbar bleibt, wer wann welche Datums- oder Sprint-Zuordnung geändert hat.
- **Als mobiler Nutzer** möchte ich den Gantt zumindest **lesen** können, auch wenn DnD auf Touch-Geräten nicht zur Verfügung steht — Touch-DnD ist bewusst out-of-scope.

## Acceptance Criteria

### ST-01 Backlog ↔ Sprint (DnD)
- [ ] Auf der Backlog- oder Sprint-Board-Seite (PROJ-7): zwei Spalten / Container — links der Backlog-Pool, rechts der aktive Sprint.
- [ ] Drag-Handle pro Story-Card (8-dot-Icon links).
- [ ] Beim Drag startet ein "Ghost"-Element mit der Card-Vorschau; das Original bleibt halb-transparent.
- [ ] Beim Drop in den Sprint-Container: API-Call `PATCH /work-items/[wid]/sprint` mit `sprint_id = activeSprint.id`. Bei Drop in den Backlog-Container: `sprint_id = null`.
- [ ] Multi-Select per Cmd/Ctrl+Click: mehrere Stories gleichzeitig draggen → API-Bulk-Endpoint `PATCH /work-items/sprint-bulk` mit `{work_item_ids: [...], sprint_id}`.
- [ ] Reihenfolge im Sprint per DnD (Story-Position) — neue Spalte `work_items.position` (existiert bereits), sortiert nach `position` aufsteigend.
- [ ] Optimistic-Update im Frontend: Card springt sofort um, Server-Antwort revertiert bei Fehler.
- [ ] Audit-Eintrag pro Sprint-Change (nutzt PROJ-10-existing tracked-column `sprint_id`).

### ST-02 Gantt-Verschieben (DnD)
- [ ] Im Gantt-Modul (PROJ-7 + PROJ-19 phases-timeline): jeder Phasen-/Meilenstein-Balken ist horizontal draggable.
- [ ] Beim Drag verschieben sich `planned_start` und `planned_end` um den gleichen Tagesoffset (Dauer bleibt gleich).
- [ ] Snap-to-Day-Grid: minimaler Inkrement = 1 Kalendertag.
- [ ] Live-Preview während des Drags (Balken-Schatten zeigt neue Position); Server-Update erst beim Mouseup.
- [ ] API: `PATCH /api/projects/[id]/phases/[pid]` mit `{planned_start, planned_end}` (existing).
- [ ] Bei Phasen mit Meilensteinen: Meilensteine bewegen sich proportional mit (relative Position bleibt gleich).
- [ ] Nicht-DnD-fähige Items (z.B. abgeschlossene Phasen mit `status='completed'`) zeigen ein "🔒"-Icon und sind nicht draggable.

### ST-03 Gantt-Resize (DnD)
- [ ] Rechte Kante jedes Balkens hat einen 8-px-Resize-Handle (Cursor wechselt zu `col-resize`).
- [ ] Beim Ziehen ändert sich `planned_end`; `planned_start` bleibt unverändert.
- [ ] Mindest-Dauer: 1 Tag (planned_end ≥ planned_start).
- [ ] Snap-to-Day-Grid wie bei Verschieben.
- [ ] Audit nutzt PROJ-10-existing tracked-column `planned_end`.

### ST-04 Gantt-Dependencies-Linien
- [ ] Neue Tabelle `phase_dependencies` mit Feldern: `id, tenant_id, project_id, predecessor_phase_id, successor_phase_id, kind ('finish_to_start' default), created_by, created_at`. UNIQUE auf `(predecessor_phase_id, successor_phase_id)`.
- [ ] Soft-Constraint: keine zyklischen Dependencies (DB-CHECK + Application-Layer-Reject auf Zyklen).
- [ ] Im Gantt: jeder Balken hat zwei "Connector-Hotspots" (linke + rechte Kante als kleine Kreise, sichtbar nur bei Hover).
- [ ] Drag von rechtem Hotspot der Phase A auf linken Hotspot der Phase B: erzeugt eine Dependency `A → B` mit `kind='finish_to_start'`.
- [ ] Visualisierung: SVG-Pfeile zwischen den Hotspots; bei Phase-Drag bewegen sich die Pfeile mit.
- [ ] Klick auf einen Pfeil öffnet ein Mini-Popover mit "Dependency entfernen"-Action.
- [ ] **MVP-Constraint**: Dependencies sind rein visuell + persistiert. **Kein automatisches Reparenting** (wenn Phase A verschoben wird, wird Phase B nicht automatisch nachgezogen). Das wäre PROJ-25b "Dependency-driven Auto-Schedule".

### ST-05 API-Endpunkte (neu)
- [ ] `PATCH /api/projects/[id]/work-items/sprint-bulk` — Bulk-Update von Sprint-Zuordnungen (für DnD-Multi-Select).
- [ ] `POST /api/projects/[id]/phase-dependencies` — neue Dependency.
- [ ] `DELETE /api/projects/[id]/phase-dependencies/[depId]` — Dependency entfernen.
- [ ] `GET /api/projects/[id]/phase-dependencies` — alle Dependencies eines Projekts (für initial-render).

### ST-06 UX-Affordances + A11y
- [ ] Cursor wechselt zu `grab` beim Hover über DnD-Handle, zu `grabbing` während des Drags.
- [ ] Aria-Live-Region bei DnD-Aktionen: `"Story X verschoben in Sprint Y"`.
- [ ] Keyboard-Alternative für DnD: Story selektieren mit `Space`, mit Pfeiltasten verschieben, mit `Space` ablegen (dnd-kit hat das eingebaut).
- [ ] Focus-Trap bei aktivem Drag — Escape bricht den Drag ab.
- [ ] Visuelle Drop-Zonen während des Drags (Backlog-Container und Sprint-Container hervorgehoben).

### ST-07 Performance
- [ ] DnD darf bei 100+ Backlog-Items und 50+ Sprint-Items nicht ruckeln.
- [ ] Gantt mit 30 Phasen + 100 Meilensteinen + 50 Dependencies → Drag-Feedback 60 fps.
- [ ] Bulk-Update-Endpunkt: 50 Stories gleichzeitig in <1 s.

## Edge Cases
- **Drop auf den gleichen Container**: kein API-Call, keine UI-Änderung (Identity-Check).
- **Drop während Server-Update einer anderen Action**: Optimistic-Update wird gequeued; bei Konflikt (z.B. Story wurde gleichzeitig anderswo geändert) Revertieren + Toast.
- **Drag einer abgeschlossenen Story**: blockiert mit Toast "Abgeschlossene Stories können nicht zwischen Sprints verschoben werden".
- **Resize unter Mindestdauer**: snap auf 1-Tag-Mindestdauer; visueller Anschlag beim Drag.
- **Dependency-Zyklus** (Phase A → B → C → A): Server lehnt ab mit 422 `dependency_cycle_detected`.
- **Self-Dependency** (Phase A → A): Server lehnt ab.
- **Dependency auf eine in einem anderen Projekt liegende Phase**: Server lehnt ab mit 422 `cross_project_dependency`.
- **Phase wird gelöscht, hat aber Dependencies**: ON DELETE CASCADE auf `phase_dependencies` — Pfeile verschwinden automatisch.
- **Touch-Device** (iPad / Telefon): DnD-Bibliothek (dnd-kit) unterstützt Touch nativ; auf sehr kleinen Bildschirmen wird der Gantt als read-only angezeigt mit Hinweis.
- **Zwei User draggen gleichzeitig die gleiche Story**: Last-Write-Wins; der spätere Drop überschreibt den früheren.
- **Verlorenes Drag-Feedback wegen Browser-Tab-Wechsel**: dnd-kit cancelt sauber bei Window-Blur.

## Technical Requirements
- **Stack**: Next.js 16 + React 19 + `@dnd-kit/core` + `@dnd-kit/sortable` (existiert evtl. bereits durch frühere Slices — Audit). Für Gantt-Resize ggf. zusätzlich Custom-Hooks.
- **Multi-tenant**: bestehende RLS-Patterns (project-member SELECT, editor/lead/admin write) auf `phase_dependencies`.
- **Validation**: Zod auf allen DnD-Endpunkten; Cycle-Detection als Postgres-Function (recursive CTE).
- **Performance**: 60 fps Animation; Bulk-Updates ≤ 1 s.
- **Module-Toggle**: kein eigener; PROJ-25 ist UI-Foundation.
- **Audit**: Sprint-Move + Phase-Move + Phase-Resize via PROJ-10 existing tracked columns. Phase-Dependencies bekommen Audit (neue entity_type-Whitelist-Erweiterung).
- **Storage**: keine, nur Postgres + bestehende Tabellen + neue `phase_dependencies`.

## Out of Scope (deferred)

### PROJ-25b (next slice)
- **Dependency-driven Auto-Schedule** — wenn Phase A verschoben wird, werden alle Successor-Phasen automatisch nachgezogen.
- **Critical-Path-Berechnung + Visualisierung** (rote Pfade durch das Gantt).
- **Mehrere Dependency-Kinds** (`start_to_start`, `finish_to_finish`, `start_to_finish`).

### PROJ-25c (später)
- Touch-Device-DnD-Politur (eigene Geste, Snap-Magnification).
- Multi-User-Realtime-Cursors während gemeinsamer Bearbeitung.
- Undo-Stack für DnD-Aktionen ("letzte 10 Aktionen rückgängig").
- Keyboard-Shortcuts für häufige Sprint-Operationen.

### Explizite Non-Goals
- **Kein PERT** (Programm-Evaluierungs- und Review-Technik) — wir machen einfaches Gantt, keine Statistik.
- **Keine Resourcen-Histogramme** im Gantt — bleibt PROJ-11 vorbehalten.
- **Keine Auto-Scheduling-Engine** in MVP (PROJ-25b).

## Suggested locked design decisions for `/architecture`

1. **DnD-Library**
   - **A. `@dnd-kit/core` + `@dnd-kit/sortable`** — modern, performant, accessibility-first, Touch-Support.
   - B. `react-beautiful-dnd` (deprecated/Wartungsmodus).
   - C. Eigenbau — zu viel Aufwand.
   - **Empfehlung A**.

2. **Gantt-Library**
   - **A. Eigenbau auf SVG-Basis** — volle Kontrolle, kein Vendor-Lock-in, gleicher Stack wie Status-Light + Reports. Resize + Dependencies-Linien sind machbar mit ~600 LOC.
   - B. `gantt-task-react` oder `react-gantt-timeline` — schneller, aber Customization (Theme, A11y, Tenant-Branding) wird zur Last.
   - **Empfehlung A** für maximale Konsistenz mit V3-Codebase und PROJ-17-Branding.

3. **Cycle-Detection**
   - **A. Postgres recursive CTE als CHECK-Trigger** auf `phase_dependencies` — Server-side, fail-safe.
   - B. Application-Layer-Check vor INSERT.
   - **A** als zweite Verteidigungslinie + B für saubere User-Errors. Beides empfohlen.

4. **Dependency-Lifecycle bei Phase-Status**
   - **A. Dependencies bleiben** auch wenn die Predecessor-Phase auf `completed` gesetzt wird (historische Information bleibt sichtbar).
   - B. Auto-Cleanup von Dependencies abgeschlossener Phasen.
   - **Empfehlung A** — Audit-Trail bleibt erhalten, UI kann sie ausgrauen.

5. **Bulk-Sprint-Move-Atomicity**
   - **A. Eine einzelne Transaktion** für alle Items im Bulk — entweder alle oder keine.
   - B. Best-Effort: jeder Item-Move einzeln, Teil-Erfolge möglich.
   - **Empfehlung A** — saubere Semantik, einfacheres Recovery.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
