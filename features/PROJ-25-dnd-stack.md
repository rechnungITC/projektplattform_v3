# PROJ-25: Drag-and-Drop Stack — Backlog↔Sprint + Gantt voll

## Status: Architected
**Created:** 2026-04-30
**Last Updated:** 2026-05-03

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

> **Architected:** 2026-05-03
> **Author:** Solution Architect (post-CIA-Review 2026-05-03 + ADR-004)
> **Architecture-Referenzen:** [ADR-004 — Projekt → Phase → Arbeitspaket → To-do-Hierarchie + polymorphe Dependencies](../docs/decisions/project-phase-workpackage-todo-hierarchy.md), [PROJ-9-Round-2 (Polymorphic-Deps-Migration)](PROJ-9-work-item-metamodel-backlog.md), [PROJ-36 (WBS-Hierarchie)](PROJ-36-waterfall-wbs-hierarchy-rollup.md).

### Spec-Korrekturen aus ADR-004

Die ursprüngliche Spec-Section **ST-04 plante eine separate `phase_dependencies`-Tabelle** — das ist mit ADR-004 **überholt**. Stattdessen verwendet PROJ-25 die einheitliche, polymorphe `dependencies`-Tabelle (`from_type`/`from_id`/`to_type`/`to_id`/`constraint_type`), die in **PROJ-9-Round-2** migriert wird. **Keine neue Tabelle in PROJ-25 mehr.**

Zusätzlich aus dem CIA-Review von 2026-05-03 angenommen:
- **Phasen-Container ziehen Work-Item-Kinder proportional mit** (nicht in Original-Spec).
- **Cross-Project-Dependencies werden als Indikator-Pfeil + Tooltip** angezeigt.
- **Critical-Path wird manuell** über die polymorphe `dependencies`-Tabelle berechnet (Postgres recursive CTE).
- **Library-Wechsel:** statt Eigenbau-SVG verwenden wir die **MIT-Lizenzierte SVAR React Gantt** als Foundation.

### A. Was PROJ-25 baut (Surface-Liste)

PROJ-25 ist die **Interaktivitäts-Schicht** auf bestehenden Plan-Daten. Nichts an der Plan-Logik ändert sich — nur die Eingabe wird per Maus statt Formular.

1. **Backlog↔Sprint** — Stories per Maus zwischen Backlog-Pool und aktivem Sprint verschieben.
2. **Gantt-Move** — Phasen- oder Work-Item-Balken horizontal verschieben (Datumsverschiebung).
3. **Gantt-Resize** — Rechte Kante eines Balkens ziehen, um die Dauer zu ändern.
4. **Gantt-Dependency-Linien** — von einem Balken zum nächsten ziehen, um eine Vorgänger-Nachfolger-Beziehung zu erstellen (FS / SS / FF / SF).
5. **Phasen-Container-Mitziehen** *(neu)* — Wird eine Phase verschoben, bewegen sich alle Work-Items in der Phase um den gleichen Tagesoffset mit.
6. **Critical-Path-Visualisierung** *(neu, manuell)* — Der kritische Pfad wird als rote Pfeil-Kette über das Gantt gelegt.
7. **Cross-Project-Indikator** *(neu)* — Dependencies, die in andere Projekte führen, werden am Rand des Gantt mit einem dezenten Pfeil + Tooltip angezeigt.

### B. Component Structure (Visual Tree)

```
ProjectRoom (PROJ-7)
├── Backlog Module (Scrum-Method-Visibility)
│   ├── BacklogPool (DnD-Zone, Source)
│   │   └── StoryCard (draggable, dnd-kit)
│   ├── ActiveSprintColumn (DnD-Zone, Target)
│   │   └── StoryCard (sortable within sprint)
│   └── DragOverlay (Ghost-Card mit Vorschau)
│
└── Gantt Module (Waterfall-Method-Visibility)
    ├── GanttToolbar
    │   ├── ZoomLevel (Tag / Woche / Monat)
    │   ├── CriticalPathToggle
    │   └── ExportButton (SVG/PDF, deferred)
    ├── GanttCanvas (SVAR React Gantt, MIT)
    │   ├── TimelineHeader (Datum-Skala, Snap-to-Day)
    │   ├── PhaseBar (draggable + resizable + Container für Kinder)
    │   │   └── WorkItemBar (draggable + resizable, child-of-phase)
    │   ├── DependencyLineLayer
    │   │   ├── IntraProjectArrow (FS / SS / FF / SF)
    │   │   ├── CrossProjectIndicator (kleiner Pfeil + Tooltip am Rand)
    │   │   └── CriticalPathOverlay (rote Pfade über bestehenden Linien)
    │   └── ConnectorHotspots (sichtbar bei Hover, links/rechts an jedem Balken)
    └── GanttSidePanel (Klick-Detail bei Pfeil/Balken)
        ├── DependencyEditor (Constraint-Type + Lag)
        └── ItemDetailDrawer (für Work-Item / Phase)
```

