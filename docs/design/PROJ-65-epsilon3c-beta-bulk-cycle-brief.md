# PROJ-65 ε.3c.β — Bulk-Plan-Mutate + Cycle-Overlay · Designer Brief

> **Scope:** D4 Multi-Source-Bulk-Mutate (L30 Single-Intent-Array, all-or-nothing) + D5 Cycle-Overlay-on-Graph (L31 transient FE-State). Voraussetzung Locks L21–L36 (Spec Section X + FF). Implementation in `/frontend` (Bulk-UX + Selection-State) + `/backend` (RPC-Body-Erweiterung) parallel.

---

## D4 — Bulk-Plan-Mutate

### Goal

Project-Lead kann N Sprint/Phase-Knoten gleichzeitig selektieren und mit **einer Diff-Modal-Bestätigung** atomar um die gleiche Anzahl Tage verschieben. Conflict in ANY Source bricht die ganze Operation ab — User sieht klar welche Knoten blockieren, lädt neuen Stand, retried.

### Benchmark Fit

| Tool | Pattern |
|---|---|
| Jira | Bulk-Edit-Modal nach Multi-Select; "Move 12 issues to next sprint" |
| ClickUp | Multi-Select via Click-and-Drag-Lasso ODER Ctrl/Shift-Click; Bulk-Action-Bar floated bottom |
| monday.com | Bulk-Apply: Select rows → action button row appears |
| Local V3 | **PROJ-25b Backlog-Sprint-DnD** hat Multi-Select via Ctrl/Shift-Click + Bulk-Bulk-API (Memory). Reuse pattern in Trajektoriengraph |

### View Strategy

| Aspekt | Entscheidung |
|---|---|
| **Default-Selection** | Single-Source bleibt unverändert (Drop auf Drag-Handle) |
| **Multi-Select-Trigger** | Ctrl/Cmd-Click ODER Shift-Click auf Sprint/Phase-Knoten → toggled selection-state |
| **Visualisierung** | Selektierte Knoten: dashed `outline-2 outline-primary` Ring; Original-Stroke bleibt; Selected-Count-Badge oben rechts im Graph |
| **Bulk-Action-Trigger** | Floating action bar erscheint bottom-center wenn `selectedNodes.length >= 2`: "N Knoten ausgewählt · [Bulk-Verschieben] [Abbrechen]" |
| **Diff-Modal-Erweiterung** | Existing PlanMutateDialog erweitert um Multi-Source-Header + per-Source-Group-Rows |
| **Single-Source-Pfad** | Drag-Handle bleibt einziger Trigger für Single-Source (kein Bulk-Workflow für N=1) |

### Layout

#### Multi-Select Interaction Flow

```
1. User Ctrl+Click auf Sprint A           → A wird selektiert (dashed ring)
2. User Ctrl+Click auf Phase B            → B wird selektiert (dashed ring)
3. Floating Action Bar erscheint:
   ┌──────────────────────────────────────────┐
   │ 2 Knoten ausgewählt                      │
   │ [+ alle deselektieren]  [Bulk-Verschieben] │
   └──────────────────────────────────────────┘
4. User klickt "Bulk-Verschieben" → BulkShiftPopover öffnet:
   ┌────────────────────────────┐
   │ Verschiebe 2 Knoten um:    │
   │ [-1] [─5│+] [+1]  Tage     │
   │            [Abbrechen] [→] │
   └────────────────────────────┘
5. User submit → Multi-Source PlanMutateDialog öffnet mit:
   - Header: "Plan-Mutate-Vorschau · 2 Knoten · +5 Tage"
   - DiffTable mit zwei Knoten-Gruppen (per source_node_id grouped)
   - Footer: "Übernehmen (2 Knoten)" / "Verwerfen"
```

#### Selection-State

- **Selection-Set**: `Set<string>` of `node.id` im View-State (top-level `TrajectoryGraphView`-State)
- **Reset-Triggers**:
  - User klickt auf leere Graph-Area (Background-Click)
  - User klickt "Alle deselektieren"-Button in Action-Bar
  - Dialog committed oder verworfen
  - Mode-Switch (2D → 3D)
- **Persistenz**: nicht über Reload (transient — Multi-Select ist tactical activity)

#### Bulk-Action-Bar

