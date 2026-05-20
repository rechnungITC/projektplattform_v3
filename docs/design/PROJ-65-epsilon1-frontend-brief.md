# PROJ-65 ε.1 Frontend — Designer Brief

> **Scope:** Schließt F-PROJ-65-8/9/10/11 + visuelle Spezifikation für GraphShell-Toolbar, 2D-Pfad-Renderer, Lane-Header, Knoten-Visuals, Cycle-Banner, Empty/Loading/Error/Mobile.
> **Vorausgesetzt:** Tech-Design PROJ-65 Section A + A.1 (L10–L14), Design-System `docs/design/design-system.md`, Dashboard-Referenz `docs/design/dashboards/project-dependencies.html`, ε.2-Brief in der Spec (Stakeholder-Marker).
> **Out of scope:** ε.2 Stakeholder-Marker (eigener Brief in Spec, deferred), ε.3 GoalDetailPanel + LivePropagation, ε.4 AIProposalDrawer (Placeholder in ε.1).

## Designer Brief: PROJ-65 ε.1 Trajectory Graph Frontend

### Goal

Dem Projektleiter den **Pfad eines Projekts vom Start zum Ziel** als methoden-adaptive Trajektorie zeigen — Wasserfall-Phasen oben, Scrum-Sprints unten, Sidetracks für Compliance und Budget. Risk/Decision/AI-Indikatoren ohne Pfad-Clutter. Hybrid-Projekte sehen beide Tracks gleichzeitig.

### Benchmark Fit

- **Jira Advanced Roadmaps:** Epic-Span-Bars über Sprint-Timeline, gestrichelt für noch nicht zugeordnete Stories. Übernehmen für Epic-Render.
- **ClickUp Timeline:** Lane-pro-Hierarchieebene, Sticky-Lane-Labels links. Übernehmen für Lane-Header-Layout.
- **monday.com Battery / Status-Pills:** kleine Status-Counter-Badges am Knoten. Übernehmen für Risk/Decision-Badges (statt eigener Knoten).
- **Local V3 template:** `docs/design/dashboards/project-dependencies.html` — dark-teal Canvas mit subtilem 32px-Grid, Critical-Path-Glow, kompakte 100×40-Knoten-Karten, Side-Panel rechts. Direkte Visual-Vorlage.

### Recommended View Strategy

- **Default:** Trajektorie-Modus, 2D-Render, Hybrid-Layout bei Mixed-Method. (Tenant-Setting `tenant_settings.graph_mode_default` kann auf `'relationship'` umstellen.)
- **Secondary:** 3D-Toggle (dynamic-import, L9-Bundle-Budget), Beziehungs-Modus (existing PROJ-58).
- **Saved views:** keine in ε.1. Filter-Preset bleibt session-state, kein Persist. (Deferred zu ε.3 oder eigenem Slice.)
- **Grouping/sorting:** durch Lane-Layout automatisch — Phase → Sprint → Cost → Compliance-Sidetracks. Topo-Sortierung innerhalb Lane via Layout-Engine (L14).

---

## F-PROJ-65-8 — Epic-Knoten-Platzierung (LOCK)

**Entscheidung:** Epic rendert in der **Sprint-Lane als Span-Bar über einer Sprint-Sub-Row** (Jira-Roadmap-Pattern).

```
Sprint-Lane (Sub-Rows):
  ┌── Epic-Row    ──[Epic 1 ══════════════]──[Epic 2 ════════]──
  └── Sprint-Row  ──[S1]──[S2]──[S3]──[S4]──[S5]──[S6]──
                                ↓ Stories in Sprints
```

**Begründung:**
- Epics spannen mehrere Sprints — können nicht als Punkt-Knoten in Sprint-Lane gezeigt werden.
- Phase-Lane vs. Sprint-Lane bleibt unverändert (L11). Epic-Row ist Sub-Row der Sprint-Lane, keine dritte Hauptlane.
- Wasserfall-only Projekte ohne Epics: Epic-Sub-Row nicht gerendert (auto-hidden).
- Hybrid-Projekte: Epic-Row erscheint nur wenn Snapshot Epics enthält.