### C. Datenmodell (plain language)

PROJ-25 legt **keine eigenen Tabellen** an. Es nutzt:

- **`work_items`** (PROJ-9, bestehend) — für Backlog-Stories, Sprint-Members, Gantt-Work-Items. PROJ-25 ändert **keine Spalten**, sondern updated existierende Felder via API:
  - `sprint_id` (für Backlog↔Sprint).
  - `position` (für Sortierung im Sprint).
  - `planned_start`, `planned_end` (für Gantt-Move + Resize).
- **`phases`** (PROJ-19, bestehend) — für Phasen-Balken. Dieselben Felder wie Work-Items.
- **`dependencies`** (polymorph, PROJ-9-Round-2 / ADR-004) — wird in PROJ-25 nur **gelesen + beschrieben**, nicht definiert. Schema-Eigentümer: PROJ-9-Round-2.
- **`work_items.phase_id`** (bestehend, PROJ-19) — wird benutzt, um Children-of-Phase zu finden für proportionalen Container-Drag.

**Critical-Path-Berechnung** läuft als **Postgres-Function** (kein neues Tabellen-Schema, nur eine read-only RPC):
- Input: `project_id`.
- Output: Liste von Work-Item-/Phasen-IDs auf dem kritischen Pfad + Float-Werte pro Item.
- Implementierung: rekursive CTE über die polymorphe `dependencies`-Tabelle (Forward-Pass für Earliest-Start, Backward-Pass für Latest-End, Float = Latest-Start − Earliest-Start; CP = alle Items mit Float = 0).
- Performance-Cache: pro Projekt, invalidiert bei jeder Plan-Änderung. MVP: Re-Compute on-demand im Frontend (Tracking-Refresh-Latenz).

**Cross-Project-Indikator** liest `dependencies` mit `from_type/to_type` + Tenant-Boundary-Check. Items, deren Endpunkt in einem anderen Projekt liegt, werden als "external" markiert.

### D. Tech-Entscheidungen (mit Begründung)

