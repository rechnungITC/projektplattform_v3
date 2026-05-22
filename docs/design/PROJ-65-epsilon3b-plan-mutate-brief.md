# PROJ-65 ε.3b — Plan-Mutate + Diff + Undo · Designer Brief

> **Scope:** Story 65-7 in CIA-revised Scope (L26: ohne Compliance). Drag-Handle an Sprint/Phase, Diff-Modal, 30s-Undo-Toast, 409-Conflict-State. Voraussetzung Locks L15/L17/L18/L19/L21/L22/L23/L24/L25/L26 (Spec Section T + X). Implementation in `/frontend` + `/backend` parallel.

## Goal

Project-Lead kann im Trajektoriengraph einen Sprint- oder Phase-Knoten draggen, sieht in einem Diff-Modal die propagierten Änderungen auf Datum/Kosten/Risiko/Stakeholder-Last, committed atomar mit 30s-Undo-Window — und kommt bei 409-Konflikten (paralleler Edit) verlustfrei wieder in einen sauberen Stand.

## Benchmark Fit

| Tool | Pattern |
|---|---|
| Jira | Bulk-Edit-Modal: "These N issues will be affected" Diff-Preview vor Commit |
| ClickUp | Drag-to-Reschedule mit Cascading-Dependency-Update-Prompt |
| monday.com | Inline-Drag + "Apply changes" Preview-Pane + Undo-Toast unten-rechts |
| Local V3 | `project-dependencies.html` als visuelles Idiom; **ε.2 StakeholderSwapDialog** liefert das konkrete Modal+RadioGroup+Delta-Grid+Class-3-Footnote-Pattern (`src/components/projects/stakeholder/stakeholder-swap-dialog.tsx`) |

## Recommended View Strategy

| Aspekt | Entscheidung |
|---|---|
| **Default-View** | Direkter Drag im bestehenden `TrajectoryGraph2D` — keine neue Page, keine separate Mode-Toggle |
| **Diff-Surface** | `shadcn Dialog sm:max-w-2xl` (L17 Lock, identisch zu ε.2 SwapDialog) |
| **Feedback-Surface** | `sonner toast` bottom-right mit 30s-Progress-Bar + "Rückgängig"-CTA (matches `toast.success` Usage in `trajectory-graph-view.tsx:526`) |
| **Saved Views** | n/a — Plan-Mutate ist Action, nicht View |
| **Grouping/Sorting** | Diff-Table sortiert nach `affected_depth` (direkt-Folge zuerst, transient-Folge zuletzt) |

## Layout

### Drag-Handle (Affordance)

**Position:** Top-right-Corner des Sprint/Phase-Knotens, attached SVG-Glyph (12×12 px).

**Visual:**
- Material-Symbols `drag_indicator` 6-Punkt-Icon
- Background `surface-container-high` mit `outline-variant`-Border, `primary`-Tint on Hover
- Cursor: `grab` → `grabbing` während Drag
- Opacity 60% default, 100% on Node-Hover oder Handle-Hover

**Visibility-Rules:**
- Nur an `node.kind === "sprint" | "phase"` (Story 65-7 AC-1)
- NICHT an `goal`, `milestone`, `work_item`, `epic`, `project_start`
- NUR wenn `snapshot.permissions.can_plan_mutate === true` (Backend-driven, L22 Feature-Flag + RBAC kombiniert)
- Hidden im 3D-Mode (β/γ deferred)

**Drag-Behavior:**
- Click-and-drag **horizontal nur** entlang Time-Axis
- Snap-to-Day (≥1 Tag) mit Tooltip-Hint "ISO-KW {N}" bei Hover-during-Drag
- Ghost-Node folgt Cursor; Original-Node bleibt `opacity-50` dimmed an Ursprungsposition
- ESC während Drag → Cancel, Ghost verschwindet, kein Server-Call
- Drop → Cursor "Lade…", Server-Call `POST /plan-mutate` mit `if_updated_at` pro Knoten, Dialog öffnet mit Skeleton

**Warum Drag-Handle statt Node-Body-Drag:**
- Node-Body-Click ist bereits an `onFocusNode` (öffnet DetailPanel)
- Explizite Handle eliminiert UX-Ambiguität (focus vs mutate)
- Touch-Hit-Area + Long-Press-Fallback machbar

### Diff-Table-Layout