**Visual-Treatment:**
- Höhe: 28px (kleiner als Standard-Knoten 40px, weil Span-Bar nicht Punkt-Knoten).
- Breite: variabel, vom ersten zum letzten Sprint mit Epic-Children.
- Hintergrund: `bg-surface-bright/60` (sub-tle), `border-1 border-dashed border-primary-container`.
- Label links innen: Icon `bookmark` + Epic-Title (truncate). Truncate-Tooltip auf Hover.
- Status-Stripe: 4px linker Rand in Epic-Status-Tone (Done=primary, InProgress=tertiary, Open=secondary).
- Klick: öffnet `NodeDetailPanel` mit Epic-Stats (Children-Count, Done-%, target Sprint).

**Stacking:** Bei überlappenden Epics (z.B. parallele Epics in gleicher Sprint-Range) → vertikales Stacking innerhalb Epic-Row (max 3 sichtbar, "+N" Counter).

---

## F-PROJ-65-9 — Risk/Decision-Badge-Visual (LOCK)

**Position am Knoten:** **Top-Right corner**, leicht über die Knoten-Border hinausragend (überlappend) — auffällig ohne den Knoten-Inhalt zu verdecken.

**Visual pro Badge:**

| Badge | Größe | Bg | Border | Icon/Counter | Tones |
|---|---|---|---|---|---|
| **Risk-Badge** | 16×16 px, rund | `bg-error-container` (high) / `bg-tertiary-container` (medium) / `bg-secondary-container` (low) | `border-1 border-on-error-container` etc. | weiße Zahl (Severity-Counter), font-label-sm | severity-driven |
| **Decision-Badge** | 16×16 px, rotated-square (Diamant) | `bg-primary-container` (pending) / `bg-surface-variant` (resolved) | `border-1 border-primary` / `border-outline-variant` | weiße Zahl (Open-Count), font-label-sm | state-driven |

**Cluster-Verhalten:**
- Beide Badges nebeneinander: Risk links, Decision rechts (alphabetical for screen readers).
- Wenn nur 1 Risk + 1 Decision: zwei Badges nebeneinander, ~32px gesamt.
- Wenn ≥2 von einer Sorte: Counter-Zahl > 1 (z.B. "3"), max-Count "9+".
- Wenn beide Sorten + Counter > 1: Tooltip mit Breakdown "3 Risiken (2 hoch, 1 mittel) · 2 Entscheidungen offen".

**Severity-Mapping (Risk):**
- High: `bg-error-container`, weißes "!"-Icon zusätzlich zum Counter (nur bei Single-Risk)
- Medium: `bg-tertiary-container`, kein Icon
- Low: `bg-secondary-container`, kein Icon
- Counter wird gerendert wenn ≥2 oder wenn Single-Risk High (für Aufmerksamkeit).

**Interaction:**
- Hover: Tooltip mit Summary-String (siehe oben).
- Click auf Badge: öffnet `NodeDetailPanel` mit pre-selected Tab (`Risks` oder `Decisions`).
- Keyboard: Badge ist nicht eigenständig fokussierbar — Knoten-Focus + `R`-Shortcut zeigt Risks, `D`-Shortcut zeigt Decisions im Panel.

**Edge case — Knoten zu klein für Badges:** Bei `kind=milestone` (28×28 Diamant) oder `kind=epic` (Span-Bar mit dünner Höhe) → Badges rechts neben dem Knoten statt überlappend (8px offset).

---

## F-PROJ-65-10 — AI-Recommendation-Badge (LOCK)

**Position am Knoten:** **Bottom-Right corner**, gegenüber Risk/Decision-Badges. Klare räumliche Trennung — User unterscheidet sofort "Risiko/Entscheidung am Knoten" (oben) vs. "AI hat Vorschlag" (unten).

