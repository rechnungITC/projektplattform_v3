# PROJ-65 ε.2 — Designer Spec: Stakeholder-Marker am Trajectory-Pfadknoten + Stakeholder-Swap-Simulation

> Stand: 2026-05-18 · Designer-Pass laut CIA-Review J/P1.4 vorgezogen vor ε.2
> Scope-Lock: ε.2 = Marker + Detail-Panel + transient Swap-Dialog. KEIN Live-Propagation-Toast (ε.3), KEINE AI-Vorschläge (ε.4), KEINE GoalNode/Glow (ε.3).

## 0. Goal & User Context

Im Trajectory-Graph (PROJ-65 ε.1, 2D-Default + 3D-Toggle) hängt Verantwortung am Pfadknoten — nicht in einer abgesetzten Tabelle. Der Projektleiter muss:

1. **Sehen**: Wer trägt diesen Knoten? Mehrere Stakeholder? Einer davon kritisch?
2. **Drill-in**: Wer genau, in welcher Rolle, mit welcher (ggf. maskierten) Rate.
3. **Simulieren**: Was passiert, wenn ich diesen Stakeholder austausche? Kosten-, Zeit-, Risiko-Delta — transient, ohne Plan-Mutate.

Story 65-4 (Marker) + Story 65-6 (Swap-Sim) lösen genau diese drei Schritte ohne Surface-Wechsel.

## 1. Reference Pattern Fit

| Pattern | Reuse aus |
|---|---|
| Right-side Sheet als Drill-Down-Drawer | `src/components/stakeholders/profile/profile-edit-sheet.tsx` (PROJ-33 γ) — `Sheet side="right" sm:max-w-xl` |
| DecisionChip + ActionRow + cardError + Greyed-out-für-deleted | `src/components/stakeholders/communication/ai-review-sheet.tsx` (PROJ-34 γ.2) und `recommendation-card.tsx` (PROJ-34 ε.ε) |
| Kind-Badge-Farbpalette als Inspiration, NICHT 1:1 kopiert | `recommendation-card.tsx` `KIND_TONES` (blue/amber/red/emerald) |
| Confirm-Discard AlertDialog bei unsaved swap-selection | ai-review-sheet.tsx `confirmDiscard`-Pattern |
| Critical-Path Farb-Sprache | PROJ-43 — `tertiary`/`error` Tokens |
| Avatar-Stack pattern | Jira "Assignee Avatars" (max 3 + +N), monday.com "People Column", ClickUp Task-Card-Header |

Modern PM-Tool Benchmark: **Jira Roadmap** zeigt Assignee-Avatar an Epic-Bar (oben-rechts, 20 px); **monday.com Workload** zeigt Avatar-Stack im Cell mit Hover-Pop. Wir mappen das auf den Pfadknoten.

## 2. Information Architecture

Surface bleibt `/projects/[id]/graph?mode=trajectory`. ε.2 fügt **keine eigene Route hinzu** — alles ist In-Place-Slot:

```
TrajectoryGraphView
├── TrajectoryNode (existing ε.1)
│   ├── StakeholderMarker (NEU ε.2) ← oben-rechts-Zone des Knoten-Containers
│   └── CriticalPathOverlay (PROJ-43, ε.1) ← Knoten-Border (Ring)
└── Slot: rechte Sheet-Spalte
    ├── StakeholderDetailPanel (NEU ε.2)
    └── StakeholderSwapDialog (NEU ε.2, transient overlay über DetailPanel)
```

## 3. Designer-Decisions (Pflicht-Antworten)

### 3.1 Marker-Anchor am Pfadknoten

**Entscheidung**: Avatar-Stack-Zone **unten-rechts** des Knoten-Bodies, nicht oben-rechts.

**Begründung**:
- Oben-rechts ist im Trajectory-Graph für den **Critical-Path-Ring** (PROJ-43) und das **Sidetrack-Lane-Badge** (ε.1, "DSGVO"-Pill links-oben) belegt.
- Unten-rechts ist konsistent mit Jira Roadmap-Bars, Trello Card-Footer und unserem eigenen Work-Item-Kanban-Layout.
- Im 2D-Modus: Marker liegt visuell auf der Node-Border (overlap −8 px nach unten/rechts), so dass Stack auch bei kleinen Knoten (Mobile, dichter Layout) sichtbar bleibt.
- Im 3D-Modus: Marker wird als **Billboard-Sprite** in lokalem Node-Frame oben angebracht (3D-Knoten ist meist Sphäre/Card auf X/Y/Z, "oben rechts" am Bildschirm wäre ambig je Kamera). Billboard rotiert mit Kamera mit. Stack-Layout horizontal entlang des Node-Front-Vektors.

**Anchor-Zonen-Reservation (locked)**:

| Zone | Inhalt | Quelle |
|---|---|---|
| top-left | Sidetrack-Lane-Pill ("DSGVO") | ε.1 |
| top-right | Critical-Path-Ring (Border-Style) + Cycle-Hidden-Marker (L5) | ε.1/PROJ-43 |
| center | Title + WBS-Code | PROJ-36 |
| bottom-left | Status-Chip + Goal-Affinity-Glow-Indicator (in ε.3) | ε.1/ε.3 |
| **bottom-right** | **StakeholderMarker-Stack** | **ε.2** |