**Header-Region** (`DialogHeader`):
- Title: `Plan-Mutate-Vorschau · {sourceNode.label}` (h3, `font-semibold`)
- Subtitle: `Die Verschiebung wirkt auf {N} Folge-Knoten.` (body-sm, `text-muted-foreground`)
- Rechts: `ClassThreeLock` (re-use existing, `clearView={costClearView}`)

**Body** — `shadcn Table` mit sticky Header:

| Spalte | Header | Width | Content |
|---|---|---|---|
| 1 | Knoten | 32% | Kind-Icon + `node.label` + Type-Badge (sm) |
| 2 | Feld | 14% | "Start", "Ende", "Kosten", "Risiko", "Stakeholder-Last" |
| 3 | Vorher | 22% | `text-muted-foreground line-through` für nicht-relevante Beibehaltung |
| 4 | Δ | 8% | Pfeil-Glyph mit Severity-Färbung (`primary` neutral, `tertiary` delay, `error` blocked) |
| 5 | Nachher | 24% | `font-medium` mit neuem Wert |

**Row-Grouping:** alle Felder eines Knotens in zusammenhängendem Row-Block, erste Row hat `border-t-2`-Trenner zum vorherigen Knoten.

**Scroll-Behavior:** `max-h-96 overflow-y-auto` mit sticky `<thead>`; bei N > 50 erscheint Footer-Counter "…und {N-50} weitere Knoten".

**Empty-State:** Banner `surface-container-low` mit Body-Text "Keine Folge-Knoten betroffen — nur dieser Knoten wird verschoben." statt Tabelle.

### Class-3-Cell-Visual

**Cost-Felder bei `costClearView === false`:**
- Vorher-Cell: `***` in `text-muted-foreground text-sm`
- Nachher-Cell: `***` + Aggregate-Bucket-Label (z.B. "+ höherer Aufwand *") via `formatCostDelta({ kind: "aggregate", bucket })`
- Δ-Cell: nur Pfeil-Richtung (▲/▼/≈) ohne Zahl
- Asterisk `*` direkt am maskierten Wert, einheitlich
- Footer: `ClassThreeFootnote hasMaskedValue projectId={projectId}` (re-use existing) — rendert mailto-Link „Klartext anfordern →"

**Cost-Felder bei `costClearView === true`:**
- Vorher/Nachher als `formatRate(...)` oder `formatCostDelta({ kind: "exact" })` mit `€`-Symbol und de-DE-Formatierung
- Δ-Cell zeigt Cent-Diff

**Risk-Felder** (immer sichtbar, keine Klassifikation):
- Vorher: enum-Label "Niedrig" / "Mittel" / "Hoch" / "Kritisch"
- Nachher: gleiches enum
- Unter dem Risk-Row als Collapsible: "Top-3 betroffene Risiken" mit `risk_id` + Title (max 3 sichtbar, click → öffnet Risk in neuem Tab)
- Δ-Color: `error` wenn severity steigt, `tertiary` für unchanged-but-shifted, `secondary` für sinkend

**Stakeholder-Last-Felder:**
- Sichtbar als `{name} ({role})` mit Avatar-Initial
- Class-3-relevant nur indirekt via Cost-Spalte; Stakeholder-Name selbst nicht maskiert

### 409-Conflict-Error-State

**Trigger:** Server antwortet `{ ok: false, status: 409, conflict: { conflicted_node_ids: [...], current_snapshot_hint: { updated_at, ... } } }`.

**Visual:**
- Diff-Tabelle bleibt sichtbar aber `opacity-60` dimmed
- Conflicted-Knoten in Tabelle bekommen `bg-destructive/10` Row-Highlight + ⚠ `AlertTriangle` Icon vor `node.label`
- Footer wird ersetzt durch `Alert variant="destructive"` Banner:
  - Title: "Plan-Konflikt — andere Bearbeitung erkannt"
  - Description: `{conflicted_node_ids.length} Knoten wurden zwischenzeitlich geändert: {first 3 names}, …`
  - 2 Buttons:
    - **"Neuen Stand laden"** (`variant="default"`) → refetch Snapshot, Diff neu berechnen, Dialog refresh
    - **"Abbrechen"** (`variant="outline"`) → close Dialog ohne Mutation

**KEIN Force-Apply-Button** — CIA L18/R-H1 lockt "default = alles-oder-nichts".