**Visual:**
- Größe: 14×14 px (kleiner als Risk/Decision, weil sekundär).
- Form: Kreis.
- Bg: `bg-violet-500/20` (violet ist im Design-System nicht vergeben → reserviert für AI-Signale).
- Border: `border-1 border-violet-400`.
- Icon: `auto_awesome` (Material Symbol Sparkle), violet-300, 10px.
- Animation: 2s subtile Pulse (opacity 0.6 → 1.0 → 0.6), respektiert `prefers-reduced-motion` (statisch bei Reduced).

**Interaction:**
- Hover: Tooltip "1 KI-Vorschlag — Klick für Details" oder "N KI-Vorschläge".
- Click: öffnet **AIProposalDrawer** (ε.4-Komponente). In ε.1 ist Drawer ein Placeholder: zeigt "Vorschläge erscheinen in ε.4. Aktuell: {recommendation.title}".
- Counter: maximal 1 Badge pro Knoten in ε.1 (Vorschläge werden gruppiert dargestellt im Drawer). Counter nur wenn ≥2 → kleine Zahl rechts oben am Badge.

**Hover-State von Badge + Knoten:**
- Hover am Badge dimmt **nicht** den Rest des Pfades (Badge ist additiv, nicht Critical-Path-Filter).
- Hover am Knoten lässt Badge unverändert (keine Skalierung) — Badge ist Indikator, nicht Hauptaktion.

**Reduced-motion fallback:** Pulse-Animation entfällt; Badge erhält stattdessen leichten Glow (`shadow-[0_0_4px_rgba(167,139,250,0.4)]`).

---

## F-PROJ-65-11 — Cost-Sidetrack-Lane Empty-State (LOCK)

**Drei States:**

| State | Bedingung | Render |
|---|---|---|
| **A — Items present** | `cost_lane_items.length > 0` | Lane wie spezifiziert mit Budget-Knoten |
| **B — Module on, no items** | `budget_module_enabled=true` ∧ `cost_lane_items.length=0` | Lane sichtbar, Empty-State-Inline (siehe unten) |
| **C — Module off** | `budget_module_enabled=false` | Lane nicht gerendert (verborgen, keine Höhe) |

**State B — Inline Empty-State Visual:**

```
┌── Cost ──┬─────────────────────────────────────────────────────┐
│   💰     │  Noch keine Budget-Posten im Pfad                   │
│  Budget  │  [+ Budget-Posten anlegen → /projects/[id]/budget]  │
└──────────┴─────────────────────────────────────────────────────┘
```

- Lane-Höhe: 56px (statt typische 80px wenn Items vorhanden, kompakter).
- Lane-Header links: Icon `payments` + "Budget" Label.
- Empty-State-Container: `bg-surface-container-low/40`, `border-dashed border-outline-variant`.
- Text: `text-on-surface-variant font-body-sm`, "Noch keine Budget-Posten im Pfad".
- CTA: shadcn `Button` size=sm, variant=outline, Label "+ Budget-Posten anlegen", Link auf `/projects/[id]/budget`.
- Permission-Variant: User ohne `project_editor` → Empty-State-Text **ohne** CTA, nur Hint "Frage Projektleitung nach Budget-Anlage".

**State C — Visibility-Control:**

- `budget_module_enabled` kommt aus `tenants.modules` (existing PROJ-17 tenant settings). Wenn `budget` nicht in aktiven Modulen → Lane-Slot existiert nicht im Layout-Hint.
- Layout-Engine respektiert das automatisch; kein zusätzlicher Render-Check nötig.

---

## Broader ε.1 Frontend Visuals

### Layout

#### Header / Context bar

Reuse PROJ-58 — bestehende Breadcrumb (`Projects > [Projekt] > Graph`) und "Trajektorie"-Sub-Tab in Page-Header. Wenn Mode=Trajektorie wechselt, Breadcrumb-Crumb-Label ändert sich von "Graph" zu "Trajektorie" (URL bleibt `/graph`).

#### GraphShell Toolbar

