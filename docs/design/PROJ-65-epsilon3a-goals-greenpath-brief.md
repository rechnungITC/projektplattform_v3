# PROJ-65 ε.3a — Designer Brief: Goals + Green-Path

> Stand: 2026-05-21 · Designer-Pass für /frontend + /backend ε.3a
> Scope-Lock: ε.3a = Goal-CRUD inline + GoalDetailPanel + GoalCreateDialog + GreenPathOverlay (Server-side `is_on_green_path`). **KEIN Plan-Mutate** (ε.3b), **KEINE Live-Propagation-Toast** (ε.3b), **KEINE KI-Vorschläge** (ε.4).
> Vorausgesetzt: Tech-Design Section T + L15–L20, ε.1 Backend (`project_goals` Tabelle live), ε.1 Frontend (GoalNode-Pentagon-Stub im 2D-Renderer), ε.2 Patterns (StakeholderDetailPanel, Class3Lock, FocusSummary).

## Designer Brief: PROJ-65 ε.3a Goals + Green-Path

### Goal

Dem Projektleiter erlauben, **Projektziele explizit zu setzen, zu pflegen und in Echtzeit zu sehen, welche Arbeitspakete tatsächlich auf das Ziel einzahlen** (grüner Pfad) — und welche im Sidetrack-Lärm verschwinden. Ohne diesen Anker bleibt jede Plan-Diskussion subjektiv ("Ist das wichtig? Bringt uns das näher?"). Mit ε.3a wird das Ziel zur sichtbaren Konstante rechts im Pfad, und Knoten leuchten grün auf, wenn sie zum Ziel beitragen.

Story 65-3 (Goal-Objekt + Zielnähe-Visualisierung) wird vollständig durch ε.3a gelöst. Story 65-7 (Live-Propagation + Diff/Undo) bleibt ε.3b vorbehalten.

### Benchmark Fit

| Pattern | Reuse aus |
|---|---|
| Goal als End-Knoten mit visuell abgesetztem Ring | Linear "Project Goals" (Pentagon-Shape rechts) — übernehmen, nicht kopieren |
| Inline-Edit-Form direkt im Detail-Drawer (ohne Modal-Roundtrip) | Jira Epic-Sidebar Inline-Edit, monday.com Item-Form — entspricht unserem `profile-edit-sheet.tsx` Pattern |
| Glow / Border-Akzent für "zahlt auf Ziel ein" entlang topologischer Vorgänger | ClickUp Goal-Tracker Path-Highlight + Asana Goals-Roadmap |
| Multi-Goal als Pentagon-Stack rechts bei N ≥ 2 | Linear Project-Group-Indicator, Asana Sub-goals-Tree |
| Stats-Card mit Open-Packages + Restaufwand + Critical-Count | monday.com Goal-Workload-Summary |
| Source-Ref-Wizard als Combobox mit Phase/Milestone-Suggest | Linear Cycle-Reference, Jira Sprint-Picker |
| DetachedGoalBadge bei Source-Phase-Delete (L6) | analog `stakeholderDeleted`-Pattern aus ε.2 |

Local V3 reuse: `Sheet` + `SheetHeader/Title/Footer` (PROJ-33 / PROJ-65 ε.2), `Dialog` (PROJ-65 ε.2 SwapDialog), `Combobox` über `Command` (PROJ-57 OrgUnit-Combobox), `Class3Lock` (PROJ-65 ε.2), `Card` + `Badge` (überall), `framer-motion` für Glow-Pulse.

### Recommended View Strategy