**Hierarchy:** User sieht weiterhin Original-Plan zum Vergleich; weniger State-Loss als kompletter Dialog-Dismiss.

### 422 Cycle-Detected-Error-State

**Trigger:** Server antwortet `{ ok: false, status: 422, cycle: { detected_at_node_id, path: [...] } }`.

**Visual:**
- Diff-Tabelle wird NICHT angezeigt (nie gerendert, weil Cycle-Check pre-Mutation läuft)
- Dialog-Body zeigt `Alert variant="destructive"` mit:
  - Title: "Zyklus im Abhängigkeitsgraph erkannt"
  - Description: "Knoten **{label}** ist Teil eines Dependency-Cycle. Plan-Mutate ist erst möglich, wenn der Zyklus aufgelöst ist."
  - Path-Visualization: kleine inline Liste der Cycle-Path-IDs als Breadcrumbs (max 5)
- Buttons: nur "Schließen" (`variant="outline"`)
- Optional Link "Cycle im Graph anzeigen →" — markiert die Cycle-Knoten im Graph (`stroke-error`) **deferred zu ε.3c**

### Undo-Toast-Pattern

**Trigger:** Apply-Success Response `{ ok: true, causation_id, diff: { affected: [...] } }`.

**Toast-Structure** (Sonner):
```
┌────────────────────────────────────────────────┐
│ ✓  Plan übernommen · {N} Knoten geändert       │
│    {sourceNode.label} verschoben um ±{X} Tage  │
│                            [Rückgängig (29s)]  │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░ (Progress)     │
└────────────────────────────────────────────────┘
```

- Position: bottom-right (default)
- TTL: **30s** mit visueller Progress-Bar am unteren Toast-Rand (animiert via `Sonner action` + custom render)
- "Rückgängig"-Label mit Live-Countdown-Sekunden in Klammern
- Top-Line `text-foreground`, Sub-Line `text-muted-foreground text-sm`
- Icon: `Check` in `text-primary`

**Undo-Click-Flow:**
1. Toast wechselt zu Loading-Variant: "Wird rückgängig gemacht…" mit `Loader2` Spinner, "Rückgängig"-Button hidden
2. `POST /plan-mutate/undo` mit `causation_id`
3a. **Success:** Toast wechselt zu Success-Variant "✓ Plan rückgängig · {N} Knoten wiederhergestellt", verschwindet nach 3s ohne Undo
3b. **409-during-Undo** (andere User hat zwischen Apply und Undo editiert): Toast wechselt zu Alert-Variant "Undo nicht möglich — {M} Konflikt-Knoten" + Link "Details" → öffnet `AlertDialog` mit Konflikt-Knoten-Liste; User kann nur "Schließen" wählen
3c. **5xx:** Toast wechselt zu Alert-Variant "Undo fehlgeschlagen — bitte erneut versuchen" + "Erneut versuchen"-Action

**TTL-Behavior:**
- Nach 30s ohne Click → Toast dismissed automatisch, Mutation gilt als "committed" (kein Server-Side-Window)
- Server speichert KEIN Undo-Window — Undo-Endpoint funktioniert immer solange `causation_id` im Audit-Log liegt und keine konfliktierenden Edits dazwischen kamen (CIA L23: Single-Step session-basiert; persistente N-Step in ε.3c via F-33)

## Interactions

| Interaktion | Behavior |
|---|---|
| **Quick-Create** | n/a (Plan-Mutate creates keine neue Entity) |
| **Inline-Edit** | n/a (Drag-only Workflow für MVP; Manual-Date-Input als a11y-Fallback siehe Keyboard) |
| **Bulk-Actions** | deferred to ε.3c (Single-Source-Node in ε.3b; Multi-Drag = F-PROJ-65-37 neu) |
| **Drag-and-Drop** | Snap-to-Day horizontal, ESC = Cancel, Drop öffnet Dialog |
| **Keyboard** | Drag-Handle ist `<button>`; `Enter` darauf öffnet kleinen `Popover` mit Date-Input (Manual-Move-Fallback); danach selber Dialog-Flow |
| **Context-Menu** | n/a (right-click ist im Trajectory-Graph nicht reserviert) |
| **Undo/Retry** | Sonner-Toast 30s Window (Undo); Retry für Apply geht über erneutes Drag |
| **Optimistic vs Confirmed** | **Confirmed only** — Diff kommt server-side; UI rendert nie spekulative Werte |
| **Toasts vs Blocking** | Diff = blocking Dialog (User MUSS bewusst übernehmen); Undo-Window = non-blocking Toast |