Top-of-canvas Toolbar, sticky, h=48px, `bg-surface-container-highest`, `border-b border-outline-variant`:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [Beziehungen │ Trajektorie]   [2D │ 3D]   [Filter ▾]   [↻]    [+] 100% [−]      │
│   ←── Mode ──→               ←── Dim ──→  ← preset →  reload    ← zoom →         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Mode-Toggle (NEW):** shadcn `ToggleGroup`, 2 Items, Default-Active aus Resolution-Chain (URL → localStorage → tenant-default). Active: `bg-primary-container text-on-primary-container`. Inactive: `text-on-surface-variant hover:text-on-surface`.
- **DimensionToggle:** existing PROJ-58 pattern, hier nur in Trajektorie-Modus relevant (Beziehungs-Modus reused PROJ-58 mit eigenem 3D).
- **Filter-Dropdown:** in ε.1 NUR im Beziehungs-Modus aktiv. In Trajektorie-Modus deaktiviert mit Tooltip "Filter erscheinen in ε.3". (Designer-Forward: Trajektorie-Filter kommen mit ε.3-Live-Propagation.)
- **Reload-Button:** reuse PROJ-58.
- **Zoom-Controls:** in ε.1 OPTIONAL; falls knapp → deferred zu ε.3 (Layout-Engine setzt sinnvollen Default-Viewport).

Mobile (375px): Toolbar wird h=72px, zweizeilig. Mode-Toggle oben volle Breite, Dim+Filter+Reload unten kompakt.

#### Main work surface — 2D-Pfad-Renderer

Canvas-Region unter Toolbar, scrollbar in beide Richtungen:

- Hintergrund: identisch zum PROJ-58 Dependency-Dashboard — subtle 32px-Grid (`linear-gradient` 2% Weiß).
- Lane-Container: vertikale Stack, jede Lane h=Variable (Phase/Sprint min 80px, Sidetracks 64px, Epic-Sub-Row 36px).
- Lane-Header (left, sticky): 48px breit, `bg-surface-container border-r border-outline-variant`, vertikal: Icon (oben) + Lane-Name (mitte) + Item-Count (unten).
- Main lane content: SVG mit Knoten + Edges, links zeigt ProjectStartNode (kreisförmig, primary), rechts GoalNode (pentagon, primary mit Glow).

**Lane-Header Visuals:**

| Lane | Icon | Label | Bg-Color |
|---|---|---|---|
| Phase | `timeline` | "Phasen" | `surface-container` |
| Sprint (mit Epic-Sub-Row) | `flag` | "Sprints" | `surface-container` |
| Cost | `payments` | "Budget" | `surface-container/80` |
| Compliance (DSGVO) | `shield` | "DSGVO" | `surface-container/60` |
| Compliance (ISO27001) | `verified` | "ISO 27001" | `surface-container/60` |
| Compliance (Vergabe) | `gavel` | "Vergabe" | `surface-container/60` |
| Compliance (custom) | `label` | `lane.display_label` | `surface-container/60` |

**Knoten-Visuals (per kind):**

| Kind | Size | Shape | Bg | Border | Notes |
|---|---|---|---|---|---|
| `project_start` | 32×32 | Kreis | `bg-primary` | `border-2 border-primary-container` | Links fixiert, Pulse-Glow if `state=active` |
| `phase` | 120×40 | Rect rounded-md | `bg-surface-container` | `border-1 border-outline-variant` | Status-Stripe links 4px |
| `milestone` | 28×28 | Diamond | `bg-secondary-fixed` | `border-1 border-secondary` | Auf Phase-Lane zwischen Phasen |
| `sprint` | 96×40 | Rect rounded-md | `bg-surface-container` | `border-1 border-outline-variant` | Status-Stripe links 4px |
| `epic` | variable×28 | Rect rounded-sm Span-Bar | `bg-surface-bright/60` | `border-1 border-dashed border-primary-container` | Sub-Row über Sprint-Row |
| `work_item` story/task/bug | 88×36 | Rect rounded-md | `bg-surface-container-low` | `border-1 border-outline-variant` | kind-Badge color stripe links 3px |
| `work_item` (cycle-excluded) | — | — | gleich, aber `opacity-40` | dashed | Cycle-Banner zeigt Count |
| `goal` | 64×44 | Pentagon rechts-zeigend | `bg-primary-container` | `border-2 border-primary` | Rechts fixiert, Pulse-Glow if `state=active`, "Placeholder" Badge in ε.1 |
| `budget` (in Cost-Lane) | 80×32 | Rect rounded-sm | `bg-surface-container` (under-budget) / `bg-tertiary/10` (over-budget) | `border-1 border-outline-variant` / `border-tertiary` | Currency-Mini-Label "€" links innen |