- **Default surface:** `/projects/[id]/graph?mode=trajectory` — gleicher Trajectory-Graph wie ε.1/ε.2. Goal-Knoten ist schon vorhanden (Pentagon-Placeholder); ε.3a macht ihn voll-funktional.
- **Goal-CRUD-Trigger:** Click auf Goal-Knoten öffnet `GoalDetailPanel` (right-Sheet, analog ε.2 StakeholderDetailPanel). Click auf "+ Ziel erstellen" in der Toolbar (rechts vom Cost-Lane-Empty-CTA, oder in der Graph-Header-Action-Zone) öffnet `GoalCreateDialog`.
- **Green-Path-Sichtbarkeit:** automatisch immer aktiv. Knoten auf Pfad zum Goal bekommen subtilen Emerald-Glow + Edge-Tinting. Toggle "Grünen Pfad ausblenden" in der Graph-Toolbar (optional, defaults on).
- **Density:** comfortable — Forms im Sheet haben Atemraum (analog ε.2 Detail-Panel), keine kompakten Tables.
- **Drill-down:** Sheet für Goal-Edit + Dialog für Goal-Create. Keine eigene Route.
- **Saved views:** keine in ε.3a — Filter über Goal-Set kommt in ε.3b/ε.4 wenn Multi-Goal-Filter sinnvoll wird.

### Layout

#### Header / Context bar

Reuse Trajectory-Toolbar (GraphShell + TrajectoryGraphView Toolbar). Neue Action-Button rechts neben Dim-Toggle:

```
[Beziehungen │ Trajektorie]   [2D │ 3D]   [+ Ziel erstellen]   [Filter ▾]
```

#### Goal-Knoten am Pfadende (existing, jetzt voll funktional)

```
                  ── ─ ─ ─ ─ ─►                ┌──────────────┐
   [Phase 3]    ─ ─ depends_on ─ ─ ─ ─ ─ ─ ─ ─►│ ╲   Goal     │
                                               │  ╲  Title    │
                                               │   ╲          │
                                               └──────────────┘
                                               (pentagon, rechts fixiert)
                                               
   Akzente:
   - `border-2 border-emerald-500` + `bg-emerald-500/20` wenn status='active'
   - subtle 2s pulse-glow (respect prefers-reduced-motion)
   - DetachedGoalBadge unten-rechts als 12×12 px Corner-Badge mit `link_off`-Icon
     wenn Source-Phase/Milestone gelöscht (L6)
   - Bei Multi-Goal: gestapelt vertikal, max 3 sichtbar + "+N"-Counter (analog F-PROJ-65-9 RiskBadge-Stacking)
```

#### Main work surface

2D-Pfad-Renderer (existing). Neu:

- **GreenPathOverlay** = additive SVG-Layer:
  - Knoten mit `attributes.is_on_green_path=true` bekommen einen zweiten outer Ring `stroke="emerald-400" strokeWidth="2" strokeDasharray="0"` mit `filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.5))`.
  - Edges, deren beide Endpoints `is_on_green_path` sind, bekommen `stroke-emerald-400/70` statt der `stroke-border`-Default. Stroke-width unchanged.
  - **Sidetrack-Knoten** (Lane-Type `cost` oder `compliance`) sind **excluded** vom Green-Path-Render selbst wenn Flag wahr — sichert Story 65-3 AC-5.
  - Glow kombiniert sich additiv mit Critical-Path-Overlay (PROJ-43): Knoten kann gleichzeitig critical UND green-path sein (Border bleibt sky-Critical, Glow wird emerald).

#### Detail panel (`GoalDetailPanel`) — Click auf Goal-Knoten

Right-side Sheet `sm:max-w-md`, analog ε.2 StakeholderDetailPanel:

```
┌───── Goal Detail ─────────────────────────┐
│  Releasebereit "Modul C v1.0"      [×]    │   ← Title (truncate)
│  ⚓ verknüpft mit Phase "Übergabe"  🔒    │   ← Source-Hint + Lock-Glyph
│                                            │
│  ── Status ───────────────────────         │
│  [● Aktiv  ▾]                              │   ← Badge-Dropdown
│                                            │
│  ── Beschreibung ────────────────          │
│  […vollständige Übergabe an Kunden…    ]   │   ← Textarea inline, 3 rows
│                                            │
│  ── Erfolgskriterien ────────────          │
│  […3 GO/NO-GO-Kriterien geprüft…       ]   │
│                                            │
│  ── Termin ──────────────────────          │
│  📅 31.07.2026   [Auto-Pull aus Phase ●]   │   ← Date-Picker + Source-Sync-Toggle
│                                            │
│  ── Teilziele ───────────────────          │
│  ⬜ keine                                  │   ← list, falls vorhanden + "+ Teilziel"-CTA
│                                            │
│  ── Status-Quick-Glance ─────────          │
│  ┌─────────────────────────────────────┐  │
│  │ 🟢 12 offene Pakete auf grünem Pfad │  │   ← GoalStatsCard
│  │ ⏱  ~ 24 PT geschätzt *               │  │   ← Class-3 masked
│  │ ⚠ 3 kritische Knoten                │  │
│  └─────────────────────────────────────┘  │
│                                            │
│  * Aufwand maskiert. Klartext anfordern →  │   ← ClassThreeFootnote (reuse ε.2)
│                                            │
│  ─────────────────────────────────         │
│  [Verwerfen]    [Löschen]   [Speichern]    │
└────────────────────────────────────────────┘
```

**Inline-Edit-Semantik:**

- Form ist immer im Edit-Mode (kein separater "Bearbeiten"-Button). Dirty-State erkannt via React-Hook-Form `isDirty`.
- "Speichern" enabled nur bei Dirty-State + Valid-Form. Click → `PATCH /api/projects/[id]/goals/[gid]`.
- "Verwerfen" enabled bei Dirty. Reset alle Felder auf Server-Snapshot.
- "Löschen" öffnet ConfirmDialog (AlertDialog) "Goal wirklich löschen? Wenn dieses Goal Teilziele hat, werden sie zu Top-Level-Goals." (Soft-Delete via `deleted_at`).

**DetachedGoalBadge** rendert oberhalb der Form als Inline-Alert wenn `source_phase_id_or_milestone_id` aufgelöst auf gelöschten Eintrag:

```
[⚠ Quell-Phase wurde gelöscht. Auto-Pull deaktiviert. Re-Linken oder neue Quelle wählen →]
```

#### Detail panel: GoalStatsCard

```
┌────────────────────────────────────────┐
│ 🟢 12 offene Pakete auf grünem Pfad   │  ← `is_on_green_path=true AND status≠done`
│ ⏱  ~ 24 PT geschätzt *                 │  ← Sum(remaining_effort_pt), masked
│ ⚠ 3 kritische Knoten                  │  ← `is_critical=true AND is_on_green_path=true`
│                                        │
│ [▾ Pakete anzeigen]                    │  ← Collapsible öffnet Liste
└────────────────────────────────────────┘
```

Klick "Pakete anzeigen" öffnet `Collapsible` mit kleiner Liste der Top-5-Open-Packages (truncated by name + status-icon). Click auf eine Zeile fokussiert den Knoten im Graph (`setFocusedNodeId`).

Class-3-Masking: `~ 24 PT geschätzt *` zeigt nur wenn `cost_clear_view=false`; im Klartext `~ 24 PT (3.000 €)`.

#### `GoalCreateDialog`

Modal Dialog `sm:max-w-md` (kleiner als ε.2 Swap-Dialog, weil schlanker Inhalt):

```
┌── Neues Ziel anlegen ──────────[×]──┐
│                                     │
│ Titel *                              │
│ [_____________________________  ]    │
│                                     │
│ Beschreibung (optional)             │
│ [_____________________________  ]    │
│ [                              ]    │
│                                     │
│ Erfolgskriterien (optional)         │
│ [_____________________________  ]    │
│                                     │
│ Quelle: Phase oder Meilenstein …    │  ← F-PROJ-65-22 Lock (s. unten)
│ [Suche oder auswählen…       ▾]     │  ← Combobox
│                                     │
│ Termin                              │
│ 📅 [Auto aus Quelle übernehmen ●]   │
│  oder manuell: [DD.MM.YYYY    ]    │
│                                     │
│ Parent-Ziel (optional)              │
│ [Top-Level                    ▾]    │
│                                     │
│ ────────────────────────────        │
│ [Abbrechen]              [Anlegen]  │
└─────────────────────────────────────┘
```