| # | Entscheidung | Begründung |
|---|---|---|
| **D1** | **Gantt-Library: SVAR React Gantt v2.4 (MIT, Free Core)** statt Eigenbau-SVG | CIA-Review 2026-05-03: SVAR liefert React 19 + DnD + Resize + Dependency-Drawing + Drag-to-Connect bereits eingebaut. Spart geschätzt 400–600 LOC + Wartungsaufwand bei DnD-Hotspots, A11y, Touch. MIT-Lizenz → kein Vendor-Lock-in. **Critical-Path bleibt PRO-Feature**, daher manuell ergänzt (siehe D3). |
| **D2** | **Backlog↔Sprint-DnD: `@dnd-kit/core` + `@dnd-kit/sortable`** | Modern, aktiv gewartet, accessibility-first, Touch-nativ, Keyboard-Navigation eingebaut. Industrie-Standard für sortable React-Listen. Nicht SVAR, weil SVAR Gantt-spezifisch ist. |
| **D3** | **Critical-Path: manuell via Postgres recursive CTE + SVG-Overlay über SVAR** | SVAR PRO würde €500–€900/Dev/Jahr kosten. Polymorphe `dependencies`-Tabelle (ADR-004) ist die richtige Daten-Basis; CP-Math ist ein klassischer Forward/Backward-Pass-Algorithmus, gut dokumentiert. SVG-Overlay nutzt SVAR's Public-API für Bar-Positionen. Aufwand ~2–3 PT, dafür keine laufenden Kosten + volle Kontrolle. |
| **D4** | **Phasen-Container-Drag: proportional shift (alle Kinder gleicher Tagesoffset)** | MS-Project-Default. Intuitivste Semantik für PMs. Resize-Verhalten der Phase ändert die Kinder **nicht** (nur Move bewegt sie mit). |
| **D5** | **Cross-Project-Dependencies: Indikator-Pfeil + Tooltip** | Spec-Tracking ohne visuelle Überfrachtung. Ghost-Items wären zu laut; komplettes Verstecken wäre intransparent. Detail-Drilldown via Click öffnet Cross-Project-Dialog (deferred zu PROJ-27). |
| **D6** | **Cycle-Detection: Postgres BEFORE-INSERT-Trigger + Application-Layer-Pre-Check** | Defense-in-depth. Trigger ist Source-of-Truth (kann nicht umgangen werden), App-Layer liefert User-friendly-Errors vor dem Roundtrip. Polymorphe Cycle-Check muss `from_type`+`to_type` traversieren — Bestandteil der PROJ-9-Round-2-Implementation. |
| **D7** | **Bulk-Sprint-Move: eine Transaktion, all-or-nothing** | Saubere Semantik, einfaches Recovery, weniger Edge-Cases bei Failure-Mode. |
| **D8** | **Optimistic-Update im Frontend, Server-Reconcile bei Fehler** | UX-Erwartung an moderne DnD-Tools. Toast bei Konflikt + Revert. Konfliktrate niedrig durch PROJ-10-Field-Versioning. |
| **D9** | **Snap-to-Day-Grid (Minimum 1 Kalendertag)** | Sub-Day-Planning ist out-of-Scope für ein PM-Tool. Reduziert UI-Komplexität und API-Updates. |
| **D10** | **Touch-Devices: read-only Gantt** | dnd-kit unterstützt Touch nativ für Backlog↔Sprint. Aber Gantt-Touch-Gesten sind komplex (Multi-Finger-Zoom + Pan + Drag-Konflikte). Für MVP: iPad/Phone zeigt Gantt nur read-only mit Hinweis. PROJ-25c könnte das später nachholen. |
| **D11** | **Audit: nutzt PROJ-10-existing tracked-columns** | `sprint_id`, `position`, `planned_start`, `planned_end` sind bereits versioned. Dependencies bekommen neue Audit-Whitelist (Erweiterung in PROJ-9-Round-2). |
| **D12** | **Tenant-Boundary: Cross-Tenant-Dependencies hard-blocked** | Trigger auf `dependencies` (PROJ-9-Round-2) verifiziert Same-Tenant. Defense-in-depth zu RLS. |

### E. Dependencies (zu installierende Pakete)

| Package | Zweck | Lizenz | Größe (gzip approx) |
|---|---|---|---|
| `wx-react-gantt` (SVAR React Gantt) | Gantt-Foundation: Balken, DnD, Resize, Dependency-Lines | MIT | ~80 KB |
| `@dnd-kit/core` | DnD-Primitives für Backlog↔Sprint | MIT | ~25 KB |
| `@dnd-kit/sortable` | Sortierbare Listen (Sprint-Reihenfolge) | MIT | ~15 KB |
| `@tanstack/react-virtual` | Virtualisierung für > 200 Sprint-Items | MIT | ~10 KB |

**Total Bundle-Auswirkung:** ~130 KB gzip (akzeptabel; Gantt-Module ist code-split per Next.js dynamic-import — User der nie Wasserfall-Projekt hat, lädt nichts davon).

### F. Cross-Project-Verbindungen

**Voraussetzung:** PROJ-25 startet **erst nach** PROJ-9-Round-2 (polymorphe Dependencies-Migration). Andernfalls fehlt die Daten-Grundlage.

**Empfehlung Reihenfolge:**
1. PROJ-9-Round-2 architected (dieser Run, Step 2) → polymorphe Schema + Migration.
2. PROJ-9-Round-2 implementiert (`/backend`).
3. PROJ-36 architected → Tree-View + WBS + Roll-up (separate `/architecture`-Runde).
4. PROJ-36 implementiert.
5. **DANN** PROJ-25 implementiert (dieser Spec).