**Critical-Path-Overlay (reuse PROJ-43):** Knoten mit `is_critical=true` bekommen:
- Outer ring `border-2 border-primary` mit `shadow-[0_0_12px_rgba(161,207,209,0.15)]` (analog PROJ-58 `project-dependencies.html`).
- Edges zwischen Critical-Path-Knoten: `stroke-primary stroke-3` mit Glow.
- Non-Critical-Knoten + -Edges bei aktiver Critical-Overlay-Toolbar-Toggle: `opacity-20` (gedimmt).

**Cycle-Banner (L5):** Sticky-Banner unter Toolbar, vor Canvas:

```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠  N zyklische Abhängigkeit(en) ausgeblendet · [Details]        │
└──────────────────────────────────────────────────────────────────┘
```

- `bg-error-container/20 border-l-4 border-error p-md`.
- Icon: `warning` `text-error`.
- Text: `text-on-surface font-body-sm`, "N zyklische Abhängigkeit(en) ausgeblendet".
- Link: "Details" → öffnet shadcn `Sheet` (Drawer) mit Cycle-Edge-Liste + Jump-CTA zu `/projects/[id]/dependencies`.

#### Detail panel (right side)

Reuse PROJ-58 `GraphDetailPanel` mit Erweiterungen:
- Bei Mode=Trajektorie + Knoten-Click: zeigt zusätzlich Tabs `Risks`, `Decisions`, `AI-Vorschläge` (klickbar wenn Badge-Counter > 0).
- Mobile (375px): Detail-Panel wird shadcn `Sheet` (Bottom-Sheet), nicht Side-Panel.

#### Insight / activity panel

Nicht in ε.1. Reserviert für ε.3 (LivePropagationToast) und ε.4 (AIProposalDrawer).

### Interactions

- **Quick create:** kein neuer Quick-Create in ε.1. Empty-State-CTAs verlinken auf existierende Create-Pages (`/phases/new`, `/sprints/new`, `/backlog`).
- **Inline edit:** keine inline-Edit auf Knoten in ε.1 (Trajektorie ist Read-View). Editieren via NodeDetailPanel "Open Task"-Button (deep-link auf existing Edit-Surface).
- **Bulk actions:** keine in ε.1.
- **Drag/drop:** keine in ε.1. Reserviert für ε.3 (Plan-Mutate). Cursor bleibt `default`, kein `grab`-Hint.
- **Keyboard shortcuts:**
  - `M` — toggle Mode (Beziehungen ↔ Trajektorie)
  - `D` — toggle Dimension (2D ↔ 3D)
  - `Tab` — fokussiert Knoten in topo-Reihenfolge (Lane-First, dann Position-X)
  - `Enter` / `Space` — öffnet Detail-Panel des fokussierten Knotens
  - `R` — bei aktivem Knoten: Detail-Panel öffnen mit Tab=Risks
  - `Esc` — schließt Detail-Panel
- **Feedback:**
  - Mode-Toggle: silent localStorage-write, kein Toast.
  - Reload: existing PROJ-58 spinner + Toast bei Error.
  - Cycle-Detected: einmaliger Toast on first-mount "N zyklische Abhängigkeiten ausgeblendet", danach nur noch Sticky-Banner.

### States