**Trigger:**

- Primary CTA "+ Ziel erstellen" in der Trajectory-Toolbar rechts (Card-Header-Action-Slot)
- Sekundär aus GoalDetailPanel "+ Teilziel anlegen" (preselected `parent_goal_id`)
- Sekundär aus Empty-State "Noch kein Ziel" → primary CTA im Center-Card-Empty (analog ε.1 EmptyState)

#### Insight/activity panel

Keine Activity-Sidebar in ε.3a. Audit-Trail-Surfacing kommt in ε.3b zusammen mit Plan-Mutate-Log.

### Interactions

| Verhalten | UX |
|---|---|
| **Quick create** | "+ Ziel erstellen" in Toolbar; Cmd+G Shortcut (deferred zu F-PROJ-65-14) |
| **Inline edit** | GoalDetailPanel-Form immer edit-mode; React-Hook-Form `isDirty` aktiviert Save |
| **Bulk actions** | Keine in ε.3a (Single-Goal-Edit primär) |
| **Drag/drop** | Keine in ε.3a (deferred zu ε.3b für Plan-Mutate via Drag) |
| **Keyboard** | `Enter` im Form-Field bewegt zum nächsten; `Cmd/Ctrl+Enter` speichert; `Esc` schließt Panel (mit ConfirmDiscard wenn dirty) |
| **Optimistic vs confirmed** | Confirmed — Save schreibt server-side, Refetch Snapshot, dann UI-Update |
| **Toast** | Sonner-Toast bei Save success "Ziel gespeichert" + bei Delete "Ziel gelöscht (Soft-Delete · 30 Tage wiederherstellbar)" + bei Class-3-Klartext-Request "Anfrage abgesendet" (deferred) |
| **Undo nach Delete** | Toast mit "Rückgängig"-Action für 30 s (re-set `deleted_at=NULL`); reuse Sonner-Action-Pattern aus PROJ-34 |
| **Auto-Pull-Toggle für Source-Date** | Toggle "Termin aus Quelle übernehmen" — wenn aktiv, Date-Picker disabled + zeigt Source-Date; sonst manuelles Override |

### States

- **Loading (Panel):** Skeleton-Form mit 4 grauen Input-Bars + skeleton-Stats-Card.
- **Loading (Stats):** Stats-Card zeigt `<Skeleton>` für die 3 Zahlen, GoalStatsCard-Container bleibt rendered.
- **Empty (kein Ziel im Projekt):** kein GoalNode im Graph; stattdessen am Pfadende ein dashed Pentagon-Outline mit "+ Ziel erstellen"-CTA-Glyph; Klick öffnet `GoalCreateDialog`.
- **Empty (Goal ohne Teilziele):** Sub-Section "⬜ keine Teilziele" + Inline-CTA "+ Teilziel anlegen".
- **Error:** Bei `PATCH` failure → Sonner-Toast "Speichern fehlgeschlagen: {message}" + Form bleibt dirty (kein Reset); bei `DELETE` failure → analog.
- **Permission denied (read-only project_viewer):** Form-Felder disabled mit Tooltip "Bearbeiten erfordert Projekt-Editor-Rolle"; Buttons hidden statt disabled (Discovery > friction).
- **Disabled module:** N/A — Goals sind kein optionales Modul; Tabelle existiert immer wenn ε.1 Backend live.
- **Stale data / conflict:** ε.3a hat noch keinen Optimistic-Lock (L18 ist für ε.3b). Bei Save zeigen wir Refetch-after-Write, kein 409-Handling. Akzeptiert für ε.3a; ε.3b adressiert das.
- **Mobile (375px):** Panel wird Full-Screen (shadcn Sheet default). Form-Felder stack vertikal. Stats-Card scrollt mit. DetailPanel-Close-Button oben rechts.
- **Tablet (768px):** Panel `sm:max-w-md` ~448px, Form unverändert.
- **Dense desktop (1440px):** unchanged; Panel bleibt 448px rechts.

