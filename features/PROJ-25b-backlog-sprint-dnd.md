# PROJ-25b: Backlog ↔ Sprint Drag-and-Drop (mit a11y-Polish + Multi-Select + Perf-Benchmark)

## Status: Planned
**Created:** 2026-05-05
**Last Updated:** 2026-05-05

## Summary
PROJ-25 hat die **Gantt-Hälfte** des DnD-Stacks ausgeliefert (Stages 1-5 + Today/Zoom/Edit-Dialog live). Die **Backlog-Hälfte** wurde bewusst geschoben, weil das Stage-Budget vom Eigenbau-Gantt absorbiert wurde und `@dnd-kit` nicht installiert ist (`backlog-tree.tsx:410` hat hartcodiertes `disableDrag`).

PROJ-25b erledigt diese Backlog-Hälfte als eigenständigen, deploybaren Slice:

1. **ST-01 — Backlog ↔ Sprint DnD** via `@dnd-kit/core` + `@dnd-kit/sortable`. Stories per Maus + Tastatur vom Backlog in einen Sprint ziehen (oder zurück).
2. **Multi-Select-DnD** — Ctrl/Shift-Click selektiert mehrere Stories, eine Drag-Geste verschiebt alle atomar.
3. **A11y-Polish** — `aria-live`-Region für Drop-Announcements, Keyboard-DnD-Alternative (Space + Pfeile + Space), Escape-Cancel.
4. **Performance-Benchmark** — Playwright-fps-Test bestätigt 60fps-Target bei 30 Sprints × 100 Stories.

Aus dem PROJ-25-Deferred-Catalog werden hier **D-1, D-2, D-3, D-4, D-5** abgearbeitet. **D-6 (Cross-Project-Indikator), D-7 (Critical-Path-Math-Erweiterung), D-8 (Touch-DnD), D-9/D-10** bleiben außerhalb (eigene Specs PROJ-25c/d).

## Dependencies
- **Requires PROJ-7** (Project Room — Backlog-Surface) — die Backlog-Liste/Tree, die droppable wird.
- **Requires PROJ-9** (Work Items + `sprint_id`).
- **Requires PROJ-25** (Gantt half deployed) — sicherstellt, dass `@dnd-kit`-Einführung den Eigenbau-Gantt nicht regressiert.
- **Soft requires PROJ-26** (Method-Gating) — der Backlog-Sprint-DnD ist nur für Scrum/Hybrid-Methoden sichtbar; Wasserfall-Projekte zeigen keinen Sprint-Bereich.

## V2 Reference Material
- V2 hatte rudimentäre Backlog-DnD-Patterns ohne a11y und ohne Multi-Select. V3 setzt hier neu mit `@dnd-kit` auf (modern, accessibility-first).
- PROJ-25 Tech Design D2 ("DnD-Library-Wahl: A. `@dnd-kit/core`") wird hier endgültig umgesetzt.

## User Stories
- **Als Scrum-Master** möchte ich beim Sprint-Planning Stories mit der Maus aus dem Backlog in den aktiven oder geplanten Sprint ziehen — ohne Modal, ohne "Change-Sprint"-Dialog.
- **Als Scrum-Master** möchte ich eine Story aus einem Sprint per Drag wieder in den Backlog zurückziehen können, wenn wir nicht mehr alles schaffen.
- **Als Scrum-Master** möchte ich mehrere Stories gleichzeitig (Ctrl/Shift-Click + Drag) in einen Sprint verschieben — beim Sprint-Refinement spart das massiv Klicks.
- **Als Scrum-Master mit Screenreader** möchte ich nach jedem Drop eine akustische Bestätigung hören ("Story 'Login' wurde Sprint 12 zugewiesen"), ohne den Fokus zu verlieren.
- **Als Scrum-Master mit Tastatur-only-Workflow** möchte ich Stories mit Space + Pfeil + Space ohne Maus zwischen Backlog und Sprint bewegen können.
- **Als Projektleiter:in** möchte ich einen versehentlichen Drag-Vorgang mit `Esc` abbrechen können, bevor er persistiert wird.
- **Als Projektleiter:in** möchte ich, dass ein 100-Story-Backlog flüssig (60fps) bleibt, auch wenn ich mehrere Stories selektiert habe.