## States

| State | Render |
|---|---|
| **Loading (Diff-Computation)** | Dialog öffnet sofort; Diff-Table zeigt 3× `Skeleton`-Rows; Apply-Button disabled mit `Loader2` |
| **Loading (Apply)** | Apply-Button zeigt `Loader2 + "Übernehmen…"`; Verwerfen-Button disabled; ESC blockiert |
| **Empty (0 affected)** | Banner statt Tabelle: "Keine Folge-Knoten betroffen — nur dieser Knoten wird verschoben." Apply-Button trotzdem enabled |
| **Error 5xx** | Diff-Table wird Skeleton; Footer-Bereich zeigt `Alert variant="destructive"` "Plan-Vorschau fehlgeschlagen" + "Erneut versuchen"-Button |
| **Error 409 Conflict** | Diff dimmed + Conflict-Banner (siehe Layout) |
| **Error 422 Cycle** | Cycle-Alert statt Diff-Table (siehe Layout) |
| **Error 403 Permission** | Drag-Handle gar nicht angezeigt; Tenant-Admin sieht in Tenant-Settings den Link "Plan-Mutate aktivieren" (deferred zu PROJ-17 ergänzen) |
| **Disabled Feature-Flag** | Drag-Handle hidden; Settings-Hint via Toast nur bei `?planMutateHint=1` Param (deferred) |
| **Stale-Data (`if_updated_at` > 60s alt)** | Beim Drag-Drop: Toast-Hint "Plan-Vorschau ist >1min alt, neu draggen" — Dialog öffnet nicht (deferred zu ε.3c, MVP toleriert) |
| **Mobile 375px** | Dialog wird `Sheet` full-screen; Diff-Table wird Card-List (1 Card pro Knoten mit Field/Vorher/Nachher gestapelt); Drag-Handle hidden, **Manual-Date-Input via Long-Press** auf Sprint/Phase-Node |
| **Tablet 768px** | Dialog `sm:max-w-2xl`; Drag mit Touch — Long-Press-Drag (300ms) startet Drag-Mode |
| **Desktop 1440px** | Standard, Drag mit Maus |

## Dashboard And Rollups

| Surface | Rollup |
|---|---|
| **Global Dashboard** | Kein KPI — Plan-Mutate ist Tactical-Activity, nicht reporting-würdig |
| **Project Room** | Activity-Feed-Entry "{user} hat Plan verschoben um {±X} Tage ({N} Knoten betroffen)" mit Click → Audit-Detail (PROJ-10 Audit-Inspector) |
| **My Work/Inbox** | Kein direkter Eintrag (non-assigned-Activity) |
| **Alerts** | 409-Konflikte zählen als Audit-relevant; **kein User-facing Alert** (Audit-Log reicht) |

## Frontend Handoff

### Proposed New Components

- `src/components/projects/trajectory/plan-mutate-drag-handle.tsx` — SVG-Drag-Handle attached zum Sprint/Phase-Node; nur sichtbar wenn `canEdit && featureFlagOn`; emits `onDragEnd(newStartDate)`
- `src/components/projects/trajectory/plan-mutate-dialog.tsx` — Wrapper-Component mit Diff-Fetch + Apply + Conflict-Handling; orchestriert `PlanMutateDiffTable` + `PlanMutateConflictBanner`
- `src/components/projects/trajectory/plan-mutate-diff-table.tsx` — Pure Presentation; reuse `formatCostDelta`/`formatRiskDelta`/`formatTimeDelta`
- `src/components/projects/trajectory/plan-mutate-conflict-banner.tsx` — 409-State Alert mit "Neuen Stand laden" Action
- `src/components/projects/trajectory/plan-mutate-cycle-alert.tsx` — 422-State Cycle-Display
- `src/components/projects/trajectory/use-plan-mutate-undo.ts` — Hook für Sonner-Toast-Lifecycle + Undo-CTA-Wiring + Countdown

### Reused (do NOT recreate)