### Closed forks

#### F-PROJ-65-21 — Goal-Form-Validation (LOCK)

| Feld | Required | Constraints |
|---|---|---|
| `title` | **Required** | min 3, max 200 chars; trim whitespace |
| `description` | optional | max 2000 chars; markdown rendered read-only later |
| `success_criteria` | optional | max 2000 chars; markdown rendered read-only later |
| `target_date` | optional | falls fehlend → fällt auf `projects.planned_end_date` zurück (server-side resolved) |
| `status` | required (default `draft`) | enum: `draft / active / achieved / abandoned` |
| `parent_goal_id` | optional | self-FK; UI rejects circular references client-side; server hat double-check |
| `source_phase_id` XOR `source_milestone_id` | optional, max 1 of 2 | UI radio "Phase / Milestone / kein Source" |
| `sort_order` | hidden | auto-managed via drag-to-reorder (deferred to F-PROJ-65-27 polish) |

Client-side validation via `zod` + `react-hook-form`. Server-side hat eigene Constraints (ε.1 Backend).

#### F-PROJ-65-22 — Source-Ref-Wizard UX (LOCK)

**Entscheidung:** **Combobox mit Section-Headern**, nicht zwei separate Pickers.

```
┌── Quelle: Phase oder Meilenstein ─┐
│ [⌕ Suche oder auswählen…       ]  │
├───────────────────────────────────┤
│ ── Phasen ────────                │
│   ○ Phase 1: Analyse              │
│   ● Phase 2: Realisierung         │   ← active
│   ○ Phase 3: Übergabe             │
│ ── Meilensteine ──                │
│   ○ M1: Konzept-Freigabe          │
│   ○ M2: UAT-Start                 │
│ ── Keine Quelle ──────            │
│   ○ kein Source-Ref               │
└───────────────────────────────────┘
```

**Begründung:** Single-Picker-Pattern verhindert User-Confusion ("Hab ich Phase oder Milestone gewählt?"). Section-Header trennen die beiden Typen visuell. "Keine Quelle"-Option ist eigene Bucket damit User explizit das ohne-Source-Goal anlegen kann.

Reuse: `Command` + `CommandGroup` + `CommandItem` aus shadcn (existing in PROJ-57 OrgUnitCombobox + PROJ-62 Org-Tree).

**Effekt der Auswahl:**

- Phase gewählt → Server befüllt `source_phase_id`, `target_date` defaultet auf `phase.planned_end_date` falls Auto-Pull-Toggle aktiv.
- Milestone gewählt → `source_milestone_id`, `target_date` defaultet auf `milestone.target_date`.
- "Keine Quelle" → beide Source-Felder bleiben `null`.

#### F-PROJ-65-23 — Multi-Goal-Display ≥3 Teilziele (LOCK)

**Entscheidung:** **Stack-vertikal mit Sub-Goal-Tree-Indentation**, max 3 Top-Level-Goals direkt rechts sichtbar im Graph, weitere kollabiert hinter `+N`-Counter.

```
                                  ┌──────────────┐
                                  │ ╲   Goal 1   │  ← Top-Level (active, glow)
   …Pfad endet hier…  ─ ─ ─ ─ ─ ►│  ╲           │
                                  └──────────────┘
                                  ┌──────────────┐
                                  │ ╲ Goal 2     │  ← Top-Level
                                  │  ╲ + 2       │  ← Indicator: hat 2 Teilziele
                                  └──────────────┘
                                  ┌──────────────┐
                                  │ ╲ Goal 3     │
                                  └──────────────┘
                                       +2 ↓
                                  (collapsed counter)
```

**Sub-Goal-Render:** Sub-Goals werden im 2D-Graph **nicht eigenständig** als Knoten rendered (würde Pfad-Layout zerstören). Sie erscheinen:

- Als Counter-Badge `+N` am Parent-Goal-Knoten (klein, unten-rechts)
- Im `GoalDetailPanel` als Inline-Tree (max 2 Ebenen tief, indent 12px) — Klick öffnet Sub-Goal-Panel.
- Im Stats-Card des Parent-Goals: "12 Pakete + 8 in Teilzielen" (additiv aggregiert).