shadcn-Card mit:
- Position: `fixed bottom-6 left-1/2 -translate-x-1/2 z-50`
- Bg: `bg-surface-container border-outline-variant shadow-md rounded-lg`
- Content:
  - Selected-Count + Kind-Mix-Summary ("2 Phasen · 1 Sprint")
  - "Alle deselektieren" (`variant="ghost"`)
  - "Bulk-Verschieben" (`variant="default"`, Primary-CTA)
- Slide-in/out via `framer-motion` `y: 100% → 0` (`prefersReducedMotion` respektiert)
- Mobile 375px: Action-Bar full-width unten (`left-0 right-0 bottom-0 rounded-t-lg`)

#### BulkShiftPopover

shadcn-Popover anchored am "Bulk-Verschieben"-Button:
- Days-Input (number, range -365 to +365, Default 0 disabled-submit)
- Quick-Buttons: ±1, ±7, ±14, ±30
- Footer: "Abbrechen" + "Weiter →" (öffnet Dialog mit Diff)
- Keyboard: Enter submit, ESC close

#### Diff-Modal Multi-Source-Erweiterung

Existing `PlanMutateDialog` erweitert:

**Header:**
- Title: `Plan-Mutate-Vorschau · {N} Knoten`
- Subtitle: `Verschiebung um ±{X} Tage · {affectedCount} Folge-Knoten`
- Class-3-Lock-Glyph rechts (re-use)