- `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter` — shadcn
- `Table`, `TableHeader`, `TableRow`, `TableCell` — shadcn
- `Alert`, `AlertTitle`, `AlertDescription` — shadcn
- `Button`, `Skeleton`, `Tooltip` — shadcn
- `toast` from `sonner`
- `ClassThreeLock`, `ClassThreeFootnote` — `src/components/projects/stakeholder/class-three-lock.tsx`
- `formatTimeDelta`, `formatCostDelta`, `formatRiskDelta`, `formatRate` — `src/components/projects/stakeholder/cost-delta-formatter.ts`
- `TrajectoryGraph2D` Node-Slot — Drag-Handle hängt sich daran, kein Rewrite

### Routes Affected

- `/projects/[id]/graph?mode=trajectory` (existing) — bekommt Drag-Handle-Slots für Sprint/Phase
- KEINE neuen Pages

### Data/API Assumptions

**Snapshot-Extension** (`?include=trajectory`):
```ts
snapshot.permissions.can_plan_mutate: boolean  // L22 Backend-driven
snapshot.permissions.cost_clear_view: boolean   // existing
```

**`POST /api/projects/[id]/plan-mutate`** — Request:
```ts
{
  source_node_id: string
  source_node_kind: "sprint" | "phase"
  intent: { kind: "shift_dates"; days: number }  // ε.3b only — kind "shift_dates"
  if_updated_at: Array<{ node_id: string; node_kind: string; updated_at: string }>
}
```

**Response:**
```ts
| { ok: true; causation_id: string; diff: { affected: AffectedRow[] } }
| { ok: false; status: 409; conflict: { conflicted_node_ids: string[]; current_snapshot_hint: {...} } }
| { ok: false; status: 422; cycle: { detected_at_node_id: string; path: string[] } }
| { ok: false; status: 403 | 5xx; error: string }

type AffectedRow = {
  node_id: string
  node_kind: string
  node_label: string
  field: "start_date" | "end_date" | "cost_estimate" | "risk_severity" | "stakeholder_load"
  before: { kind: "exact" | "masked" | "enum"; value: ... }
  after: { kind: "exact" | "masked" | "enum"; value: ... }
  severity: "neutral" | "delay" | "blocked"
  masked: boolean
  // top_3_risks only for field === "risk_severity":
  top_3_risks?: Array<{ risk_id: string; title: string; severity: string }>
}
```

**`POST /api/projects/[id]/plan-mutate/undo`** — Request:
```ts
{ causation_id: string }
```
Returns same shape (mit reverse-direction Diff).

### MVP Acceptance Criteria (handoff zu `/frontend`)

1. **AC-1 Drag-Handle-Visibility** — erscheint nur an Sprint- und Phase-Knoten, nur wenn `snapshot.permissions.can_plan_mutate === true` und `canEdit === true`.
2. **AC-2 Drag-Mechanik** — horizontal Snap-to-Day; ESC cancelt; Ghost-Node folgt Cursor, Original-Node `opacity-50`.
3. **AC-3 Dialog-Trigger** — Drop öffnet `PlanMutateDialog` mit Skeleton-Loading; Server-Call mit `if_updated_at` aus Snapshot.
4. **AC-4 Diff-Tabelle** — 5 Spalten (Knoten/Feld/Vorher/Δ/Nachher), sticky Header, Row-Grouping per Knoten, `max-h-96` Scroll.
5. **AC-5 Class-3-Cost-Masking** — `***` + Aggregate-Bucket-Label wenn `!costClearView`; `ClassThreeFootnote` unter der Tabelle.
6. **AC-6 Risk-Display** — Severity-Enum vorher/nachher + Collapsible Top-3-Risiken (max 3 IDs, click öffnet Risk in neuem Tab).
7. **AC-7 409-Conflict-State** — Conflict-Banner ersetzt Footer, Konflikt-Knoten in Tabelle highlighted; "Neuen Stand laden" Action funktional.
8. **AC-8 422-Cycle-State** — Cycle-Alert statt Diff-Table; Path-Breadcrumbs sichtbar; "Schließen" only.
9. **AC-9 Commit-Toast** — Sonner-Toast mit Top/Sub-Line + 30s-Progress-Bar + "Rückgängig"-Button mit Live-Sekunden-Countdown.
10. **AC-10 Undo-Flow** — Click → Loading-Variant → Success-Variant (3s) | 409-Variant mit Konflikt-Liste | 5xx-Variant mit Retry.
11. **AC-11 Mobile (375px)** — Dialog full-screen Sheet, Tabelle als Card-List, Manual-Date-Input via Long-Press (Touch-Drag deferred).
12. **AC-12 A11y** — Drag-Handle als `<button>` mit `aria-label`; Enter öffnet Popover mit Date-Input als Fallback; alle Cells mit Screen-Reader-friendly Labels.
13. **AC-13 Bundle-Δ ≤ 8 KB gzipped** auf `/projects/[id]/graph` (Subbudget innerhalb L9-30 KB-Total).
14. **AC-14 Feature-Flag-Respekt** — `tenants.settings.trajectory_plan_mutate_enabled === false` → keine Drag-Handles, kein Dialog.

