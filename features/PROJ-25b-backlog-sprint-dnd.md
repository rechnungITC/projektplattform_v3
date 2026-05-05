# PROJ-25b: Backlog ↔ Sprint Drag-and-Drop (mit a11y-Polish + Multi-Select + Perf-Benchmark)

## Status: In Progress (Backend half)
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

### Überblick
PROJ-25b liefert **eine Frontend-Schicht über bestehender Backend-Substanz** plus **einen neuen Bulk-API-Endpoint**. Es gibt **keine Schema-Migration** und **keine RLS-Änderung**. Das Sprint-Feld auf `work_items` existiert seit PROJ-9, die Sprint-State-Maschine seit PROJ-7. Was fehlt: die Drag-and-Drop-Geste, Multi-Select-State, a11y-Polish und ein atomarer Bulk-Endpoint, damit eine Mehrfach-Auswahl in einer Transaktion landet.

### A) Component Structure (Visual Tree)

```
Backlog Page (backlog-client.tsx — bestehend, wird erweitert)
+-- BacklogDndProvider (NEU)
|   +-- Selection-State (Set<work_item_id>)
|   +-- DndContext (von @dnd-kit/core)
|   +-- aria-live Region (NEU, polite, lokal)
|   |
|   +-- BacklogToolbar (bestehend)
|   |
|   +-- Backlog-View (bestehend, eine von drei)
|   |   +-- BacklogList (bestehend, erweitert um Drag-Handle pro Story-Row)
|   |   +-- BacklogTree (bestehend, disableDrag wird durch @dnd-kit-Drag-Handle ersetzt)
|   |   +-- BacklogBoard (bestehend, KEIN DnD — Board ist Status-basiert, nicht Sprint-basiert)
|   |
|   +-- Sprints-Section (bestehend, nur sichtbar bei Scrum/Hybrid)
|   |   +-- SprintsList (bestehend)
|   |       +-- SprintCard (bestehend, gewrappt als Droppable mit State-aware Visual)
|   |
|   +-- "Backlog"-Drop-Zone (NEU, droppable wenn Drag aus einem Sprint kommt)
|   |
|   +-- DragOverlay (NEU, @dnd-kit-Portal)
|       +-- Single-Select: 1 Story-Card-Ghost
|       +-- Multi-Select: Stack-Cards (max 3 sichtbar) + "+N more"-Badge
```

Bestehende Komponenten, die **angefasst** werden:
- `backlog-client.tsx` — wickelt sich in `BacklogDndProvider`, hört auf Drop-Events
- `backlog-list.tsx` — Drag-Handle-Spalte links pro Story-Row (nur bei `kind === 'story'`)
- `backlog-tree.tsx` — `disableDrag`-Flag entfernen, Drag-Handle in Tree-Row
- `sprint-card.tsx` — Wrapper für Droppable mit visuellem Drop-Hint

Neue Komponenten:
- `BacklogDndProvider` — Context für Selection + DndContext-Wrapper
- `LiveRegion` — kleine `aria-live`-Komponente (≤ 30 LOC)
- `DragOverlayCard` — Single-Card und Stack-Variante
- `useStorySelection` — Hook (Ctrl/Shift-Click-Logik in `useReducer`)

Backlog-Board (Kanban-Status-View) bleibt unverändert: Karten dort ändern den **Status**, nicht den **Sprint**. DnD wäre semantisch verwirrend.

### B) Data Model (plain language)

**Keine neuen Tabellen, keine neuen Spalten.**

Persistenz nutzt zwei Wege:

1. **Single-Item-Drag** — bestehender Endpoint `PATCH /api/projects/[id]/work-items/[wid]/sprint` mit `{ sprint_id: "<uuid>" | null }`. Unverändert seit PROJ-7.
2. **Multi-Item-Drag** — neuer Endpoint `PATCH /api/projects/[id]/work-items/sprint-bulk` mit `{ work_item_ids: ["<uuid>", …], sprint_id: "<uuid>" | null }`.

Selection-State lebt **nur im Browser** (React-Context), nicht in der Datenbank. Nach erfolgreichem Drop oder Page-Verlassen ist die Selektion weg — bewusst, weil "Selection persistieren" eine andere User-Story wäre (Drafts, Saved-Views). Die `aria-live`-Announcements sind ebenfalls ephemer (kein History-Log).