**Body — DiffTable mit Group-Headers:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Phase: Anforderungsphase                                        │
│  ├─ Start            01.07. → 06.07.   ↑5d   delay              │
│  ├─ Ende             15.07. → 20.07.   ↑5d   delay              │
│  └─ Risiko (Top 3)   mittel              ▼ [Show]               │
│                                                                  │
│ Sprint: Sprint 2                                                │
│  ├─ Start            16.07. → 21.07.   ↑5d   delay              │
│  └─ Ende             29.07. → 03.08.   ↑5d   delay              │
└─────────────────────────────────────────────────────────────────┘
```
- Group-Header: `bg-surface-container-low text-foreground text-sm font-medium px-3 py-2 sticky-after-table-header top-9`
- Within Group: existing 5-Col-Row-Structure (Knoten/Feld/Vorher/Δ/Nachher)
- Klick auf Group-Header → toggled `aria-expanded` (default expanded)

**Footer:**
- "Verwerfen" (`variant="outline"`)
- "Übernehmen ({N} Knoten)" (`variant="default"`, Loader2 während Apply)

**Conflict-State (L30 all-or-nothing):**
- 1 Source conflicted → ALL ABORT, kein partial-apply
- ConflictBanner ersetzt Footer:
  - Title: "Plan-Konflikt — andere Bearbeitung erkannt"
  - Description: "{N} Konflikt-Knoten in {M} ausgewählten Sources. Lade neuen Stand und versuche erneut."
  - Conflict-Knoten in DiffTable highlighted mit `bg-destructive/10` + ⚠ Icon vor Knoten-Label
  - Button: "Neuen Stand laden" → `onReloadSnapshot()` + close dialog + clear selection

### Interactions

| Aktion | Behavior |
|---|---|
| **Ctrl/Cmd-Click auf Sprint/Phase** | Toggle selection. Modifier-erkannt server-side für a11y via `event.metaKey || event.ctrlKey` |
| **Shift-Click** | Range-Select zwischen letztem Selected und Current (analog Jira/Backlog) — **deferred zu ε.3c.γ** |
| **Background-Click** | Clear selection wenn `>= 1` selected; sonst no-op |
| **ESC** | Clear selection wenn aktiv; sonst no-op |
| **Drag-Handle auf NICHT-selected Knoten bei Selection > 0** | Selection wird NICHT geclearted; Drag-Drop opens Single-Source-Dialog für nur diesen Knoten (bisheriger Workflow) — User muss bewusst Bulk-Path via Action-Bar nehmen |
| **Drag-Handle auf SELECTED Knoten bei Selection > 0** | Selection bleibt; Drag-Drop opens Multi-Source-Dialog für ALLE selected Knoten (mit identischem days-delta wie Single-Source-Drag) — Power-User-Shortcut |
| **Bulk-Action-Bar "Bulk-Verschieben"** | Opens BulkShiftPopover für days-Input |
| **Mobile-Long-Press** | Toggle selection (ersetzt Ctrl-Click auf Touch) |

### States

| State | Render |
|---|---|
| **No-Selection** | Action-Bar hidden; Drag-Handles funktionieren wie ε.3b |
| **Selection=1** | Action-Bar zeigt "1 Knoten · Bulk-Verschieben" (auch wenn N=1; user kann explicit Bulk-Pfad nutzen). Drag-Handle auf selected = Multi-Pfad für 1 Knoten (= identisch zu Single-Pfad outcome) |
| **Selection=N** | Action-Bar zeigt Count + Mix; Outline-Rings auf allen N |
| **Selection-Limit (deferred)** | Soft-Limit 50: ab 51. Selection zeigt Toast "Max. 50 Knoten gleichzeitig" + verhindert weitere Selection. ε.3c.β-MVP setzt Hard-Limit |
| **Selection + Permission-Drop** | Wenn `can_plan_mutate` während Selection auf `false` flippt (z.B. nach Tenant-Settings-Change) → Action-Bar verschwindet, Selection bleibt visuell (read-only-Status) |
| **Mobile 375px** | Action-Bar full-width bottom; Long-Press statt Ctrl-Click |
| **A11y** | Selection-Ring + `aria-selected="true"` auf Knoten; Action-Bar `role="region" aria-label="Bulk-Aktionen"`; Live-Region announces "{N} Knoten ausgewählt" |

---

## D5 — Cycle-Overlay-on-Graph

### Goal

Wenn ein Plan-Mutate-Versuch mit 422 (Cycle) abgewiesen wird, sieht User die **Cycle-Knoten visuell hervorgehoben im Trajektoriengraph**, nicht nur als Pfad-Liste im Dialog-Alert. Power-User kann Dependencies anpassen → Cycle weg → erneuter Versuch.

### Benchmark Fit

| Tool | Pattern |
|---|---|
| Jira | Story-Dependency-Visualizer markiert Cycles via roter Pfeile zwischen Tickets |
| ClickUp | Dependency-Conflict-Modal mit "View in Roadmap" Link, dort highlighted |
| monday.com | Gantt-Critical-Path-View zeigt blocking Items in rot |
| Local V3 | **PROJ-65 ε.1 CycleBanner** existiert bereits für persistent-snapshot-cycles. ε.3c.β fügt eine **separate transient-overlay** Schicht hinzu für plan-mutate-422-events |

### Unterschied zu ε.1 CycleBanner

| Aspekt | ε.1 CycleBanner | ε.3c.β CycleAttemptOverlay |
|---|---|---|
| Trigger | Snapshot enthält `cycle_count > 0` | 422-Response von `/plan-mutate` |
| Persistenz | Server-detected, im Snapshot persistent | Transient FE-State (L31), lost on reload |
| Quelle | `snapshot.trajectory.cycle_edges` | `response.cycle.path` (422-Body) |
| Visual | Yellow banner above graph | **Red overlay** auf Cycle-Knoten + Cycle-Path-Edges + Dismissible Toast |

Beide können **gleichzeitig** existieren — der ε.1 Banner zeigt langlebige Daten-Cycles, der ε.3c.β Overlay zeigt einen gerade fehlgeschlagenen Mutate-Versuch.

### View Strategy

- **State-Owner**: `TrajectoryGraphView` hält `lastCycleAttempt: { detected_at_node_id, path: string[], timestamp: Date } | null`
- **Set-Trigger**: 422-Response in `PlanMutateDialog` → `onCycleDetected(cycle)` → propagiert up
- **Clear-Triggers**:
  - User klickt "Verstanden, ausblenden"-Button im Overlay
  - Snapshot refetch (`reloadTick` change) → potentially-stale cycle hidden
  - Mode-Switch (2D → 3D)
  - 60 min Inactivity-Timeout (auto-clear, low-priority)

### Layout

#### Cycle-Overlay-Visual

**Auf Graph-Layer (2D SVG):**
- Cycle-Knoten (alle `path[]`-IDs): `stroke-error stroke-[3] fill-error/10`-Override, animated pulse 1.5s ease-in-out
- Cycle-Edges (zwischen Cycle-Knoten): `stroke-error stroke-[2] strokeDasharray="6 4"`, gleicher pulse
- Knoten-Labels behalten ihren normalen `fill-foreground`-Stil

**Above Graph (Banner):**
- shadcn `Alert variant="destructive"` mit:
  - Title: "Zyklus im Abhängigkeitsgraph erkannt"
  - Description: "Plan-Mutate auf **{label}** blockiert durch Cycle: {first 3 nodes} → ..."
  - Buttons rechts: "Path im Graph fokussieren" (scrollt + zoomt zu Cycle) + "Verstanden, ausblenden"
- Erscheint **zusätzlich zum existing ε.1 CycleBanner** (visuell distinct: ε.1=yellow/warning, ε.3c.β=red/destructive)
- Position: über dem ε.1 CycleBanner wenn beide aktiv (LIFO-Stack)

#### Cycle-Path-Fokus-Aktion

"Path im Graph fokussieren"-Button:
- Calculiert Bounding-Box aller `path[]`-Knoten in SVG-Coords
- Scrollt + zoomt graph-container damit alle Cycle-Knoten sichtbar
- Optional: animated camera-pan via framer-motion (`prefersReducedMotion` skip)

### Interactions

| Aktion | Behavior |
|---|---|
| **422-Cycle-Response in Dialog** | Dialog zeigt CycleAlert (Bestand ε.3b); zusätzlich: `onCycleDetected(cycle)` propagiert → View-State update; user kann Dialog schließen → Graph-Overlay bleibt sichtbar |
| **"Verstanden, ausblenden"** | `setLastCycleAttempt(null)` → Overlay verschwindet (Stroke-Override entfernt, Banner unmount) |
| **"Path im Graph fokussieren"** | Auto-scroll + (optional) zoom-fit auf cycle-bounding-box |
| **Snapshot refetch** | useEffect-Watcher auf `snapshot.generated_at` → bei Change wird `lastCycleAttempt` cleared (Cycle könnte gelöst worden sein) |
| **Re-mutate triggert NEUER 422 mit anderer Cycle** | Replace previous `lastCycleAttempt` mit neuem; Overlay re-rendert |

### States

| State | Render |
|---|---|
| **Kein Cycle aktiv** | Knoten-Stroke normal; kein Overlay-Banner |
| **422-Cycle aktiv** | Cycle-Knoten + Edges mit destructive-Override; Banner above graph |
| **Cycle + ε.1-Snapshot-Cycle gleichzeitig** | Beide Banners sichtbar gestackt (ε.3c.β rot oben, ε.1 yellow unten); Knoten können in beiden Sets sein → destructive-Override gewinnt (rot dominiert) |
| **Cycle-Knoten außerhalb Viewport** | Banner zeigt "Path im Graph fokussieren"-Button (sonst hidden wenn alle bereits sichtbar) |
| **3D-Mode während Cycle aktiv** | Cycle-Overlay ist 2D-only in MVP; im 3D-Mode wird Banner gezeigt aber Knoten-Highlight skipped (3D-Stroke-Override deferred zu ε.3c.γ oder später) |

---

## Frontend Handoff

### Proposed New Components

| Path | Purpose | LOC est. |
|---|---|---|
| `src/components/projects/trajectory/bulk-action-bar.tsx` | Floating-Card mit Count + Bulk-Trigger + Deselect | ~80 |
| `src/components/projects/trajectory/bulk-shift-popover.tsx` | Popover mit days-Input + Quick-Buttons | ~110 |
| `src/components/projects/trajectory/cycle-attempt-overlay.tsx` | destructive Alert + Focus-Button | ~70 |
| `src/components/projects/trajectory/use-selection-set.ts` | `Set<string>` State-Hook mit toggle/clear/has | ~50 |

### Reused Components (no recreate)

- `PlanMutateDialog` (existing) — erweitert um Multi-Source-Header + Group-Headers in DiffTable
- `PlanMutateDiffTable` (existing) — gruppiert per `node_id` mit Headers
- `PlanMutateConflictBanner` (existing) — Multi-Source-Conflict-Message
- shadcn `Card`, `Popover`, `Alert`, `AlertDialog`, `Button`, `Input`
- framer-motion für Slide-in der Action-Bar

### Modified Files

| File | Change |
|---|---|
| `src/components/projects/trajectory-graph-view.tsx` | Neuer `selectionSet`-Hook; props an `TrajectoryGraph2D` für `selectedIds` + `onToggleSelection`; render `BulkActionBar` wenn `selectionSet.size > 0`; render `CycleAttemptOverlay` wenn `lastCycleAttempt != null`; `onCycleDetected`-Callback to `PlanMutateDialog` |
| `src/components/projects/trajectory-graph-2d.tsx` | Erweitert um `selectedIds: Set<string>` Prop + `onNodeToggleSelect(nodeId, modifierKey)`-Handler auf Sprint/Phase-`<motion.g>`-onClick (modifier-key-detection); Selection-Ring-Render conditional; Cycle-Knoten-Stroke-Override aus `cycleOverlay.path` |
| `src/components/projects/trajectory/plan-mutate-dialog.tsx` | Erweitert um `sources: Array<{node_id, kind, label}>` statt single `sourceNodeId/kind/label`; Header zeigt N; Group-Headers in Body; `onCycleDetected`-Callback prop |
| `src/components/projects/trajectory/plan-mutate-diff-table.tsx` | Row-Group-Header per `node_id` mit Toggle-Collapsible; group-by `affected[].node_id` Logic |
| `src/lib/project-graph/types.ts` | New types: `PlanMutateSource`, `CycleAttempt` |

### API Contract (Backend extends in parallel)

**`POST /api/projects/[id]/plan-mutate`** — Request-Erweiterung:

**Single-Source (backwards-compat):**
```ts
{ source_node_id, source_node_kind, intent, if_updated_at }
```

**Multi-Source (new):**
```ts
{
  sources: Array<{ node_id: string; node_kind: "sprint"|"phase" }>,
  intent: { kind: "shift_dates"; days: number },
  if_updated_at: Array<{ node_id; node_kind; updated_at }>
}
```

Server-Logic: wenn `sources`-Field present → multi-path; sonst legacy single-source. Server kann beide unterstützen mit interner Iteration über `v_source_id` und einem gemeinsamen BFS-Walk pro source (Visited-Set sharedacross all sources um doppelte UPDATEs auf overlap-knoten zu vermeiden).

**422-Cycle-Response** — Erweiterung:
```ts
| { ok: false; status: 422; cycle: { detected_at_node_id; path: string[]; source_node_id?: string } }
```
Optionales `source_node_id` zeigt welche der N Sources den Cycle ausgelöst hat (bei Multi-Source).

### MVP Acceptance Criteria

1. **AC-1 Ctrl/Cmd-Click** auf Sprint/Phase toggled `selectedIds`-Set; visualisiert mit dashed primary Ring
2. **AC-2 Background-Click** auf leere Graph-Area cleart Selection (wenn ≥ 1)
3. **AC-3 ESC** cleart Selection (wenn aktiv)
4. **AC-4 BulkActionBar** erscheint bei `selectionSet.size >= 2` mit Count + Kind-Mix-Summary
5. **AC-5 BulkShiftPopover** öffnet via Action-Bar-Button; days-Input + Quick-Buttons ±1/±7/±14/±30
6. **AC-6 Multi-Source-Dialog** Header zeigt "{N} Knoten · ±{X} Tage"; Body gruppiert Rows per `node_id` mit Sticky-Group-Headers
7. **AC-7 All-or-nothing-Conflict** — 422/409 in ANY source → ALL ABORT; ConflictBanner zeigt welche Source-IDs blockieren
8. **AC-8 CycleAttemptOverlay** rendert bei 422-Cycle: Banner above graph + Cycle-Knoten mit `stroke-error` + Edges hervorgehoben + animated pulse
9. **AC-9 Cycle-Dismiss** Button cleart `lastCycleAttempt`-State; Overlay verschwindet
10. **AC-10 Cycle-Focus** Button scrollt Graph zu Bounding-Box aller Cycle-Knoten
11. **AC-11 Snapshot-Refetch** cleart `lastCycleAttempt` automatisch (Cycle könnte gelöst worden sein)
12. **AC-12 Mobile 375px** Long-Press selektiert; Action-Bar full-width bottom; Sheet-Variante des Dialogs
13. **AC-13 A11y** `aria-selected` auf Knoten + Live-Region für Selection-Count + role="region" auf Action-Bar
14. **AC-14 Bundle-Δ** ≤ +4 KB raw-gzipped (in Lazy-Chunk, nicht Main) auf Plan-Mutate-Chunk
15. **AC-15 Single-Source-Path** bleibt unverändert funktional (kein Regression)
16. **AC-16 Selection-Reset** bei Commit/Abort/Mode-Switch

### Later (NOT in ε.3c.β)

- **Shift-Click Range-Select** zwischen letztem Selected und Current → ε.3c.γ
- **Drag-Lasso** für Multi-Select via Click-and-Drag in leerem Bereich → ε.3c.γ
- **Multi-Intent** (verschiedene Days pro Source) → ε.3d wenn nachgefragt
- **Cycle-Path-Auto-Resolve-Suggestion** ("Diese Dep löschen würde Cycle auflösen") → ε.4 mit AI-Vorschlägen
- **Cycle-Overlay im 3D-Mode** → ε.3c.γ
- **Soft-Selection-Limit 50** mit Toast → ε.3c.γ

---

## Risks And Open Questions

| ID | Risk / Question | Mitigation / Empfehlung |
|---|---|---|
| **R-D1** | Ctrl-Click konfligiert mit Background-Click-Selection-Reset wenn beide auf Sprint/Phase fallen | Background-Click nur wenn `e.target === svg`-Root; Ring-Click ist Knoten-Click und triggert Toggle, nicht Reset |
| **R-D2** | Selection-Set + permission-Flip mid-flight (User verliert Editor-Rolle) | Permission-Re-Check pro Action; bei Drop von can_plan_mutate → Action-Bar hidden, Selection bleibt visuell aber read-only |
| **R-D3** | Bulk-Diff bei N=20 Sources mit je 5 Folge-Knoten = 100 Rows in DiffTable | Existing `max-h-96` + Footer-Counter "+{N-50} weitere" deckt das ab; Group-Header bleibt Sticky |
| **R-D4** | Multi-Source-422-Cycle: welche Source triggert? | Backend liefert `cycle.source_node_id` (optional); FE highlightet betroffene Source explicit im Banner |
| **R-D5** | CycleAttemptOverlay + ε.1 CycleBanner gleichzeitig — visuelle Überfrachtung | LIFO-Stack mit `space-y-2`; ε.3c.β destructive über ε.1 warning |
| **R-D6** | Auto-clear bei Snapshot-Refetch könnte Cycle löschen bevor User reagiert | Snapshot-Refetch triggers normalerweise nur nach Commit/Reload-User-Action — User hat bewusst neu geladen, Stale-Cycle-Anzeige ist dann eher Confusion. Akzeptabel |
| **OQ-D1** | Soll BulkActionBar auch bei Single-Selection (N=1) sichtbar sein? | Empfehlung: **Ja** ab N=1 für Konsistenz; User kann explizit Bulk-Pfad nutzen statt Drag-Handle. Single-Drag bleibt schnellster Path |
| **OQ-D2** | Drag-Handle auf selected vs nicht-selected Knoten: was passiert mit der Selection? | Empfehlung: Drag auf NICHT-selected = single-pfad, Selection bleibt; Drag auf SELECTED = bulk-pfad. **Power-User-Workflow** |
| **OQ-D3** | Cycle-Overlay-Persistenz bei Dialog-Close vs Cycle-Detection-Order | Empfehlung: Sobald 422-Cycle empfangen, ist Overlay aktiv; Dialog-Close beeinflusst es nicht. Overlay lebt independent. |

---

## Handoff

**Implementation-Order ε.3c.β:**

1. **Backend** (~0.5 PT): RPC-Body-Erweiterung um `sources`-Array; BFS-Walk shared visited-set über alle sources; 422-Response um optionales `source_node_id` ergänzen
2. **Frontend** (~1.5 PT) parallel:
   - `use-selection-set.ts` Hook
   - `bulk-action-bar.tsx` + `bulk-shift-popover.tsx`
   - `cycle-attempt-overlay.tsx`
   - Erweitern: `plan-mutate-dialog.tsx` für Multi-Source, `plan-mutate-diff-table.tsx` für Group-Headers, `trajectory-graph-2d.tsx` für Selection-Render + Modifier-Click + Cycle-Stroke-Override, `trajectory-graph-view.tsx` für State-Orchestration

**Danach** `/qa` ε.3c.β gegen die 16 AC + R-D1/-D2/-D5 als Red-Team-Vektoren. Dann ε.3c.γ (Pagination) Designer-Brief.