**Begründung:** Ein Projekt mit 3+ Goals ist legitim (z.B. ERP mit Module-A/B/C). Sub-Goals als getrennte Knoten würden 9+ Goal-Knoten im Graph erzeugen → unleserlich. Counter-Badge + Detail-Panel-Tree halten Übersicht.

**Mobile:** Bei 375px nur 2 Top-Level-Goals direkt sichtbar + Counter. Bei 0 Goals: Empty-State-CTA in der Mitte (kein Pentagon-Outline).

### Dashboard And Rollups

| Surface | Rollup-Item |
|---|---|
| **Global dashboard** (PROJ-64) | Counter "N Projekte mit aktivem Ziel-Status `at_risk`" — falls Stats-Card zeigt `kritische Knoten > 0 AND target_date <= projects.planned_end_date - 14d`. Deferred zu PROJ-64-Erweiterung in eigenem Slice. |
| **Project room** (PROJ-7) | Goal-Stat-Pill in Project-Health-Section: "🟢 12 offene Pakete · Ziel `Modul-C v1.0` Aktiv". Deferred zu PROJ-56-Erweiterung in eigenem Slice. |
| **My Work/Inbox** (PROJ-64) | Bei Goal-Verantwortlichen: "{N} Goals dir zugewiesen" — deferred (Goal-Owner-Field nicht in ε.1 Schema). |
| **Alerts** | Bei `status='at_risk'` (deferred-Erkennung; ε.3a hat noch keinen Auto-Flag, manuell setzbar) → kein direkter Alert; nur visuell im Panel. |

### Frontend Handoff

#### Components (NEU in ε.3a)

| Komponente | Datei | Reuse |
|---|---|---|
| `GoalDetailPanel` | `src/components/projects/goals/goal-detail-panel.tsx` | shadcn `Sheet` + analog `stakeholder-detail-panel.tsx` |
| `GoalEditForm` (inline) | inside `goal-detail-panel.tsx` | `react-hook-form` + `zod` + shadcn `Form` |
| `GoalCreateDialog` | `src/components/projects/goals/goal-create-dialog.tsx` | shadcn `Dialog` |
| `GoalStatsCard` | inside `goal-detail-panel.tsx` | shadcn `Card` + `Collapsible` |
| `DetachedGoalBadge` | inside `goal-detail-panel.tsx` | shadcn `Alert` (variant inline) |
| `SourceRefCombobox` | `src/components/projects/goals/source-ref-combobox.tsx` | shadcn `Command` + `CommandGroup` |
| `GreenPathOverlay` (additive) | inline in `trajectory-graph-2d.tsx` | SVG additive layer |
| `GoalNodeRenderer` (existing pentagon, jetzt voll-funktional) | inline in `trajectory-graph-2d.tsx` | existing |

#### Existing reuse (no changes)

- `Class3Lock` + `ClassThreeFootnote` (ε.2 helpers)
- `Sheet`, `Dialog`, `AlertDialog` (shadcn)
- `Combobox` Pattern (PROJ-57 OrgUnitCombobox)
- `framer-motion` für Pulse (ε.1 reduced-motion-aware)
- `sonner` für Toasts (existing throughout)

#### Routes affected

- `/projects/[id]/graph?mode=trajectory` — keine Route-Änderung; GoalDetailPanel + GoalCreateDialog sind Slot-Komponenten in `TrajectoryGraphView`.

#### Data / API assumptions

- ε.1 Backend liefert bereits:
  - `GET /api/projects/[id]/goals` → `{ goals: ProjectGoal[] }`
  - `POST /api/projects/[id]/goals` (mit Title + optionale Source-Refs)
  - `PATCH /api/projects/[id]/goals/[gid]`
  - `DELETE /api/projects/[id]/goals/[gid]` (soft-delete)