Sprint-State-Validation hat zwei Schichten:
- **Frontend** kennt den Sprint-State aus `useSprints` und blockiert den Drop auf `closed`-Sprints schon vor dem API-Call (visuelles Reject + `aria-live`-Announce).
- **Backend** prüft den Ziel-Sprint-State unabhängig (Defense-in-Depth — Frontend-State kann veraltet sein, ein zweiter User könnte den Sprint inzwischen geschlossen haben).

### C) Tech Decisions (justified for PM)

#### D1 — DnD-Library: `@dnd-kit/core` + `@dnd-kit/sortable`
**Locked von PROJ-25 Tech Design D2.** Modern, Tree-shakable (~12kB gzip), keine HTML5-Drag-API-Macken, eingebauter `KeyboardSensor` für Tastatur-DnD, Touch-Support out-of-the-box. Die einzige Alternative `react-dnd` wurde verworfen (HTML5-DragImage hat schlechtes Multi-Select-Verhalten und keine Touch-Polituren).

#### D2 — Selection-State-Management: React-Context + `useReducer`
**Statt Zustand-Store oder neuer Library.** Die Selection lebt nur auf der Backlog-Page und ist bei Page-Verlassen weg. Ein lokaler Context plus `useReducer` (Actions: `toggle`, `range`, `clear`, `set`) hält den Code klein (~40 LOC), bringt keine neue Dependency und ist mit `git grep` auffindbar. Ein globaler Zustand-Store wäre Over-Engineering, weil keine andere Page diese Selektion liest oder schreibt.

#### D3 — Optimistic-Update-Pattern: Lokaler Reducer + Refresh-on-Settle
**Statt SWR / TanStack Query.** Die Codebasis nutzt im gesamten Backlog-Bereich das eigene `useWorkItems`-Hook-Pattern (vgl. `src/hooks/use-work-items.ts`). React-Query / SWR einzuführen wäre eine architektonische Verschiebung mit Auswirkung weit über PROJ-25b hinaus.

Stattdessen:
1. Beim Drop verschiebt der Reducer das Item **sofort** zwischen Container im lokalen State.
2. Die Mutation läuft parallel.
3. Bei Erfolg wird `useWorkItems.refresh()` ausgelöst, um die Server-Wahrheit nachzuziehen.
4. Bei Fehler rollt der Reducer zurück (vorheriger State wird im Action-Payload mitgeführt) und ein Sonner-Toast informiert den Nutzer; die `aria-live`-Region announced den Fehlschlag.

Wenn dieses Pattern später projektweit nicht mehr trägt, ist der Schritt zu React-Query ein PROJ-eigenes Investment (CIA-Review).

#### D4 — Bulk-Route-Limit: 50 hardcoded
**Eine Konstante, dokumentiert, kein Tenant-Setting.** 50 ist großzügig genug für Sprint-Refinement-Sessions (typisch 20–30 Stories) und schützt gleichzeitig vor versehentlichen 1000-Item-Mass-Moves, die das UI-Feedback-Versprechen (60fps) brechen würden. Tenant-Konfiguration verschiebt das Problem nur und macht die Validation komplexer. Wenn die 50 in der Praxis brennen, ist das ein eigener PROJ.

#### D5 — Drag-Overlay-Visualization: Stack-Cards mit "+N more"-Badge
- 1 Item → Single-Card-Ghost (Position folgt dem Cursor, `opacity-0.95`).
- 2–3 Items → drei gestapelte Karten mit leichter Rotation (CSS-`transform: rotate(-2deg)` auf Index 1, `+2deg` auf Index 2) — ein erkennbarer "Stack-Look".
- > 3 Items → drei gestapelte Karten + Badge "`+(N − 3) more`" am Rand.

Diese Variante ist visuell sofort lesbar, performant (kein Render von 50 Karten gleichzeitig im Overlay) und a11y-neutral (das Overlay ist `aria-hidden`, der Screenreader bekommt seinen Status aus der `aria-live`-Region).