### 3.2 Multi-Marker-Stack-Verhalten

**Entscheidung**: Max 3 Avatars sichtbar (overlap −8 px), darüber `+N`-Counter als 4. Element. Mobile (≤ 640 px Knotenbreite): Max 2 Avatars + `+N`. Touch-Target je Marker **mindestens 32×32 px** (Avatar 24 px + 4 px Padding ringsum), Stack-Touch-Container ≥ 44 px Höhe (Apple HIG).

**Hover-Reveal**: Marker selbst immer sichtbar (keine Hover-Only-Visibility — Mobile/Touch hat kein Hover). Auf Hover (Desktop) erscheint Tooltip mit Name + Rolle. Auf Klick (überall) öffnet Detail-Panel.

**Counter-Click**: `+N` öffnet das **Detail-Panel im Modus "all assignees"** (Liste aller, statt eines einzigen). Konsistent mit Jira "+2 more"-Pattern.

### 3.3 Akzent-Sprache: critical / positive / kostenkritisch

Drei Akzent-Sprachen, kombinierbar pro Marker (z.B. „critical + kostenkritisch" = beides sichtbar):

| Akzent | Visual | Token | Quelle |
|---|---|---|---|
| **critical** (PROJ-35/43 critical-flag) | 2 px solid Ring um Avatar, plus kleines Warn-Icon (Material Symbols `priority_high`) unten-rechts am Avatar | `border-error` + `bg-error/10` | PROJ-43 `stakeholder.is_critical` |
| **positive** (PROJ-35 advocate / high cooperation) | 2 px solid Ring | `border-primary` (teal) | PROJ-35 sentiment_score > 0.5 |
| **kostenkritisch** (rate-flag aus PROJ-57 > Schwelle ODER overrate ohne Justification) | kleines Euro-/Coin-Glyph als Corner-Badge unten-links am Avatar; **niemals Zahl im Marker** (Class-3-safe) | `bg-tertiary/80 text-on-tertiary` | PROJ-57 `resource.is_cost_flagged` (Existierend) |
| **neutral** (Default) | 1 px Ring `border-outline-variant` | — | — |

**Stack-Reihenfolge**: kritisch links (zuerst sichtbar), neutral mittig, positiv rechts. `+N` zählt nur die unsichtbaren — also bei 5 Personen mit 1 critical, 1 cost-flagged, 3 neutral: zeigt 3 Avatars (critical, cost-flagged, neutral) + `+2`.

**Glow vs Ring vs Badge**: Glow (box-shadow blur) bewusst vermieden — frisst Performance bei 100+ Knoten in 3D und kollidiert mit ε.3 GoalAffinityGlow. Ring + Corner-Badge sind Stack-fest und Bundle-leicht.

### 3.4 Detail-Panel-Side

**Entscheidung**: **Right-side Sheet** (`Sheet side="right" sm:max-w-md`) — schmaler als profile-edit-sheet.tsx (xl) weil weniger Inhalt; großzügig genug für Avatar + Rolle + 1-2 Action-Buttons + Optional-Rate.

**Begründung**:
- Konsistent mit PROJ-33 `profile-edit-sheet.tsx` und PROJ-34 γ.2 `ai-review-sheet.tsx` (beide right-side).
- Slot-unten würde den Graph (Canvas) abdecken — bei Trajectory ist horizontaler Pfad gerade die Information, die der Nutzer dabei behalten will.
- Sheet ist non-modal: User kann am Graph weiter zoomen / pannen, während das Panel offen ist (CSS `pointer-events`: Sheet-Backdrop = `none`, nur Sheet selbst ist focus-trap).

**Reuse**: `Sheet` + `SheetHeader/Title/Description/Content/Footer` aus `src/components/ui/sheet.tsx` (shadcn primitive, bereits installiert).

### 3.5 Swap-Dialog-Layout

**Entscheidung**: **Modal Dialog**, nicht Sheet. Innerhalb von / über dem DetailPanel.

**Begründung**:
- Swap-Simulation ist eine fokussierte Entscheidung mit transient Side-Effects in der Vorschau — wir brauchen Focus-Lock + Backdrop-Dim, damit der User die Δ-Werte tatsächlich liest. Sheet ist non-modal und würde User-Klicks am Graph weiterlaufen lassen.
- `AlertDialog` von shadcn ist passend (analog Confirm-Discard-Pattern in `ai-review-sheet.tsx`) — wir nutzen aber `Dialog` (nicht AlertDialog) weil mehr Inhalt als 2-Zeilen-Bestätigung.
- Auf Mobile (< 640 px): Dialog wird automatisch full-screen (shadcn default mit `sm:max-w-2xl`). Das ist hier richtig — die Δ-Tabelle ist auf 375 px nicht in einem 50%-Sheet darstellbar.

**Layout (Desktop, 1440 px)**:

```
┌─────────────── Stakeholder wechseln ────────────────────┐
│ Knoten: "Lastenheft Modul C"                             │
│ Aktuell: 👤 A. Müller · Senior BA · 1.250 €/PT          │
│                                                          │
│ [ Suche Kandidaten: ⌕ ____________  ] [Sort ▾]          │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ ○  👤 B. Schulze · BA                                ││
│ │     Kosten-Δ: +mittel    Zeit-Δ: +1 Tag             ││ Class-3-masked
│ │     Risiko-Δ: ≈           Folge-Pakete: 3            ││
│ ├──────────────────────────────────────────────────────┤│
│ │ ●  👤 C. Lin · Senior BA                             ││ ← selected
│ │     Kosten-Δ: −4.000 €    Zeit-Δ: ≈                 ││ Class-3-open
│ │     Risiko-Δ: mittel→nied. Folge-Pakete: 5          ││
│ │     [▾ Folgepakete anzeigen]                         ││
│ └──────────────────────────────────────────────────────┘│
│ ────────────────────────────────────────────────────────│
│  [Abbrechen]              [Vorschau übernehmen] ← deakt.│
└──────────────────────────────────────────────────────────┘
```

**Sort-Optionen** (Default: erste Option):
1. **Match-Score absteigend** (Skill + Verfügbarkeit + Rolle) — Default
2. Kosten-Δ aufsteigend (günstigste zuerst — nur sichtbar wenn Class-3-Klartext erlaubt)
3. Zeit-Δ aufsteigend
4. Name A→Z

**Card-Felder** (dense, 4 Felder pro Card):
- Avatar + Name + Rolle (1 Zeile)
- Kosten-Δ / Zeit-Δ / Risiko-Δ / Folgepakete-Count (Grid 4-spaltig auf Desktop, 2×2 auf Mobile)
- Expandable: Folgepakete-Liste (chevron-down)

**Card-State**: `<RadioGroup>` Pattern — nur eine Auswahl gleichzeitig. Selected card hat `border-primary` Ring + Filled-Radio.

**Bestätigung-Button** ist deaktiviert solange keine Auswahl. Click "Vorschau übernehmen" → schließt Dialog **nicht** mutiert — er triggert in ε.3 später den Plan-Mutate-Toast. In ε.2 zeigt er ein Sonner-Toast `"Vorschau gespeichert — Übernahme folgt in ε.3"` und schließt sich. (Lock: ε.2-Scope = transient, kein Plan-Mutate. AC-7 von Story 65-6.)

### 3.6 Class-3-Masking-Übergänge

Permission heißt `project_settings.cost_clear_view_permission` (Tech Design Section B.4). Server prüft, UI rendert nur was Server liefert. Aber die UI muss **erklären**, warum maskiert:

**Maskiert (Default)**:
- Kosten-Δ zeigt `+geringer Aufwand` / `+mittlerer Aufwand` / `+höherer Aufwand` / `≈` / `−geringer Aufwand` etc.
- Detail-Panel zeigt Rate-Zeile als `1.x XX €/PT *` mit einem `*`-Footnote unten: `* Rate maskiert. Sichtbar mit "Kosten-Klartext"-Berechtigung.`
- Sort-Option "Kosten-Δ" verbirgt sich aus dem Dropdown (nicht greyed-out — komplett weg).

**Klartext (mit Permission)**:
- Konkrete € + Tages-Werte.
- Ohne Footnote, ohne `*`.
- Sort-Option "Kosten-Δ" verfügbar.

**Sichtbares Masking-Indicator** (immer, auch in Klartext):

- Detail-Panel-Header zeigt einen Lock-Glyph + Tooltip `Class-3-Daten — Sichtbarkeit gemäß Projektberechtigung`. Im Klartext-Modus wird der Lock geöffnet (Material Symbols `lock_open`), im Masked-Modus geschlossen (`lock`). User sieht direkt am Glyph, ob er gerade Class-3-Klartext sieht oder nicht.
- Reuse PROJ-34 γ.2 Banner-Pattern (`<Alert>` mit `ShieldAlert`-Icon) **nicht** hier — der gehört zu Provider-Fehlern, nicht zu Berechtigungs-Zuständen.

**Permission-Request-Flow**: Auf Tooltip-Click am Lock-Glyph (oder „Klartext anfordern"-Link unter der Footnote) öffnet sich ein zweites kleines Sheet/Dialog mit Text:

> „Klartext-Zugriff anfordern: Schreibe an deinen Projektleiter, dass du Class-3-Kosten sehen musst. (Diese Funktion ist NEXT — keine Mutation in ε.2.)"

In ε.2 ist das ein **inert tooltip** / static link zu `mailto:` mit prefilled body. Echter Request-Workflow ist `Later`-Item (F-G).

### 3.7 Mobile-Layout (375 px)

- **Marker auf Knoten**: Knoten-Body wird auf Mobile auf 80% Breite verkleinert. Stack zeigt nur 2 Avatars + `+N`. Touch-Target bleibt 32×32 pro Marker, Counter-Pill ist 32×24 (read-only, click-fähig).
- **DetailPanel**: Sheet wird automatisch full-screen (`w-full`), kein `sm:max-w-md`-Override. Inhalt scrollt vertikal. Close-Button oben-rechts (shadcn default).
- **SwapDialog**: Dialog wird full-screen (`max-w-[100vw] h-[100dvh]`). Kandidaten-Cards stack vertikal (Grid kollabiert zu 2×2 statt 4×1 — siehe Layout-Sketch). Footer mit Buttons sticky am unteren Rand.
- **Hover-Tooltips entfallen** auf Touch — alle relevanten Infos müssen entweder direkt im Stack-Glyph (Critical-Ring, Cost-Badge) oder in 1-Tap-distance (DetailPanel) sein. Bestätigt für 32×32 Targets.

### 3.8 Edge-States

Siehe Matrix Abschnitt D.

## 4. Komponenten-Liste (Section A)

```
StakeholderMarker                        // NEU — Pfadknoten-Slot bottom-right
├── AvatarStack                          // composition aus shadcn Avatar
│   ├── Avatar (shadcn)                  // 24 px, fallback = Initialen
│   ├── CriticalRing                     // <div> CSS-only Ring
│   ├── CostFlagBadge                    // <div> 12 px Corner-Badge mit "€"
│   └── PositiveRing                     // <div> CSS-only Ring
├── MoreCounter                          // <button> "+N"
└── Tooltip (shadcn)                     // Desktop-Hover-Name+Rolle

StakeholderDetailPanel                   // NEU — Right-Sheet (sm:max-w-md)
├── Sheet (shadcn) + SheetHeader + SheetTitle
├── ClassThreeLockGlyph                  // <span> lock | lock_open Material-Symbol
├── AssigneeRow (×n)                     // pro Stakeholder
│   ├── Avatar
│   ├── NameRoleBlock
│   ├── RateRow                          // mit Masking-* oder Klartext
│   └── UtilizationBar                   // optional, nur wenn Resource-Linking erkannt
├── ActionRow
│   └── Button "Stakeholder wechseln"    // → öffnet SwapDialog
└── SheetFooter mit "Schließen"

StakeholderSwapDialog                    // NEU — modal Dialog, transient
├── Dialog (shadcn) + DialogHeader + DialogTitle
├── CurrentAssigneeBar                   // 1 Zeile, der aktuelle Verantwortliche
├── SearchInput (shadcn Input)
├── SortDropdown (shadcn DropdownMenu)
├── CandidateList (RadioGroup, scrollable)
│   └── CandidateCard (×n)               // Card + Radio
│       ├── Avatar + Name + Rolle
│       ├── DeltaGrid                    // 4-Felder: Kosten/Zeit/Risiko/Folgepakete
│       ├── FollowupExpand               // Collapsible mit shadcn
│       └── ClassThreeLockGlyph (inline) // bei jedem Kosten-Δ-Feld
├── EmptyState                           // "Keine passenden Kandidaten"
└── DialogFooter
    ├── Button "Abbrechen" (variant=outline)
    └── Button "Vorschau übernehmen"
```

shadcn-Primitives komplett: `avatar`, `sheet`, `dialog`, `button`, `badge`, `input`, `dropdown-menu`, `radio-group`, `tooltip`, `card`, `collapsible`, `alert`. Alle bereits in `src/components/ui/` vorhanden (PROJ-33/34 reused diese alle).

## 5. Wireframes (Section B)

### B.1 StakeholderMarker am 2D-Knoten

```
┌──────────────────────────────────────────┐
│ ⚠ [WBS 2.3]                  [DSGVO]    │   ← top-left: sidetrack, top-right: critical-ring (border style)
│                                          │
│    Lastenheft Modul C                    │   ← title
│                                          │
│ ● in_progress                  ●○○  +2  │   ← bottom-left: status; bottom-right: stack
└──────────────────────────────────────────┘
                                  ↑
                                  Marker-Stack:
                                  ●  = critical (red ring + ! corner)
                                  ○  = positive (teal ring)
                                  ○  = neutral
                                  +2 = überlauf
```

### B.2 StakeholderMarker am 3D-Knoten (Billboard)

```
        (3D sphere/card node)
              ╱ ╲
             ╱   ╲
            │     │
            │     │  ← Body in 3D-Space
             ╲   ╱
              ╲ ╱
   ┌──────────────────────┐
   │ ●○○ +2               │   ← Billboard-Sprite, kamera-orientiert
   └──────────────────────┘
   (CSS3DRenderer overlay or react-three-fiber <Html> portal)
```

3D-Implementation: `<Html transform sprite>` aus `@react-three/drei` (bereits in PROJ-58 verwendet). Sprite-DOM = identisch zum 2D-Stack-Markup → 1 component, 2 surfaces.

### B.3 StakeholderDetailPanel (Desktop, 1440 px)

```
┌────── StakeholderDetailPanel ──────┐
│                              [×]   │
│  Lastenheft Modul C        🔒      │   ← Lock-Glyph rechts
│  WBS 2.3 · Phase Planung           │
│  ─────────────────────────────     │
│                                    │
│  Zuständig (3)                     │
│                                    │
│  👤 A. Müller  ⚠ critical          │
│     Senior BA                      │
│     1.x XX €/PT *                  │   ← masked
│     Auslastung: ▰▰▰▱▱ 60%         │
│                                    │
│  👤 B. Schulze                     │
│     BA                             │
│     1.x XX €/PT *                  │
│                                    │
│  👤 (deaktiviert)                  │   ← greyed-out, F-5 pattern
│     (Stakeholder nicht mehr        │
│      verfügbar)                    │
│                                    │
│  * Class-3 maskiert.               │
│    [Klartext anfordern →]          │
│  ─────────────────────────────     │
│                                    │
│  [⇄ Stakeholder wechseln]          │
│                                    │
└────────────────────────────────────┘
```

### B.4 StakeholderSwapDialog (Desktop)

Wireframe siehe Abschnitt 3.5 oben.

### B.5 StakeholderSwapDialog (Mobile, 375 px)

```
┌─ Stakeholder wechseln ──── [×] ─┐
│ Lastenheft Modul C              │
│ Aktuell: A. Müller · 1.x XX € * │
│                                 │
│ [⌕ Suche                     ]  │
│ [Sort: Match-Score        ▾  ]  │
│                                 │
│ ┌─────────────────────────────┐│
│ │ ○  B. Schulze · BA           ││
│ │ ─────────                    ││
│ │ Kosten-Δ │ +mittel  *        ││
│ │ Zeit-Δ   │ +1 Tag             ││
│ │ Risiko-Δ │ ≈                  ││
│ │ Folge    │ 3                  ││
│ │ [▾ Folgepakete]              ││
│ └─────────────────────────────┘│
│ ┌─────────────────────────────┐│
│ │ ●  C. Lin · Senior BA        ││ ← selected
│ │ ...                          ││
│ └─────────────────────────────┘│
│                                 │
│ ── (sticky footer) ──────────  │
│ [Abbrechen] [Vorschau übern.]  │
└─────────────────────────────────┘
```

## 6. Interaction Spec (Section C)

### Click-Pfade

1. **Marker-Click (Avatar)** → `StakeholderDetailPanel` öffnet mit `mode=single, focusStakeholderId=X` (Liste zeigt alle, der angeklickte ist Top).
2. **`+N`-Click** → `StakeholderDetailPanel` öffnet mit `mode=all`, ohne Focus, scroll-to-top.
3. **`Stakeholder wechseln`-Button im Panel** → `StakeholderSwapDialog` öffnet, Panel bleibt darunter im Hintergrund (sichtbar durch leichtes Backdrop-Dim).
4. **Kandidaten-RadioGroup-Klick** → Selection ändert sich, Vorschau-Button wird enabled.
5. **`Vorschau übernehmen`-Klick** → Sonner-Toast `"Stakeholder-Wechsel gespeichert (transient — Übernahme folgt in ε.3)"`. Dialog schließt. Panel bleibt offen. Marker-Glyph erhält **temporäres** Border-Style `border-dashed border-tertiary` für 3 s als Quittung (kein Persistent-State, ε.2 ist transient).
6. **`Abbrechen` oder Backdrop-Click** → Dialog schließt ohne Mutation. Wenn Selection != null und User klickt Backdrop: ConfirmDiscard analog ai-review-sheet.tsx Pattern.

### Keyboard Navigation

| Key | Aktion |
|---|---|
| `Tab` (im DetailPanel) | Sheet-FocusTrap (shadcn default), durch alle interactive Elemente |
| `Esc` | Schließt jeweils oberste Layer (zuerst Dialog, dann Panel) |
| `Enter` auf Marker | = Click, öffnet Panel |
| `Space` auf Counter | = Click, öffnet Panel `mode=all` |
| `↑`/`↓` in CandidateList | Bewegt RadioGroup-Selection (Native HTML radiogroup) |
| `Enter` in Dialog | Triggert "Vorschau übernehmen" wenn Selection != null |

### States & Übergänge

| State | Visual | Source |
|---|---|---|
| Marker idle | Ring + Avatar | Default |
| Marker hover (desktop) | Tooltip after 300 ms | shadcn Tooltip |
| Marker focus (keyboard) | 2 px outline `outline-primary` | a11y default |
| Marker after-swap-preview | dashed tertiary border 3 s | Quittung |
| Panel loading | Skeleton-rows (3 Stück) für AssigneeRow | shadcn Skeleton |
| Panel empty (Knoten ohne Assignees) | "Keiner zugewiesen — [Zuweisen]"-CTA | scope: Zuweisen-Action ist `Next` |
| Panel error (API fail) | `<Alert variant=destructive>` + Retry-Button | reuse PROJ-34 γ.2 pattern |
| Dialog loading candidates | Skeleton candidate cards (5) | shadcn |
| Dialog empty (keine Kandidaten) | "Keine passenden Kandidaten in diesem Tenant" + Link "[Stakeholder anlegen →]" | reuse PROJ-57 anlegen-Flow |
| Dialog API error | `<Alert>` + Retry-Button | |
| Dialog after preview-confirm | Dialog closes; Sonner toast (3 s); marker dashed for 3 s | s. oben |

### a11y-Anforderungen

- Marker hat `role="button"`, `aria-label={Name + Rolle + State}` (z.B. "A. Müller, Senior BA, kritisch").
- Stack-Counter hat `aria-label={`weitere ${N} Stakeholder anzeigen`}`.
- Critical-Ring + Cost-Badge sind **nicht alleinige Informationsträger** — Tooltip / aria-label tragen das textuell.
- Panel hat `aria-live="polite"` für Async-Loads.
- Lock-Glyph hat Tooltip `Class-3-Masking — gemäß Projektberechtigung` und ist `aria-label="Kostendaten maskiert"` / `"...sichtbar"`.
- Color-only-Coding vermieden (Critical-Ring + Icon, Positive-Ring + nichts-extra-aber-niemals-allein-Information).

## 7. Edge-State Matrix (Section D)

| Edge-Case | Verhalten | Pattern-Reuse |
|---|---|---|
| Stakeholder ohne Avatar (nur Name) | Initialen als `AvatarFallback` (shadcn) — 2 Buchstaben, deterministisch (Hash-Color aus Name in `secondary-container` Token) | shadcn `Avatar` |
| Stakeholder nur als Resource (kein User/MagicLink) | Avatar mit Resource-Icon (Material `engineering` o.ä.) statt Initialen; Name = Resource-Display-Name | PROJ-57 resource → stakeholder linking |
| Stakeholder soft-deleted zwischen Render und Klick | Greyed-out Card (opacity 50%, no actions); Label "(nicht mehr verfügbar)" | `ai-review-sheet.tsx` F-5 pattern (`stakeholderDeleted` prop) |
| Knoten ohne jeglichen Stakeholder | Kein Marker (nicht „leerer" Avatar). Panel-Open via Knoten-Klick zeigt Empty-State mit `Zuweisen`-CTA | s. State-Tabelle |
| Mehr als 99 Assignees am Knoten | `+99+`-Counter (text overflow protection). Edge-Case bewusst rough — sollte nie auftreten | — |
| Kandidaten-Liste leer (kein Match) | Empty-State Dialog: "Keine passenden Kandidaten in diesem Tenant" | s. State-Tabelle |
| Cost-Klartext-Permission ändert sich während Dialog offen | Panel + Dialog refetchen on Permission-Change-Event NICHT. Stattdessen: nächster Open zeigt neuen State (acceptable). | — (Now: nicht reaktiv) |
| Critical-Flag wechselt während Panel offen | Real-time bewusst nicht gefordert in ε.2 — Refresh on next open | — |
| User hat Read-only-Rechte am Projekt | `Stakeholder wechseln`-Button ist disabled mit Tooltip "Bearbeiten erfordert Projekt-Editor-Rolle" | reuse PROJ-4 RBAC pattern |
| Knoten ist Cycle-Edge-versteckt (L5) | Marker rendert nicht (Knoten ist Pfad-Teil aber nicht visualisiert) | L5-Lock |
| 3D-Modus, sehr enge Kamera-Stellung (Overlap mehrerer Marker) | LOD-Switch ab > 60 Knoten: nur kritische Marker rendern, alle anderen aggregieren als `+N` am Knoten-Pivot | Bundle/Perf (L9) |

## 8. Acceptance Criteria für Frontend-Handoff (Section E)

| ID | AC |
|---|---|
| **FE-1** | `StakeholderMarker` rendert am `TrajectoryNode` bottom-right Slot in 2D und als `<Html transform sprite>` Billboard in 3D. Max 3 Avatars + `+N` Desktop, max 2 + `+N` auf < 640 px Knoten. |
| **FE-2** | Avatar nutzt shadcn `Avatar` + `AvatarFallback` (Initialen, deterministische Background-Color). Critical-Ring: `border-2 border-error`. Positive-Ring: `border-2 border-primary`. Neutral: `border border-outline-variant`. Cost-Flag-Badge: 12×12 px Corner unten-links mit `€`-Glyph auf `bg-tertiary text-on-tertiary`. |
| **FE-3** | Stack-Reihenfolge: critical → cost-flagged → positive → neutral. `+N` zeigt nur überlaufende. |
| **FE-4** | Marker-Touch-Target ≥ 32×32 (Stack-Container ≥ 44 px Höhe). `aria-label` enthält Name + Rolle + Critical/Positive/Cost-Status textuell. |
| **FE-5** | Marker-Click öffnet `StakeholderDetailPanel` (`Sheet side="right" sm:max-w-md`). `+N`-Click öffnet selbes Panel im `mode=all`. |
| **FE-6** | Detail-Panel zeigt: Knoten-Title + WBS-Code, Lock-Glyph (`lock`/`lock_open` Material Symbol), Assignee-Rows mit Avatar + Name + Rolle + Rate (masked oder Klartext gem. Permission) + Auslastung (wenn Resource-Linking liefert), Footer-Button `Stakeholder wechseln`. |
| **FE-7** | Rate-Masking: ohne Klartext-Permission "Kosten-Δ" als Aggregat-Skala (geringer/mittlerer/höherer). Mit Permission: konkrete € + PT. UI rendert nur was Server liefert — keine clientseitige Maskierung. |
| **FE-8** | Class-3-Footnote: bei jedem maskierten Rate-Feld ein `*` Suffix + 1× Footnote im Panel-Body + 1× Footnote im Dialog-Body. Footnote enthält Link `Klartext anfordern →` (in ε.2 = `mailto:` mit prefilled body). |
| **FE-9** | `StakeholderSwapDialog` = shadcn `Dialog` (nicht Sheet), `sm:max-w-2xl`. Mobile (<640 px): full-screen. Mit FocusTrap + Backdrop-Dim. |
| **FE-10** | Dialog enthält: aktueller Assignee-Header, `Input` für Suche (debounced 300 ms), `DropdownMenu` für Sort (Default: Match-Score), `RadioGroup` mit Kandidaten-Cards. |
| **FE-11** | Kandidaten-Card: Avatar + Name + Rolle (1 Zeile), Delta-Grid 4-spaltig (Desktop) / 2×2 (Mobile) mit Kosten-Δ, Zeit-Δ, Risiko-Δ, Folgepakete-Count. Folgepakete-Expand via shadcn `Collapsible`. |
| **FE-12** | Sort-Option "Kosten-Δ" wird komplett ausgeblendet (nicht greyed-out) wenn keine Klartext-Permission. |
| **FE-13** | `Vorschau übernehmen` triggert Sonner-Toast `"Stakeholder-Wechsel gespeichert (transient — Übernahme folgt in ε.3)"` + Marker-Quittung (3 s dashed-tertiary). Dialog schließt. **Keine Plan-Mutation, keine Persistence in ε.2**. |
| **FE-14** | ConfirmDiscard AlertDialog wenn User Dialog schließen will mit Selection != null (analog PROJ-34 γ.2 `confirmDiscard`). |
| **FE-15** | Edge-State Greyed-Out: soft-deleted Stakeholder rendert als opacity-50, keine Actions, Label "(nicht mehr verfügbar)" (analog `ai-review-sheet.tsx` `stakeholderDeleted` prop). |
| **FE-16** | Empty-Panel (Knoten ohne Assignee): "Keiner zugewiesen — [Zuweisen]"-CTA. Zuweisen-Action ist im ε.2 ein TODO/disabled-Button mit Tooltip "Folgt in PROJ-57 Phase…" (Next-Item F-G). |
| **FE-17** | Keyboard: Esc schließt oberste Layer; Marker focus-able via Tab; `↑`/`↓` in CandidateList wechselt RadioGroup-Selection. |
| **FE-18** | a11y: `aria-label` an Marker und Counter. Color-Coding niemals alleinige Info-Quelle (zusätzlich Icon oder Text). Tooltip auf Lock-Glyph. |
| **FE-19** | Performance: Marker-Render bei 250 Knoten + Stack-of-3 darf 2D-Pan-Frame-Rate nicht unter 30 fps drücken (Stack ist CSS-only, kein JS-State pro Marker außer Click-Handler). In 3D: LOD-Switch ab > 60 sichtbaren Knoten. |
| **FE-20** | Bundle: ε.2-Delta auf `/projects/[id]/graph` Route ≤ 8 KB gzipped (innerhalb des L9-Budgets von 30 KB für gesamtes ε.1+ε.2+ε.3). Keine neuen npm-Dependencies. |

## 9. Now / Next / Later (Section F)

| Bucket | Item | Wert |
|---|---|---|
| **Now (ε.2)** | StakeholderMarker (Avatar-Stack + critical/positive/cost-flag Ringe + Counter) | Story 65-4 |
| **Now** | StakeholderDetailPanel (right Sheet) | Story 65-4 |
| **Now** | StakeholderSwapDialog (transient Vorschau) | Story 65-6 |
| **Now** | Class-3-Masking-UI (Lock-Glyph + Footnote + Sort-Hide) | AC 65-6-5 + L6 |
| **Now** | Greyed-out für soft-deleted Stakeholder | F-5 pattern reuse |
| **Next (ε.3)** | Marker-Quittung wird zu echter Plan-Mutate mit LivePropagationToast + Undo (30 s) | Story 65-7 |
| **Next** | "Klartext anfordern"-Workflow (echter In-App-Request statt mailto:) | Permission-Request-Flow |
| **Next** | "Stakeholder zuweisen" im Empty-Panel (Empty-Assignee-CTA) | depends on PROJ-57 UI |
| **Later** | Skill-Match-Score-Visualisierung in Kandidaten-Cards (Sparkline pro Skill-Dimension aus PROJ-33) | requires PROJ-33 Skill-API exposure pro Kandidat |
| **Later** | Bulk-Swap (mehrere Knoten gleichzeitig) | Selection-Mode am Graph (own slice) |
| **Later** | AI-Vorschlag des "besten" Kandidaten in CandidateList (Star-Glyph + Score) | ε.4 (Class-3-Ollama-only) |

## 10. Mobile / Tablet / Desktop Behavior (Section G)

| Viewport | StakeholderMarker | DetailPanel | SwapDialog |
|---|---|---|---|
| **375 px (mobile)** | 2 Avatars + `+N`, 32×32 Touch | Full-screen Sheet, vertikal scrollend | Full-screen Dialog, Delta-Grid 2×2, sticky-footer |
| **768 px (tablet)** | 3 Avatars + `+N`, 28×28 Avatar | `sm:max-w-md` Sheet (~448 px) | `sm:max-w-2xl` Dialog (~672 px), Delta-Grid 4-spaltig |
| **1440 px (desktop)** | 3 Avatars + `+N`, 24×24 Avatar | `sm:max-w-md` Sheet | `sm:max-w-2xl` Dialog |

Print-Theme (PROJ-51 ε.5): Marker rendert als Schwarz-Weiß-Stack mit Border = Critical-Pattern (gestrichelt). Lock-Glyph wird zu schwarzem Schloss. Dialog wird in Print-Output NICHT abgebildet — nur Panel (read-only).

## 11. Frontend-Handoff (Files / Components)

Erwartete Datei-Struktur (neu in ε.2):

```
src/components/projects/[id]/graph/trajectory/
├── stakeholder-marker.tsx           NEU — StakeholderMarker + AvatarStack
├── stakeholder-marker-3d.tsx        NEU — Billboard-Variante mit <Html> Wrapper
├── stakeholder-detail-panel.tsx     NEU — Right-Sheet
├── stakeholder-swap-dialog.tsx      NEU — Modal Dialog
├── stakeholder-swap-candidate-card.tsx  NEU — eine Card pro Kandidat
└── _shared/
    ├── class-three-lock.tsx         NEU — Lock-Glyph + Footnote
    └── cost-delta-formatter.ts      NEU — masked vs Klartext rendering
```

API-Endpunkte (Tech Design E):
- `GET /api/projects/[id]/graph` (existing) — Snapshot enthält `node.assignees[]` aus PROJ-57.
- `POST /api/projects/[id]/work-items/[wid]/stakeholder-swap-preview` (NEU laut Tech Design — wird in ε.2 erstmals konsumiert). Server liefert Δ-Werte je Kandidat + Class-3-masked-Flag.

Reuse von shadcn-Primitives in `src/components/ui/`: `avatar`, `sheet`, `dialog`, `alert-dialog`, `button`, `badge`, `input`, `radio-group`, `dropdown-menu`, `tooltip`, `card`, `collapsible`, `alert`, `skeleton`.

## 12. Open Questions / Risks

| # | Item | Owner | Phase |
|---|---|---|---|
| OQ-1 | Liefert `POST /stakeholder-swap-preview` Δ-Werte bereits als Aggregat-Strings (`mittel`) ODER reicht das Server als Zahl und UI rundet/aggregiert? **Empfehlung**: Server sendet immer Aggregat-Strings + (wenn Permission) Klartext-Zahlen separat. UI rendert nur was da ist. | /backend ε.2 | vor Implementation |
| OQ-2 | Wo wird `is_cost_flagged` an `resource` definiert (Schwellwert)? PROJ-57 Tenant-Setting oder pro Resource-Row? | /architecture | vor Implementation |
| OQ-3 | Soft-Delete-Detection: Snapshot enthält `node.assignees[].deleted_at` oder fehlt das Stakeholder im Lookup? Pattern aus γ.2 wäre Lookup-miss = deleted. | /backend ε.2 | vor Implementation |
| R-1 | Marker-Stack performance bei 250+ Knoten in 3D-Billboard-Modus: jeder `<Html>` rendert React-Subtree. Risk medium. Mitigation: LOD ab > 60 sichtbaren Knoten (FE-19). | /frontend | Impl. |
| R-2 | Permission-State sync: Wenn Tenant-Admin Permission ändert während User in DetailPanel, Stale-State. Akzeptiert in ε.2 (Refresh on next open). | — | accepted |

---

## 13. Summary für Frontend-Handoff

ε.2 implementiert **drei eng-gekoppelte UI-Komponenten** auf bestehender `/projects/[id]/graph?mode=trajectory` Surface:

1. `StakeholderMarker` — Avatar-Stack im bottom-right Slot des Trajectory-Knotens, mit critical/positive/cost-flagged Akzent-Ringen und `+N`-Counter. 2D + 3D-Billboard.
2. `StakeholderDetailPanel` — Right-Sheet (`sm:max-w-md`), zeigt Assignees mit Rate (Class-3-masked oder klar), Action-Button "Stakeholder wechseln". Reuse-Basis: `profile-edit-sheet.tsx`.
3. `StakeholderSwapDialog` — modal Dialog, RadioGroup-Kandidaten mit 4-Felder-Delta-Grid (Kosten/Zeit/Risiko/Folgepakete), Class-3-Masking via aggregierte Skala oder Klartext. Transient: triggert in ε.2 NUR Sonner-Toast + 3 s-Quittung, KEINE Plan-Mutation. Reuse-Basis: `ai-review-sheet.tsx` (ConfirmDiscard, Greyed-out für deleted, Lock-Glyph als neuer Class-3-Indicator).

Class-3-Masking ist **serverseitig durchgesetzt** (Risiko R9 in Spec); UI rendert nur Server-Felder + zeigt ein Lock-Glyph als sichtbaren State-Indicator. "Klartext anfordern" ist `Next`, in ε.2 nur `mailto:`.

Keine neuen npm-Dependencies. Bundle-Delta ≤ 8 KB gzipped. 20 FE-Acceptance-Criteria liefern eindeutige Build-Targets.

---

**Designer brief complete.** Next step: Run `/frontend features/PROJ-65-project-trajectory-graph-decision-steering.md` und nutze diese ε.2-Spec (Section E "FE-1 bis FE-20") als Implementation-Target. Anschließend Designer-Pass für ε.3 (Goal-Knoten + Live-Propagation-Toast + Multi-Goal-Display).