- **Loading:** Skeleton-Pfad — 3 graue Lane-Bars (h=80px), framer-motion Pulse (1.5s opacity 0.4 → 0.6 → 0.4), respektiert `prefers-reduced-motion`. Lane-Header-Icons sind statisch grau.
- **Empty (kein Phase/Sprint/Work-Item):** Center-Card in Canvas:
  - Icon: `route` `text-on-surface-variant` 48px.
  - Title h3: "Noch keine Trajektorie".
  - Body: "Füge Phasen, Sprints oder Work-Items hinzu, um den Projektpfad zu sehen."
  - Method-aware CTAs:
    - Wasserfall: Primary "Phase erstellen" → `/projects/[id]/phases/new`.
    - Scrum/SAFe: Primary "Sprint erstellen" → `/projects/[id]/sprints/new`.
    - Beide oder unklar: Primary "Phase erstellen" + Secondary "Sprint erstellen" + Tertiary "Backlog öffnen" → `/projects/[id]/backlog`.
- **Error:** Reuse PROJ-58 Error-Card-Pattern (Icon + Error-Message + Retry-Button).
- **Permission denied:** User ohne `project_viewer` → Page redirect via existing PROJ-1-Middleware (kein eigener State hier).
- **Read-only (kein `project_editor`):** Empty-State-CTAs werden Tooltips "Erfordert Editor-Rolle"; alle Detail-Panel-Edit-Buttons disabled.
- **3D-Fallback:** WebGL2 nicht verfügbar oder `prefers-reduced-motion` → Dim-Toggle 3D-Button disabled mit Tooltip "3D nicht verfügbar (WebGL2 erforderlich)" oder "Reduzierte Bewegung aktiviert"; auto-Switch auf 2D wie in PROJ-58.
- **Cycle-detected:** Cycle-Banner zusätzlich zu normaler Render.
- **Mobile (375px):**
  - Lane-Header: icon-only (32px breit), Label hidden.
  - Knoten: Work-Item 64×28, Phase 80×32, Epic 18px hoch.
  - Detail-Panel: shadcn `Sheet` Bottom-Drawer mit Drag-Indicator.
  - 3D-Toggle disabled (auto-2D).
  - Toolbar zweizeilig.
  - Cycle-Banner: icon-only + Count, Link "Details" wird Icon-Button.
- **Tablet (768px):** wie Desktop, Detail-Panel kollapsibel via Toggle-Button rechts oben.

### Dashboard And Rollups

- **Global dashboard (PROJ-64):** kein direkter Rollup in ε.1. Designer-Forward: ε.4 könnte AI-Vorschlag-Counter rollup `/dashboard` hinzufügen ("3 KI-Vorschläge in deinen Projekten").
- **Project room (PROJ-7):** Trajectory-Graph ist **eigene Surface** unter `/projects/[id]/graph`. Project-Room-Summary-Tab könnte später Mini-Preview einbinden (deferred zu ε.4 polish).
- **My Work / Inbox:** kein Eintrag in ε.1.
- **Alerts:** Cycle-Detected ist Inline-Banner, kein globaler Alert. Risk/Decision-Counter werden vom PROJ-64-Dashboard schon aggregiert; keine Doppelung.

### Frontend Handoff

#### Components (NEU in ε.1)