## Acceptance Criteria

### ST-01 Backlog ↔ Sprint DnD (Single-Item)
- [ ] Drag-Handle (Grip-Icon) erscheint neben jeder Story in der Backlog-Liste/Tree.
- [ ] Drop-Targets: alle Sprints im Sprint-Bereich, plus Backlog selbst (für Rückzug).
- [ ] Beim Drag erscheint ein Drag-Overlay (verkleinerte Story-Card).
- [ ] Ein erfolgreicher Drop ruft `PATCH /api/projects/[id]/work-items/[wid]/sprint` mit `{ sprint_id: "..." | null }`.
- [ ] Optimistic Update: Die Story verschwindet sofort aus dem Quell-Container und erscheint im Ziel-Container, bevor die API-Antwort kommt; Fehlerfall rollt zurück.
- [ ] Methoden-Gate: nur sichtbar bei Scrum/Hybrid (nicht bei Wasserfall-Projekten — `useProjectMethod` liefert `kanban`/`scrum`/`hybrid`).
- [ ] **Nur `kind = story` ist draggbar.** Epic/Feature/Task/Bug/Subtask haben kein Sprint-Konzept und zeigen kein Drag-Handle.
- [ ] Source-Sprint-Anzeige: ein Story-Drag aus Sprint A nach Sprint B aktualisiert beide Sprint-Container ohne Page-Reload.

### ST-06 A11y-Polish
- [ ] **`aria-live="polite"` Region** unterhalb des Backlogs: nach jedem Drop wird textuell announced (`"Story 'XYZ' wurde Sprint 'Sprint 12' zugewiesen"` / `"Story 'XYZ' wurde in den Backlog zurückverschoben"`).
- [ ] **Keyboard-DnD**: Space auf einem Drag-Handle aktiviert Drag-Modus → Pfeil-Up/Down + Tab navigiert zwischen Drop-Targets → Space bestätigt Drop → Escape bricht ab.
- [ ] **Escape-Cancel**: Während eines Maus-Drags bricht `Escape` den Drag ab, ohne Persistenz.
- [ ] Drag-Handle hat `aria-label="Story 'Login' verschieben"` (dynamisch mit Story-Titel).
- [ ] Drop-Target hat `aria-label="Sprint 12 (planned) — Drop-Target"` mit Status-Hinweis.
- [ ] Fokus-Trap nicht nötig — `@dnd-kit/core`-`KeyboardSensor` handhabt Fokus-Management.

### Multi-Select-DnD
- [ ] **Ctrl/Cmd-Click** auf eine Story toggelt Selektion (Multi-Select).
- [ ] **Shift-Click** wählt eine Range (alle Stories zwischen letzter und aktueller Selektion).
- [ ] Selektierte Stories haben visuell klares Highlight (Border + Background-Tint via Tailwind `ring-2 ring-primary`).
- [ ] Drag eines selektierten Items zieht ALLE selektierten — Stack-Visualisierung im Drag-Overlay (`"3 Stories"`-Badge).
- [ ] Drop ruft NEUE Bulk-Route `PATCH /api/projects/[id]/work-items/sprint-bulk` mit `{ work_item_ids: ["...", "..."], sprint_id: "..." | null }`. Atomar (alle oder keiner).
- [ ] Maximum 50 Items pro Bulk-Drag (Validation).
- [ ] Single-Select-State wird nach erfolgreichem Drop zurückgesetzt.

### Sprint-State-Restrictions
- [ ] Stories sind in Sprints mit `state IN ('planned', 'active')` droppable.
- [ ] Stories in Sprints mit `state = 'closed'` zeigen rotes Drop-Reject-Visual + `aria-live`-Announce `"Sprint ist abgeschlossen — Drop nicht erlaubt"`. Persistenz-Aufruf wird gar nicht ausgelöst (Frontend-Gate vor API-Call).
- [ ] Backend (Bulk-Route) prüft Sprint-State serverseitig als Defense-in-Depth (422 auf `closed`).
- [ ] Wasserfall-Projekte (Method-Gating) zeigen den Sprint-Bereich gar nicht — Drop-Targets existieren nicht.