PROJ-25 hat keinen direkten Lese-Bedarf an PROJ-36 (WBS-Hierarchie + Tree-View) — die beiden sind orthogonal.

### G. Out-of-Scope-Bestätigung

PROJ-25 deckt **nicht** ab:
- Auto-Schedule-Engine (Dependency-Driven-Move) → **PROJ-25b**.
- Resource-Histogramme im Gantt → **PROJ-11** (separate Feature-Strecke).
- Multi-User-Realtime-Cursors → **PROJ-25c**.
- Touch-Native-DnD im Gantt → **PROJ-25c**.
- Undo-Stack für DnD → **PROJ-25c**.
- Gantt-Export (PNG/PDF) → später (PROJ-21b/c).

### H. Performance-Architektur

| Surface | Anforderung | Strategie |
|---|---|---|
| Backlog-DnD bei 100+ Items | 60 fps | dnd-kit Virtualisierung + nur sichtbare Cards rendern |
| Sprint-DnD-Sortierung | < 100 ms Drop-zu-API | Optimistic-Update + Async-API |
| Gantt mit 30 Phasen + 100 Items + 50 Deps | 60 fps Drag | SVAR's interner Render-Layer (Canvas-fallback bei > 200 Items) |
| Critical-Path-Compute | < 500 ms bei 500-Item-Projekt | Postgres recursive CTE + Index auf `(from_type, from_id)` und `(to_type, to_id)` (Bestandteil PROJ-9-Round-2) |
| Bulk-Sprint-Move 50 Items | < 1 s | Single-Transaction-API + Server-side Bulk-Update |
| Cross-Project-Indikator-Render | < 50 ms | Indikatoren werden lazy beim Erstrender berechnet, nicht per-Frame |

### I. Risiken + Mitigation

| Risiko | Schwere | Mitigation |
|---|---|---|
| **SVAR-API-Stabilität** (v2.4 ist relativ jung) | Mittel | API-Wrapper-Layer im V3-Code; Migrationspfad zu Frappe-Gantt oder Eigenbau im Notfall (Fallback-Plan dokumentiert in `docs/decisions/gantt-library-decision.md` — neuer ADR). |
| **Critical-Path-Performance bei großen Projekten** | Mittel | Materialized View pro Projekt-Snapshot wenn > 1000 Items. MVP: on-demand. |
| **Cross-Tenant-Leakage durch polymorphe Refs** | Hoch | Trigger-Layer (PROJ-9-Round-2) verifiziert Same-Tenant. RLS als zweite Schicht. Zusätzlich: Frontend-API-Validation. |
| **Class-3-Privacy: Resource-Namen im Gantt** | Niedrig | Gantt zeigt Names nur Tenant-intern; AI-Narrative-Generierung über Gantt-Daten muss durch PROJ-30 narrative-Purpose-Filter (existiert). |
| **Bundle-Size-Bloat** | Niedrig | Code-split per dynamic-import auf `/projects/[id]/gantt`; nur geladen wenn Wasserfall-Projekt. |
| **Touch-Geräte ohne DnD-Erlebnis** | Niedrig | Read-only-Mode auf < 768px; Hinweis-Banner. PROJ-25c-Folgekarte. |

### J. Folge-ADR

In `/architecture`-Runde wird parallel ein neuer ADR geschrieben:
- **`docs/decisions/gantt-library-decision.md`** — Build-vs-Buy-Bewertung, SVAR-Free-vs-PRO-Trade-off, Fallback-Plan auf Frappe-Gantt oder Eigenbau, Performance-Benchmarks.

### K. Test-Architektur

- **Vitest-Unit:** Critical-Path-Math, proportional-Shift-Algorithmus, polymorphe Cycle-Pre-Check (App-Layer).
- **Integration:** API-Endpoints für Bulk-Sprint-Move + Dependency-CRUD gegen Postgres-Trigger.
- **E2E (Playwright):** Backlog→Sprint-DnD, Gantt-Move + Resize, Dependency-Pfeil-Ziehen, Phasen-Container-Mitziehen, Critical-Path-Toggle.
- **Performance-Bench:** 500 Items + 200 Deps, 60 fps Drag-Frame-Rate.

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