- ε.3a Backend **erweitert nur den Aggregator** mit:
  - `attributes.is_on_green_path: boolean` pro Knoten (BFS rückwärts vom Goal entlang `depends_on` + `belongs_to`; Sidetracks excluded)
  - `attributes.remaining_effort_pt: number | null` pro work_item (für Stats-Aggregation; null wenn Class-3 masked)
- Snapshot wird re-fetcht nach Goal-CRUD-Operation (kein Optimistic-Update in ε.3a).

#### MVP acceptance criteria

1. **Goal-Knoten** rendert als Pentagon rechts im 2D-Pfad (existing). Bei `status='active'` → emerald-glow; bei `status='draft'` → muted; `achieved/abandoned` → strikethrough-style.
2. **Click auf Goal-Knoten** öffnet `GoalDetailPanel` (Sheet right `sm:max-w-md`) mit voll-funktionalem inline-Form.
3. **GoalEditForm** zeigt alle 6 Felder (title required, description, success_criteria, target_date, status, parent_goal_id) + SourceRefCombobox.
4. **Save** schreibt via `PATCH /goals/[gid]`, Toast, Snapshot-Refetch.
5. **Delete** öffnet ConfirmDialog, Soft-Delete, Toast mit 30s-Undo-Action.
6. **GoalStatsCard** zeigt 3 Zahlen: Open-Packages-Count, Estimated-Effort-PT (Class-3 masked), Critical-Nodes-Count. Collapsible "Pakete anzeigen" listet Top-5.
7. **DetachedGoalBadge** rendert wenn Source-Phase/Milestone gelöscht (L6 detected via Server-Snapshot).
8. **GreenPathOverlay** rendert Glow + Edge-Tint für `is_on_green_path=true` Knoten. Sidetrack-Knoten excluded.
9. **GoalCreateDialog** öffnet sich via Toolbar-CTA "+ Ziel erstellen" oder GoalDetailPanel "+ Teilziel anlegen". Save → Refetch + Panel öffnet sich für neues Goal.
10. **SourceRefCombobox** zeigt Phasen + Meilensteine + "Keine Quelle" mit Section-Headern.
11. **Auto-Pull-Toggle** für target_date funktioniert.
12. **Multi-Goal** rendert max 3 Top-Level sichtbar + `+N`-Counter; Counter-Click öffnet Goal-Liste-Sheet.
13. **Sub-Goals** als Tree im Parent-Panel (indent), nicht als eigene Graph-Knoten.
14. **Mobile (375px):** Panel + Dialog full-screen, Form vertikal.
15. **Read-only-User:** Form-Felder disabled, Buttons hidden, GoalCreateDialog-Trigger hidden.
16. **A11y:** Form mit aria-labels, Toast aria-live="polite", DetachedGoalBadge mit role="alert", Combobox keyboard-navigable.
17. **Bundle-Δ ≤ 7 KB gzipped** auf `/projects/[id]/graph` (innerhalb L9-Budget; ε.1+ε.2 schon ~26 KB).

#### Later (out of ε.3a)

- Goal-Owner-Feld + RBAC (Goal-Owner kann eigene Goals editieren) — eigene Mini-Story
- Goal-Order-Drag-and-Drop (`sort_order` reorderbar) — F-PROJ-65-27 polish
- Goal-History-Tab (Audit-Trail) — Teil ε.3b
- Auto-`status='achieved'` wenn alle Open-Packages done — eigene Mini-Story nach Pilot
- Goal-Targets/KPIs als numerische Werte (statt nur Erfolgskriterien-Text) — F-PROJ-65-28 eigener Slice
- Global-Dashboard-Rollup (PROJ-64-Erweiterung) — separater Slice
- Multi-Goal-Filter im Trajectory-Modus — ε.4-relevant

### Risks And Open Questions