### ST-07 Performance-Benchmark
- [ ] Playwright-Test rendert 30 Sprints × 100 Stories (3000 Work-Items) und führt 50 Single-Drags durch.
- [ ] Frame-Rate bleibt ≥ 55fps (Target 60fps mit 5fps Toleranz für CI-Schwankung) — gemessen via `requestAnimationFrame`-Counter.
- [ ] Initial-Render der Backlog-Page < 500ms (gemessen via `performance.mark`).
- [ ] Multi-Select-Drag von 50 Items hält Frame-Rate ≥ 50fps.

### Bulk-API-Endpoint
- [ ] **`PATCH /api/projects/[id]/work-items/sprint-bulk`** — neuer Endpoint.
- [ ] Body: `{ work_item_ids: uuid[], sprint_id: uuid | null }`.
- [ ] Validation via Zod: 1-50 IDs, alle UUIDs, sprint_id UUID oder null.
- [ ] Authorization: Caller muss Project-Member mit Edit-Rolle sein (`requireProjectAccess(projectId, "edit")`).
- [ ] Cross-Project-Guard: Wenn `sprint_id != null`, muss der Sprint zum Projekt gehören (analog Single-Item-Route).
- [ ] Sprint-State-Guard: Wenn Ziel-Sprint `state = 'closed'`, returnt 422 mit `error: "sprint_closed"`.
- [ ] Atomicity: SQL `UPDATE ... WHERE id = ANY($1) AND project_id = $2` in einer Transaktion. Fehlt eine work_item_id, wird keine geändert (422).
- [ ] Response: `{ updated: <count>, work_items: [...] }`.

## Edge Cases

- **Drag-and-Drop in Closed Sprint** — Frontend zeigt Reject-Indikator (rote Outline + No-Drop-Cursor), Backend lehnt mit 422 ab. Source-Sprint bleibt unverändert.
- **Concurrent Edit** — User A drag-droppt Story X von Sprint 10 nach Sprint 11; gleichzeitig löscht User B Story X. Bulk-API liefert 422 (eine ID nicht gefunden), Optimistic Update rollt zurück, `aria-live`-Toast: `"Eine oder mehrere Stories wurden inzwischen gelöscht"`.
- **Drag eines Epic/Feature/Task** — Drag-Handle ist nicht sichtbar; falls über DOM-Manipulation versucht, blockiert Frontend-Validation (`kind !== 'story'`) den Drop noch vor API-Call.
- **Multi-Select über Tree-Hierarchie hinweg** — User selektiert Story A (Child von Epic E1) + Story B (Child von Epic E2). Drag zieht beide; Tree-Hierarchie bleibt intakt (nur `sprint_id` ändert sich, nicht `parent_id`).
- **Drop in den Backlog (sprint_id = null) bei Multi-Select** — alle selektierten Stories werden Sprint-detached.
- **Browser-Tab inactive während Drag** — `pointercancel` löst Cleanup aus; Drag-State wird zurückgesetzt; nichts persistiert.
- **Touchscreen-Use** — `@dnd-kit/core` `PointerSensor` deckt Maus + Touch ab; aber Touch-DnD bleibt Best-Effort. Der explizite Touch-Polish ist auf PROJ-25c verschoben.
- **Sehr lange Story-Titel** im Drag-Overlay — Text wird mit `truncate` + Tooltip-Hover gehandhabt.
- **Story mit Children** (Subtasks) — `sprint_id` ändert sich nur am Story-Level. Subtasks erben implizit über die UI-Filterung; keine kaskadierende Datenbank-Operation.
- **Cross-Tenant via DOM-Hack** — RLS auf `work_items` blockiert; Bulk-Route prüft auch `project_id` per WHERE-Clause.
- **Sprint im selben Drag mit demselben Sprint als Ziel** — No-op, kein API-Call (Frontend-Optimization).