#### D6 — a11y-Live-Region-Position: Lokal unter dem Backlog-Header
**Statt globaler Toast-Region.** Sonner-Toasts haben eigene a11y-Behandlung, sind aber in der Praxis "global verteilt" — der Screenreader hört sie aus jedem Page-Kontext. Eine **lokale** `aria-live="polite"`-Region direkt unter dem Backlog-Header announced gezielt im fachlichen Kontext ("Story 'Login' wurde Sprint 12 zugewiesen"). Sie ist visuell unsichtbar (`sr-only`-Klasse), aber semantisch verankert — der Screenreader-Nutzer weiß, dass diese Information zur Backlog-Aktion gehört.

Sonner-Toasts bleiben für **Fehler** (Netzwerkfehler, "Sprint geschlossen"-Reject) — da ist die Sichtbarkeit für sehende Nutzer wichtiger als die Kontextverortung.

#### D7 — Sprint-State-Validierung: Frontend + Backend (beides)
- **Frontend** weiß aus `useSprints`, welche Sprints `state = 'closed'` sind. Drop-Target zeigt rote Outline + No-Drop-Cursor; der API-Call wird gar nicht erst gefeuert. UX-Optimierung — der Nutzer sieht sofort, was geht.
- **Backend** validiert in der Bulk-Route den Ziel-Sprint-State unabhängig (Race-Condition-Schutz: User A startet Drag, User B schließt zwischen Render und Drop den Sprint). Returnt 422 mit `error: "sprint_closed"`.

Dieselbe Logik gilt für die Single-Item-Route — der bestehende PATCH-Endpoint bekommt eine kleine Erweiterung: Ziel-Sprint-State-Check (heute fehlend, ist Tech-Debt aus PROJ-7).

### D) Backend: Bulk-API-Endpoint

**Neu**: `PATCH /api/projects/[id]/work-items/sprint-bulk`

| Eigenschaft | Wert |
|---|---|
| HTTP-Methode | PATCH |
| Auth | `requireProjectAccess(projectId, "edit")` (PROJ-4-Pattern) |
| Body | `{ work_item_ids: uuid[1..50], sprint_id: uuid \| null }` (Zod-validiert) |
| Cross-Project-Guard | `sprint_id != null` ⇒ Ziel-Sprint muss `project_id = id` haben |
| Sprint-State-Guard | Ziel-Sprint `state = 'closed'` ⇒ 422 `sprint_closed` |
| Atomicity | Eine Transaktion; entweder alle Updates oder keiner |
| Partial-Fail | Wenn IDs fehlen oder zu fremdem Projekt gehören → 422 ohne State-Änderung |
| Response | `{ updated: <count>, work_items: [...] }` |
| Audit-Log | `record_audit_changes`-Trigger feuert pro UPDATE — keine Extra-Logik |

Die Single-Item-Route `/sprint` bleibt **unverändert in der Schnittstelle** — sie bekommt nur den fehlenden Sprint-State-Guard nachgereicht (Tech-Debt-Fix).

### E) Dependencies (zu installieren)

| Package | Zweck |
|---|---|
| `@dnd-kit/core` (^6.x) | DnD-Foundation: DndContext, Sensors, Drag-Overlay |
| `@dnd-kit/sortable` (^8.x) | Sortable-Helfer für Listen-Container (Sprints, Backlog) |

Bestehend genutzt (keine neue Installation):
- `sonner` — Toast-Library für Fehlermeldungen
- `lucide-react` — Grip-Icon für Drag-Handle
- `@playwright/test` — Performance-Benchmark via `requestAnimationFrame`-Counter

### F) Test-Strategie

| Test-Art | Was wird geprüft |
|---|---|
| Vitest (Bulk-Route) | Happy-Path · Validation-Fail · Cross-Project-Guard · Closed-Sprint-Reject · Partial-Fail (eine ID fremd) |
| Vitest (`useStorySelection`-Hook) | Toggle · Range-Click · Clear · Set |
| Playwright (E2E) | Single-Drag Maus · Multi-Drag Maus · Keyboard-DnD · Escape-Cancel · Closed-Sprint-Reject-Visual · Method-Gate (Wasserfall zeigt keinen Sprint-Bereich) |
| Playwright (Performance) | 30 Sprints × 100 Stories: Single-Drag ≥ 55fps, Multi-Drag-50 ≥ 50fps, Initial-Render < 500ms |

### G) Risiken & Mitigation