| Komponente | Datei | Reuse aus |
|---|---|---|
| `GraphShell` | `src/components/projects/graph-shell.tsx` | extracted from `project-graph-view.tsx` |
| `GraphModeToggle` | inline in GraphShell | shadcn `ToggleGroup` |
| `RelationshipGraphView` | `src/components/projects/relationship-graph-view.tsx` | extracted body of `project-graph-view.tsx` |
| `TrajectoryGraphView` | `src/components/projects/trajectory-graph-view.tsx` | NEW |
| `TrajectoryGraph2D` | `src/components/projects/trajectory-graph-2d.tsx` | NEW (SVG renderer) |
| `TrajectoryGraph3D` | `src/components/projects/trajectory-graph-3d.tsx` | NEW (dynamic-import) |
| `TrajectoryLaneHeader` | inline in `TrajectoryGraph2D` | NEW |
| `TrajectoryNode*` | inline in `TrajectoryGraph2D` (per-kind sub-components) | NEW |
| `RiskDecisionBadge` | `src/components/projects/trajectory-badges.tsx` | NEW |
| `AIRecommendationBadge` | `src/components/projects/trajectory-badges.tsx` | NEW |
| `CycleBanner` | `src/components/projects/trajectory-cycle-banner.tsx` | NEW |
| `TrajectoryEmptyState` | inline in `TrajectoryGraphView` | shadcn `Card` + `Button` |
| `AIProposalDrawerPlaceholder` | `src/components/projects/ai-proposal-drawer-placeholder.tsx` | NEW (ε.1 placeholder, full impl ε.4) |
| `layoutTrajectory` (lib) | `src/lib/project-graph/trajectory-layout.ts` | NEW (pure fn, L14) |

Existing components to reuse without changes:
- `Badge`, `Button`, `Card`, `Tooltip`, `ToggleGroup`, `Sheet`, `DropdownMenu` aus shadcn.
- `ProjectGraph3DCanvas` (PROJ-58) für 3D-Reuse (gleicher Snapshot, neue Projektion).
- `GraphDetailPanel` (PROJ-58) mit ε.1-Tab-Erweiterung.
- `isCriticalNode`, `GRAPH_TONE_COLOR`, `GRAPH_NODE_KIND_LABEL` aus `three-adapter.ts`.

#### Routes affected

- `/projects/[id]/graph` — page.tsx bleibt unverändert, ruft jetzt `GraphShell` statt `ProjectGraphView`.
- `project-graph-view.tsx` → wird zu Thin-Wrapper (Backwards-Compat for test imports) ODER deleted, je nach F-PROJ-65-12-Entscheidung.

#### Data / API assumptions

- `GET /api/projects/[id]/graph?include=trajectory` liefert erweiterten Snapshot mit:
  - existing PROJ-58 nodes/edges
  - `goals[]` (placeholder in ε.1, full ε.3)
  - `lanes[]` mit Compliance-Lane-Keys
  - `cost_lane_items[]` für Cost-Sidetrack
  - `layout_hints`: `{ method: string, hybrid: boolean, phases_order: string[], sprints_order: string[], epics_per_sprint: Record<sprint_id, epic_id[]>, budget_module_enabled: boolean }`
- Tenant-Setting `tenant_settings.graph_mode_default` über existing `useTenantSettings`-Hook (oder Server-Component-Prop).
- Critical-Path-Daten reused aus PROJ-43 via existing `is_critical`-Flag im Snapshot.

#### MVP acceptance criteria

1. **GraphModeToggle** sichtbar in Toolbar; Klick wechselt zwischen `RelationshipGraphView` und `TrajectoryGraphView`. State persistiert in `localStorage["pp-v3:graph-mode:<projectId>"]`. URL-Param `?mode=trajectory` überschreibt.
2. **TrajectoryGraph2D** rendert mindestens zwei Lanes (Phase + Sprint) für Hybrid-Projekt; nur Phase für Wasserfall-only; nur Sprint für Scrum-only.
3. **Epic-Sub-Row** rendert Epic-Span-Bars über Sprint-Row wenn Epics im Snapshot vorhanden.
4. **Risk/Decision-Badges** erscheinen am Knoten wenn `node.attributes.risk_count > 0` oder `decision_count > 0`. Click öffnet Detail-Panel mit Tab.
5. **AI-Recommendation-Badge** erscheint am Knoten wenn `node.attributes.ai_recommendation_count > 0`. Click öffnet `AIProposalDrawerPlaceholder`.
6. **Cost-Sidetrack-Lane** rendert State A/B/C nach Snapshot-Flags.
7. **Compliance-Sidetracks** rendern eine Lane pro `lanes[].key`, gefüllt mit Work-Items aus `lanes[].work_item_ids`.
8. **Cycle-Banner** sichtbar wenn Layout-Engine Cycles detektiert; Cycles aus dem Render ausgeschlossen; Click auf "Details" öffnet Sheet mit Cycle-Edges.
9. **Empty-State** rendert method-aware CTAs wenn Snapshot leer.
10. **Critical-Path-Overlay** reuses PROJ-43-Flag, rendert Glow + dimmed-non-Critical.
11. **3D-Toggle** lädt `TrajectoryGraph3D` via `next/dynamic`, Fallback auf 2D wenn WebGL2 fehlt oder reduced-motion.
12. **Bundle-Delta auf `/projects/[id]/graph`** ≤ 30 KB gzipped (L9-AC).
13. **Mobile (375px)** und **Tablet (768px)** Layouts wie spezifiziert.
14. **Keyboard-Shortcuts** M / D / Tab / Enter / R / Esc funktional.
15. **A11y:** SVG mit `role="img"` + aria-label, Knoten mit `role="button"` + aria-label inkl. Risk/Decision-Counter, WCAG-AA-Kontrast für alle Badges.