## Technical Requirements

- **DnD-Library**: `@dnd-kit/core` ^6.x + `@dnd-kit/sortable` ^8.x. **Begründung**: PROJ-25 Tech Design D2 hat das bereits gewählt; modern, performant, a11y-first, Touch-Support out-of-the-box.
- **Performance**: 60fps bei 30 Sprints × 100 Stories; ≥ 50fps bei Multi-Select 50 Items (gemessen via Playwright `requestAnimationFrame`).
- **Browser-Support**: Chrome ≥ 100, Firefox ≥ 100, Safari ≥ 16. Touchscreen-Best-Effort.
- **Accessibility**: WCAG 2.1 AA — `aria-live`, Keyboard-DnD via `KeyboardSensor`, Escape-Cancel, dynamische `aria-label`s.
- **Backend**: 1 neuer API-Endpoint (`/api/projects/[id]/work-items/sprint-bulk`). **Keine Schema-Migration** — nur Frontend + Bulk-Route. Single-Item-Route `/sprint` bleibt unverändert.
- **Tests**:
  - Vitest: Bulk-Route Happy-Path + 4 Error-Cases (validation, cross-project, closed-sprint, partial-fail).
  - Playwright: 1 E2E-Test pro AC (Single-Drag, Multi-Drag, Keyboard-DnD, Escape-Cancel, Closed-Sprint-Reject, Performance-Benchmark).

## Suggested locked design decisions for `/architecture`

1. **DnD-Library** → `@dnd-kit/core` + `@dnd-kit/sortable` (locked von PROJ-25 Tech Design D2).
2. **Selection-State-Management** → React-Context oder Zustand-Store auf Backlog-Page-Ebene? Architect entscheidet (vermutlich Context mit `useReducer`).
3. **Optimistic-Update-Pattern** → SWR/React-Query oder lokaler Reducer? Architect entscheidet.
4. **Bulk-Route-Limit** → 50 Items hardcoded oder konfigurierbar? Vorschlag: hardcoded auf 50, dokumentiert.
5. **Drag-Overlay-Visualization** → Stack-Cards (3D-Stack-Effect) oder Liste? Vorschlag: Stack-Cards mit `"+N more"`-Badge bei N>3.
6. **a11y-Live-Region-Position** → globale Toast-Region oder backlog-page-lokale Region? Vorschlag: lokale Region direkt unter Backlog-Header (wird vom Screenreader bei Page-Visit fokussiert).
7. **Sprint-State-Validierung-Layer** → nur Backend, oder Frontend + Backend? Vorschlag: beides (Frontend für UX-Feedback, Backend als Defense-in-Depth).

## Out of Scope (deferred)

### PROJ-25c (später)
- **Touch-DnD-Politur** — eigene Geste, Snap-Magnification, Long-Press-Threshold-Tuning.
- **Multi-User-Realtime-Cursors** während gemeinsamer Sprint-Planning-Session.
- **Undo-Stack** für DnD-Aktionen ("letzte 10 Aktionen rückgängig").
- **Cross-Project-Indikator** (Tech Design D5 aus PROJ-25 — Ghost-Arrow für cross-project deps im Gantt).

### PROJ-25d (Critical-Path-Math-Erweiterung)
- **Per-Item-Float-Werte** im Gantt (PROJ-25 D-7).
- **SS / FF / SF Constraint-Types** im Critical-Path (aktuell nur FS).
- **Work-Item-Edges** im Critical-Path (aktuell nur Phase-Phase).

### Explizite Non-Goals
- **Keine Auto-Schedule-Engine** — bleibt PROJ-25d / weitere Specs.
- **Keine Cross-Project-DnD** — Drag von Story aus Projekt A nach Projekt-B-Sprint nicht erlaubt.
- **Keine Drag-Reorder innerhalb des Backlogs** — nur Container-Wechsel (Backlog ↔ Sprint). Reorder-im-Backlog ist heute via WBS-Code/Outline-Path geregelt, nicht via DnD.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