| Risiko | Mitigation |
|---|---|
| `@dnd-kit` neue Library im Stack — nicht im Tech-Stack-Memo | Bewusst, von PROJ-25 D2 vorab gelockt; CIA-Review-Status: dort grün gegeben |
| Optimistic-Pattern lokal divergiert vom Server-State (Race) | Bei Drop-Fehler rollt der Reducer zurück, `aria-live`-Announce informiert; nach Erfolg `refresh()` zieht die Wahrheit nach |
| Tree-View hat eigene `disableDrag`-Logik (`react-arborist`) | Tree-Drag-Handle wird **außerhalb** des `react-arborist`-Drag-Mechanismus angeboten (eigenes Grip-Icon mit `@dnd-kit/core`-`useDraggable`); `disableDrag` bleibt true, damit die zwei DnD-Systeme nicht kollidieren |
| Performance-Test in CI flakey (Headless-Chrome ≠ realer Browser) | 5fps-Toleranz im Threshold (55 statt 60fps); Test läuft auf `npm run test:e2e`-Stage, nicht im PR-Required-Check, sondern im Nightly |
| `aria-live="polite"` wird vom Screenreader unterdrückt, wenn vor `aria-live` der Fokus wandert | `polite` ist Absicht (nicht `assertive`), damit es User-Workflow nicht unterbricht; Tests mit NVDA/VoiceOver in QA-Phase |
| Bulk-Route 422 partial-fail ohne klares Feedback welcher Item fehlt | Response enthält `failed_ids`-Array bei 422, Frontend mappt sie auf Story-Titel im Toast |
| `closed`-Sprints in der DB existieren historisch (PROJ-26) | Frontend filtert Drop-Targets, Backend doppelt; bei alt-existierenden `closed`-Sprints kein UI-Bruch |

## Implementation Notes — Backend (2026-05-05)

### Backend slice landed (frontend pending)

1. **Bulk endpoint live** — `PATCH /api/projects/[id]/work-items/sprint-bulk`
   - File: `src/app/api/projects/[id]/work-items/sprint-bulk/route.ts`
   - Accepts `{ work_item_ids: uuid[1..50], sprint_id: uuid | null }` (Zod-validated, de-duped before count check).
   - **Pre-flight match** before the UPDATE: every supplied ID must resolve to a work item in this project under the user's RLS view; otherwise 422 `items_not_found` with `failed_ids` array — no write happens.
   - **Kind guard**: only `kind = 'story'` is allowed; mixed-kind drops return 422 `invalid_kind` with the offending IDs.
   - **Sprint guards** (only when `sprint_id != null`): cross-project (422 `invalid_sprint`) + closed-state (422 `sprint_closed`).
   - **Atomic update**: `UPDATE … WHERE id IN (…) AND project_id = …` in one statement; if RLS silently filters a row, the response array is short and the route returns 403 (no half-applied state).
   - Audit-log trigger fires per UPDATE (no special-casing).

2. **Tech-debt fix on single-item route** — `PATCH /api/projects/[id]/work-items/[wid]/sprint`
   - File: `src/app/api/projects/[id]/work-items/[wid]/sprint/route.ts`
   - The cross-project guard already fetched the sprint; the SELECT now also pulls `state`, and we reject `closed` (422 `sprint_closed`). Was missing since PROJ-7.

3. **Tests**
   - `sprint-bulk/route.test.ts` — 15 tests: auth + body validation, sprint guards (404, cross-project, closed), pre-flight match (missing IDs, kind mismatch, dedupe), happy path (3 IDs atomic), RLS short-row → 403.
   - `[wid]/sprint/route.test.ts` — 5 tests: closed-sprint guard (new), cross-project guard, happy path, detach-skips-sprint-lookup, 401.
   - Full work-items test family: 63/63 green. ESLint clean.

### Locked design decisions
The 7 design decisions from `/architecture` (D1–D7) hold for the backend slice:
- D4 (Bulk-Limit 50) → enforced via `MAX_BULK_ITEMS = 50` constant + Zod `.max()`.
- D7 (Sprint-State validation in both Frontend + Backend) → backend half is in place; frontend half lands in `/frontend`.

### Deferred / not yet built
- All frontend pieces (BacklogDndProvider, drag handles, drop targets, multi-select, Drag-Overlay, aria-live region) — `/frontend` slice.
- Playwright performance benchmark (30 sprints × 100 stories) — `/qa` slice.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