- **R1 — Green-Path-Performance bei N>500 Knoten.** BFS server-side ist O(V+E); bei dichten Projekten kann das 50–100ms zusätzliche Aggregator-Latenz bedeuten. Acceptable für ε.3a-Pilot; bei Pain → Memoization pro Goal+Snapshot in `vercel:runtime-cache`.
- **R2 — Detached-Goal-State + Re-Linking.** Wenn Source-Phase gelöscht, kann User die Quelle re-linken — aber `target_date` bleibt eingefroren auf altem Wert (kein Auto-Update). Akzeptabel laut L6.
- **R3 — Multi-Goal-Overlap im 2D-Layout.** Bei 3+ Goals + Pfaden, die alle rechts enden, kollidieren Pentagon-Positionen visuell. Mitigation: `layout-engine` stacked sie vertikal mit 12px gap (siehe ε.1 trajectory-layout.ts). Visuell akzeptiert bis 3; ab 4 → Counter.
- **F-1 — Goal-Status-Auto-Flag.** Sollen wir `status='at_risk'` automatisch setzen wenn kritische Knoten > 0 AND target_date naht? **Empfehlung Designer:** ja, aber als Read-Only-Compute-Flag im Aggregator, nicht persistent in `project_goals` (Schema-Drift vermeiden).
- **F-2 — GoalCreateDialog "+ Teilziel"-Pre-Selection.** Wenn User aus Parent-Goal-Panel "+ Teilziel" klickt, sollte der Dialog mit `parent_goal_id` vorbelegt sein UND der Parent-Field in der Form locked sein? **Empfehlung Designer:** vorbelegt + sichtbar aber bearbeitbar (User kann sich umentscheiden vor Save).
- **F-3 — Class-3 Cost-Klartext in GoalStatsCard.** ε.2 hat `cost_clear_view=false` hardcoded; ε.3a übernimmt das. Stats-Card zeigt nur masked "PT" ohne €-Wert. **Bestätigt OK** bis L20 in ε.3b/ε.4 echt durchgeschaltet wird.

## Designer-Empfehlungen für /frontend + /backend

1. **/backend (parallel zu /frontend startbar):**
   - `aggregate.ts`-Erweiterung um `is_on_green_path` BFS (~50 LOC)
   - `aggregate.ts`-Erweiterung um `remaining_effort_pt` pro work_item (falls Schema-Feld existiert; sonst auf `null` defaulten)
   - Goal-CRUD-API ist schon live (ε.1 Backend) — keine API-Erweiterung nötig
   - Tests: vitest für BFS-Helper + Snapshot-Extension

2. **/frontend (parallel zu /backend startbar):**
   - `GoalDetailPanel` (~250 LOC) — analog `StakeholderDetailPanel`
   - `GoalCreateDialog` (~150 LOC) — analog `StakeholderSwapDialog` (modal-Pattern)
   - `SourceRefCombobox` (~80 LOC) — analog OrgUnit-Combobox
   - `GreenPathOverlay` inline in `trajectory-graph-2d.tsx` (~30 LOC SVG-Additionen)
   - Goal-Pentagon-Visual-Polish in `trajectory-graph-2d.tsx` (existing pentagon → emerald-active-glow)
   - Tests: vitest für Combobox-Filter, Playwright auth-gate für CRUD-Endpoints (existing)

Beide Slices touch unterschiedliche Files → kein Merge-Konflikt-Risiko. PR-Reihenfolge egal; Frontend kann mock-Snapshot zum Iterieren nutzen bis Backend mergt.

3. **/qa nach beiden Merges:**
   - 17 MVP-AC checkdown
   - F-PROJ-65-21/-22/-23 Visual-Review
   - Bundle-Δ-Messung
   - Green-Path-Algorithm-Korrektheits-Tests (Cycle-Knoten korrekt excluded? Sidetracks excluded?)
   - A11y-Audit (Combobox keyboard, Form-Toast aria-live)

---

**Designer brief complete.** Next steps: parallel `/frontend` für ε.3a UI + `/backend` für aggregator `is_on_green_path` + `remaining_effort_pt`. ε.3b (Plan-Mutate) wartet bis ε.3a-Pilot abgeschlossen und CIA-Review für L18/L19/L24/-25/-26 durch.