### Later (NOT in ε.3b)

- Multi-Node-Drag / Bulk-Plan-Mutate → ε.3c (neue Fork F-PROJ-65-37)
- Cycle-Visualization-Overlay im Graph (Cycle-Knoten highlighted) → ε.3c (F-PROJ-65-38)
- Persistente N-Step-Undo session-basiert → ε.3c (F-PROJ-65-33)
- Streaming-Diff für N > 200 Knoten → ε.3c (F-PROJ-65-34)
- Compliance-Status-Spalte in Diff-Table → F-PROJ-65-32 Vor-Story
- PROJ-58-Sim-Invalidation via `BroadcastChannel` → ε.3c (F-PROJ-65-35)
- Snap-to-Week-Mode als Tenant-Setting → ε.3c (F-PROJ-65-39)
- Touch-Drag auf 375px Mobile → ε.3c (deferred; MVP nutzt Manual-Date-Input)

## Risks And Open Questions

| ID | Risk / Question | Mitigation / Empfehlung |
|---|---|---|
| **R-D1** | Drag-Handle vs Node-Body-Click-Konflikt | 12×12px Handle + explizite `data-drag-handle`-Region; Cursor-Wechsel als visuelle Cue |
| **R-D2** | Mobile-Touch-Drag-UX auf 375px riskant | ε.3b shippt **Manual-Date-Input via Long-Press**; Touch-Drag deferred zu ε.3c |
| **R-D3** | Snap-to-Day vs Snap-to-Week-Konflikt für Sprint/Phase-Wochengrenzen | Snap-to-Day mit ISO-KW-Tooltip-Hint; Snap-to-Week als Tenant-Setting ε.3c (F-39) |
| **R-D4** | Diff-Row-Limit bei N > 50 unleserlich | `max-h-96` + Scroll + Counter "+{N-50} weitere Knoten"; bessere Aggregation ε.3c |
| **R-D5** | Undo-Sekunden-Countdown rerendert alle 1s → Performance | Sonner-Toast hat eigene Update-Cadence; CSS-Transition statt React-Re-Render für Progress-Bar |
| **OQ-D1** | Liefert Backend `can_plan_mutate` im Snapshot-Header oder via separates Settings-Endpoint? | **Empfehlung: im Snapshot-Header** unter `snapshot.permissions.can_plan_mutate` — vermeidet 2. Roundtrip |
| **OQ-D2** | Wo erscheint der "Plan-Mutate aktivieren"-Settings-Toggle für Tenant-Admin? | **Empfehlung: PROJ-17 Tenant-Administration-Page erweitern** (deferred Fork F-PROJ-65-40 — kleiner Settings-Slice) |
| **OQ-D3** | Was passiert bei Drag-Drop auf ungültige Position (vor Project-Start, nach Project-End)? | **Empfehlung: Drag-Cursor wird `not-allowed`; Drop-Validation server-side via 422 mit klarem Error** |

## Handoff

**Nächste Schritte:**

1. **`/backend` ε.3b** — RPC `plan_mutate_atomic(p_project_id uuid, p_changes jsonb)` + Routes `/plan-mutate` + `/plan-mutate/undo` + `snapshot.permissions.can_plan_mutate` Backend-Driven (L21/L22)
2. **`/frontend` ε.3b** parallel — 6 neue Components + Hook nach diesem Brief
3. **`/qa` ε.3b** — gegen 14 AC oben + R-C1/R-C2/R-H1/R-H2/R-H3 Mitigation-Verification
4. **`/deploy` ε.3b** — Tag `v1.68.0-PROJ-65-eps3b`, Feature-Flag default `false`, Pilot-Tenant aktiviert via Tenant-Settings