#### Later (out of ε.1)

- Filter im Trajektorie-Modus (deferred zu ε.3 mit Live-Propagation-Filter).
- Saved Views.
- Drag-to-resequence (ε.3).
- AIProposalDrawer-Vollausbau (ε.4).
- GoalNode-Vollausbau + GoalDetailPanel (ε.3).
- Stakeholder-Marker (ε.2, eigener Brief).
- Mini-Preview im Project-Room-Summary (ε.4 polish).
- Trajectory-PDF-Export (P3.2, deferred).

### Risks And Open Questions

- **R1 — Performance bei N>500 Knoten.** Sugiyama+Tarjan synchron im Main-Thread (L14) → bei großen Projekten könnte Layout >100ms dauern. **Mitigation:** Pilot-Monitoring; falls relevant → Web-Worker in eigenem Slice.
- **R2 — Epic-Span-Bar bei Cross-Sprint-Stories.** Wenn Epic Stories in nicht-konsekutiven Sprints hat (z.B. Sprint 1, 3, 5), wird die Span-Bar diese Sprints überspannen, was Sprint 2/4 visuell "kapseln" könnte. **Mitigation:** Span-Bar bleibt durchgehend (Sprint 1 bis 5); Designer akzeptiert das, Tooltip am Epic erklärt "Spans Sprints 1, 3, 5".
- **R3 — Badge-Overflow bei hoher Counter-Dichte.** Risk-Counter "9+" + Decision-Counter "9+" + AI-Badge an einem Knoten → drei Badges an winzigem Work-Item (88×36). **Mitigation:** Bei `size < 96×40` werden Badges nach rechts neben den Knoten gerendert (8px Offset).
- **R4 — Cost-Lane vs. PROJ-22 Multi-Currency.** Budget-Knoten zeigt "€"-Indikator — bei Multi-Currency-Projekten ggf. mehrere Symbole. **Mitigation:** ε.1 zeigt Tenant-Default-Währung; FX-Conversion deferred zu PROJ-22-Integration.
- **F1 — AIProposalDrawer-Placeholder-Inhalt.** In ε.1 zeigt der Drawer "Vorschläge erscheinen in ε.4." — soll er den Recommendation-Text aus dem Snapshot direkt zeigen, oder wirklich nur ein Stub? **Empfehlung:** Recommendation-Title + "Mehr Details kommen in ε.4" — gibt User sofort einen Mehrwert.
- **F2 — Tenant-Custom-Compliance-Lane-Order.** Wenn ein Tenant 5 custom Lanes hat — wie sortiert? **Empfehlung:** Reihenfolge aus `tenant_settings.trajectory_lanes[]` (L7); Fallback: alphabetisch.
- **F3 — `tenant_settings.graph_mode_default` Default-Wert.** Tech-Design sagt `'relationship'` (PROJ-58-Kontinuität). Designer-Empfehlung: für neue Tenants nach ε.1-Ship → `'trajectory'` (Pfad-Sicht ist die neue Default-Story). **Open für PM-Entscheidung.**
