# PROJ-51-α — Component-Impact-Matrix + Hardcoded-Color-Inventory + Migrations-Plan

> **α-Deliverable 2 von 2.** Begleitdokument zu `features/PROJ-51-modern-ui-ux-motion-system.md` und `docs/design/PROJ-51-alpha-ui-audit-tokens.md`. Kein Code-Change in α.

## 1. Component-Impact-Matrix

40 shadcn-Komponenten in `src/components/ui/`. Alle lesen Vars aus `globals.css`. Re-Skin-Wirkung im β-Slice ist daher **automatisch**, sobald die Token-Bridge steht.

### Tier 1 — Direkt CSS-Var-getrieben (auto-reskin in β, kein Code-Eingriff)

| Komponente | Genutzte Vars | Re-Skin-Risiko |
|---|---|---|
| `accordion.tsx` | `--border` | Niedrig |
| `alert.tsx` | `--background`, `--foreground`, `--destructive`, `--destructive-foreground` | Niedrig |
| `alert-dialog.tsx` | `--background`, `--foreground`, `--primary`, `--destructive` | Niedrig |
| `avatar.tsx` | `--muted` | Niedrig |
| `badge.tsx` | `--primary`, `--secondary`, `--destructive` (3 Varianten) | **Mittel** — Badge-Farben sind semantisch (Critical-Path, On-Track, Delayed) — semantische Token-Erweiterung in γ |
| `breadcrumb.tsx` | `--foreground`, `--muted-foreground` | Niedrig |
| `button.tsx` | `--primary`, `--secondary`, `--destructive`, `--accent`, `--ring`, `--background` (5 Varianten) | **Hoch** — wichtigste interaktive Komponente; Hover/Focus/Shadow neu in γ |
| `calendar.tsx` | `--accent`, `--primary`, `--muted-foreground` | Mittel — Date-Picker-Highlight |
| `card.tsx` | `--card`, `--card-foreground`, `--border` | **Hoch** — wichtigste Container-Komponente; in γ Hover-Lift |
| `checkbox.tsx` | `--primary`, `--primary-foreground`, `--ring` | Niedrig |
| `collapsible.tsx` | (kaum Style — Layout-only) | Niedrig |
| `command.tsx` | `--background`, `--foreground`, `--accent`, `--accent-foreground` | Mittel — Combobox / cmd-K |
| `dialog.tsx` | `--background`, `--foreground`, `--ring` | Mittel — Backdrop-Blur in γ |
| `dropdown-menu.tsx` | `--popover`, `--popover-foreground`, `--accent`, `--accent-foreground` | Mittel |
| `form.tsx` | `--destructive` (Error-State) | Niedrig |
| `input.tsx` | `--background`, `--ring`, `--border` | **Mittel** — Focus-Ring in γ |
| `label.tsx` | `--foreground` | Niedrig |
| `navigation-menu.tsx` | `--accent`, `--accent-foreground`, `--background` | Mittel — Header-Nav |
| `pagination.tsx` | `--primary`, `--accent` | Niedrig |
| `popover.tsx` | `--popover`, `--popover-foreground`, `--ring` | Mittel — Backdrop-Blur in γ |
| `progress.tsx` | `--primary`, `--primary-foreground`, `--secondary` | Niedrig |
| `radio-group.tsx` | `--primary`, `--ring` | Niedrig |
| `scroll-area.tsx` | `--border` | Niedrig |
| `select.tsx` | `--popover`, `--popover-foreground`, `--accent` | **Mittel** — Focus-Ring in γ |
| `separator.tsx` | `--border` | Niedrig |
| `sheet.tsx` | `--background`, `--foreground`, `--ring` | Mittel — Drawer mit AnimatePresence in δ |
| `sidebar.tsx` | `--sidebar-*` (8 Vars) | **Hoch** — globale Navigation; PROJ-23-Erbe; Re-Skin trifft jede Page |
| `skeleton.tsx` | `--muted` | Niedrig |
| `slider.tsx` | `--primary`, `--secondary` | Niedrig |
| `sonner.tsx` | (eigenes Theme via `theme={...}`-Prop) | **Mittel** — separate Toast-Theme-Konfiguration in γ |
| `switch.tsx` | `--primary`, `--input` | Niedrig |
| `table.tsx` | `--muted` (Header) | **Mittel** — Striped-Rows-Variante in γ (`bg-surface-container` für odd) |
| `tabs.tsx` | `--background`, `--muted`, `--primary` | Mittel |
| `textarea.tsx` | `--background`, `--ring`, `--border` | Mittel — Focus-Ring in γ |
| `toast.tsx` | `--background`, `--foreground`, `--destructive` | Niedrig (auf Sonner migriert) |
| `toaster.tsx` | (Container — kaum Style) | Niedrig |
| `toggle.tsx` | `--accent`, `--accent-foreground` | Niedrig |
| `toggle-group.tsx` | wie toggle | Niedrig |
| `tooltip.tsx` | `--popover`, `--popover-foreground` | Niedrig |
| `chart.tsx` (recharts-wrapper) | `--chart-1` ... `--chart-5` | **Hoch** — Chart-Farben fehlen in shadcn-Default-Dark-Teal-Token-Set; β muss `--chart-*` mappen |

### Tier 2 — Custom Components mit hardcoded Farben (manueller Eingriff in γ)

Siehe Sektion 2 (Hardcoded-Color-Inventory) für Liste.

## 2. Hardcoded-Color-Inventory

Suche: Hex-Werte (`#[0-9a-f]{6}`) + direkte Tailwind-Color-Classes (`text-emerald-700`, `bg-amber-100`, etc.) im `src/`-Tree, ohne Tests.

### 2.1 Hex-Konstanten (4 betroffene Dateien)

| Datei | Zeile | Wert | Bedeutung | Migrations-Pfad |
|---|---|---|---|---|
| `master-data/stakeholder-type-form-dialog.tsx` | 51, 72 | `#3b82f6` | Default-Color-Picker für Stakeholder-Type-Branding | **Bleibt** — User-Daten, kein Theme |
| `stakeholders/risk/risk-trend-sparkline.tsx` | 39-42 | `#10b981`, `#f59e0b`, `#f97316`, `#ef4444` | Risk-Stufen-Farben (green/yellow/orange/red) | γ: auf `--success`, `--tertiary`, `--warning`, `--destructive` Tokens migrieren |
| `stakeholders/risk/risk-trend-sparkline.tsx` | 130, 131, 177 | `#3b82f6` | Trendlinien-Farbe | γ: auf `--primary` (oder `--chart-1`) |
| `stakeholders/profile/profile-radar-chart.tsx` | 42 | `var(--color-brand-600, #3b82f6)` | Big5-Fremdwert-Farbe | β: bereits CSS-Var-fähig; nur Mapping `--color-brand-600` → `--primary` |
| `stakeholders/profile/profile-radar-chart.tsx` | 43 | `#10b981` | Big5-Selfwert-Farbe | γ: auf semantischen Token (`--chart-2` oder neuer `--self-assessment`) |
| `stakeholders/profile/profile-radar-chart.tsx` | 96 | `1px solid var(--color-border, #e2e8f0)` | Tooltip-Border | β: `--color-border` → `--border` |
| `settings/tenant/base-data-section.tsx` | 384 | `#2563EB` | Placeholder-Text in Tenant-Brand-Color-Input | **Bleibt** — UI-Hint |
| `settings/tenant/ai-providers/cost-cap-section.tsx` | 343, 351 | `#2563eb`, `#16a34a` | Chart-Linien (Cost-Trajectory) | γ: auf `--chart-1`, `--chart-2` |
| `reports/snapshot-header.tsx` | 24 | `#0f172a` | Default-Accent für PDF (PROJ-21 Print-CSS) | **Bleibt** — PROJ-21 Print-Pfad, separater Token-Layer (siehe Out-of-Scope) |
| `projects/stakeholders/stakeholder-matrix.tsx` | 72 | `#ffffff` | Fallback für Stakeholder-Type-Color | **Bleibt** — `tenants.branding`-Fallback |

**Summary:** 4 Dateien mit insgesamt ~10 Hex-Werten. 6 davon sind echte Theme-Farben → γ-Migration. 4 bleiben (User-Daten, PROJ-21-PDF-Pfad, UI-Hints).

### 2.2 Tailwind-Direct-Color-Classes (~26 Dateien, 105 Treffer)

| Datei (Top-15 nach Anzahl) | Treffer | Farben | Migrations-Pfad |
|---|---|---|---|
| `phases/gantt-view.tsx` | 8+ | `indigo-400`, `indigo-700`, `emerald-*` | γ: `--chart-*` + `--primary-container` |
| `work-items/work-item-kind-badge.tsx` | ~10 | `indigo-*`, `teal-*`, ... pro `kind` | γ: semantische Badge-Tokens (`--badge-epic`, `--badge-task`, ...) ODER `--chart-*` |
| `stakeholders/risk/risk-banner.tsx` | 4 | `emerald-100/800`, `amber-100/900`, `orange-100/900`, `red-100/900` | γ: `--risk-low/medium/high/critical` semantic-Tokens |
| `settings/tenant/risk-score/risk-score-preview.tsx` | 4 | wie risk-banner | γ: gleiche Risk-Tokens |
| `stakeholders/profile/profile-tab.tsx` | ~12 | `amber-*`, `blue-*`, `emerald-*` (Status, Tonality) | γ: per-Use-Case Token |
| `compliance/phase-compliance-warnings.tsx` | 5 | `amber-*` | γ: `--warning`/`--tertiary` |
| `compliance/work-item-compliance-section.tsx` | 1 | `emerald-600/400` | γ: `--success` |
| `vendors/vendor-evaluations-tab.tsx` | 2 | `emerald-*`, `amber-*` | γ: Status-Tokens |
| `phases/phase-status-badge.tsx` | 1 | `emerald-600` | γ: `--success` |
| `milestones/milestone-status-badge.tsx` | 1 | `emerald-600` | γ: `--success` |
| `phases/phases-timeline.tsx` | 1 | `emerald-600` | γ: `--success` |
| `settings/tenant/ai-providers/ai-providers-page-client.tsx` | 2 | `yellow-600`, `emerald-600/700` | γ: `--warning`, `--success` |
| `projects/risks/risk-matrix.tsx` | mehrere | Risk-Farben | γ: Risk-Tokens |
| `projects/risks/risk-table.tsx` | mehrere | wie risk-matrix | γ: Risk-Tokens |
| `projects/stakeholders/stakeholder-matrix.tsx` | mehrere | Tonality-Farben | γ: Stakeholder-Sentiment-Tokens |
| `projects/decisions/approval/*.tsx` (3 Dateien) | mehrere | Approval-Status-Farben | γ: Approval-Status-Tokens |
| `app/(app)/approvals/approvals-list-client.tsx` | mehrere | Approval-Status-Farben | γ |
| `app/approve/[token]/approve-form.tsx` | mehrere | Approval-Form-Status | γ |
| `app/self-assessment/[token]/...` (2) | mehrere | Form-Status | γ |
| `budget/format.ts` | mehrere | Budget-Status-Farben | γ: Budget-Tokens |
| `budget/project-budget-tab-client.tsx` | mehrere | wie format.ts | γ |
| `projects/communication/outbox-panel.tsx` | mehrere | Send-Status-Farben | γ |
| `projects/lifecycle-badge.tsx` | mehrere | Lifecycle-Status-Farben | γ: Lifecycle-Tokens |
| `projects/open-items/open-items-panel.tsx` | mehrere | Status-Farben | γ |
| `projects/stakeholders/stakeholder-table.tsx` | mehrere | wie stakeholder-matrix | γ |
| `projects/stakeholder-health/stakeholder-health-page-client.tsx` | mehrere | Health-Status-Farben | γ: Stakeholder-Health-Tokens |
| `projects/ai-proposals/suggestion-card.tsx` | wenige | KI-Status | γ |
| `projects/decisions/decision-form.tsx` | wenige | Form-Status | γ |

**Summary:** 105 Treffer, ~26 Dateien. Schwerpunkte: **Status-Badges** (Risk, Approval, Lifecycle, Health) + **Charts** (Gantt, Risk-Matrix, AI-Cost). γ-Migration läuft pro Domäne (Risk, Approval, Health, ...) mit dedizierten semantischen Tokens.

### 2.3 Weitere Token-Quellen identifiziert

- `next-themes`-Integration (in `app/layout.tsx`?) — prüfen ob Dark/Light-Toggle aktiv ist und `next-themes` für Light-Mode-Deferral verwendet werden kann
- `theme.tsx` / `theme-provider.tsx` — Theme-Provider-Wrapper, falls vorhanden
- Alle `@/components/ui/chart.tsx`-Konsumenten — recharts-Theme-Wiring

## 3. View-Transitions-API-Compat-Tabelle (Stand 2026-05)

| Browser | Status | API | Notiz |
|---|---|---|---|
| Chrome / Edge ≥ 111 | **Stable** | `document.startViewTransition` | Same-document Transitions ✓ |
| Chrome / Edge ≥ 126 | **Stable** | Cross-document Transitions | Multi-page-App-Modus ✓ |
| Safari ≥ 18 | **Stable** | `document.startViewTransition` (same-doc only) | Cross-doc noch in Beta |
| Firefox ≥ 124 | **Beta-Flag** | hinter `dom.viewTransitions.enabled` | Stable expected 2026-Q3 |
| Mobile Safari iOS 17.4+ | **Stable** | same-doc | wie Desktop |
| Chrome Android ≥ 111 | **Stable** | wie Desktop | |
| Next.js 16 App Router | **experimental** | `unstable_ViewTransition`-Wrapper | API-Naming kann sich ändern; alternative: Web-API direkt mit Feature-Detection |

### Empfehlung für δ
1. **Feature-Detection** via `if ("startViewTransition" in document)` — Kern-Patterns
2. **Opt-In pro Route** — `view-transition-name` CSS nur auf Project-Room-Tabs, Stakeholder-Detail, Phase-Drawer
3. **Fallback** auf Framer-`AnimatePresence` für Browser ohne API-Support
4. **Negativ-Liste verbindlich:** Gantt (DnD-konflikt), Kanban-Board, PDF-Render

### Offene Architektur-Frage für δ-Slice-Start
- Next.js-`unstable_ViewTransition`-API-Status zum Zeitpunkt von δ prüfen — bei Stagnation oder Breaking-Change Web-API direkt nutzen

## 4. Migrations-Plan β → ε

### β-Slice — Token-Bridge + Branding

**Files (4):**
- `src/app/globals.css` — komplette Re-definition der `:root`-Vars auf Dark-Teal-HSL + Material-3-Erweiterungen + `--brand-*`-Slots; Dark-Block obsolet (Dark = Default)
- `tailwind.config.ts` — Hex-Werte raus, alle Tokens auf `hsl(var(--…))`, Spacing-Scale + fontSize-Tokens ergänzen
- `src/app/layout.tsx` — Server-Component-Inline-`<style data-tenant-brand>` lädt Tenant-Brand
- `src/lib/branding/contrast.ts` (NEU) — WCAG-1.4-Helper für Auto-Foreground

**Risiko:** Token-Remap betrifft alle 40 shadcn-Primitives. Pre-Deploy-Smoke (visuelle Inspektion + Lighthouse-Kontrast) auf Login + Stammdaten + Project-Liste + Project-Room.

**Rollback:** `git revert` der 4 Files. Keine DB-Änderung.

**Aufwand:** ~1 PT inkl. Smoke.

### γ-Slice — Component-Refresh

**Files:** Komponenten aus Tier-1-Hoch + Tier-2-Hardcoded (siehe oben)

**Reihenfolge (priorisiert):**
1. `button.tsx` — Hover/Focus/Active-Microinteractions
2. `card.tsx` — Hover-Lift
3. `badge.tsx` — neue semantische Varianten + 4 Risk-Tokens (`--risk-low/medium/high/critical`)
4. Status-Badges-Konsolidierung (`risk-banner`, `risk-score-preview`, `phase-status-badge`, `milestone-status-badge`, `lifecycle-badge`) auf neue Tokens
5. `input.tsx` / `select.tsx` / `textarea.tsx` — Focus-Ring
6. `dialog.tsx` / `sheet.tsx` / `popover.tsx` — Backdrop-Blur
7. Charts (`risk-trend-sparkline`, `cost-cap-section`, `gantt-view`, `profile-radar-chart`) — Hex/Tailwind → `--chart-*`-Tokens
8. `sidebar.tsx` — Hover-State + Active-Nav-Indikator (zieht `--brand-nav-active`)

**Risiko:** Status-Badge-Konsolidierung muss konsistente semantische Tokens etablieren — `--risk-low` muss überall gleich aussehen. Definition of done = visuelle Inspektion + Lighthouse-Kontrast auf 5 Schlüssel-Pages.

**Rollback:** Pro Komponente einzeln revertierbar (keine SQL).

**Aufwand:** ~1 PT.

### δ-Slice — Motion-Layer

**Files:**
- `src/app/layout.tsx` — `<MotionConfig reducedMotion="user">`-Provider
- `src/components/ui/dialog.tsx`, `sheet.tsx`, `popover.tsx` — `<AnimatePresence>`-Wrapper
- `src/components/ui/sonner.tsx` — Toast-Theme-Anpassung (Sonner hat eigene Slide-In)
- `src/lib/motion/use-view-transition.ts` (NEU) — Feature-Detection-Hook
- Selektive Pages mit `view-transition-name` CSS-Attribute (Project-Room-Tabs, Stakeholder-Detail-Open, Phase-Drawer)

**Dependency:** `framer-motion` (~30 KB tree-shaked) — `npm install framer-motion`

**Risiko:** Bundle-Size-Anstieg. Pre-Deploy-Bundle-Audit per `next build` Output.

**Rollback:** Framer-Imports + `<MotionConfig>` weg, `view-transition-name` aus CSS löschen.

**Aufwand:** ~1 PT.

### ε-Slice — Validierung + Visual-Regression

**Files:**
- `tests/visual-regression/` (NEU) — 8 Playwright-Snapshot-Tests
- `tests/__screenshots__/` (NEU) — Snapshot-Baselines im Repo

**Test-Targets (8):**
1. `/login`
2. `/projects` (Project-Liste)
3. `/projects/[id]` (Project-Room — Scrum-Variante)
4. `/projects/[id]` (Project-Room — Waterfall-Variante)
5. `/projects/[id]` (Project-Room — Kanban-Variante)
6. `/projects/[id]/stakeholders/[sid]` (Stakeholder-Detail)
7. `/settings/tenant` (Settings + Tenant-Branding)
8. `/projects/[id]/snapshots/[sid]/print` (PDF-Preview)

**Anti-Flake:** `maxDiffPixelRatio: 0.01` + Test-Tenant mit fixen Seeds (Date.now() → mock).

**CI-Trigger:** Pflicht bei Änderung in `src/components/ui/`, `src/app/globals.css`, `tailwind.config.ts`.

**Rollback:** Tests sind Quality-Gate — kein direkter Rollback nötig; bei Failure entweder Fix-Forward oder β/γ/δ-Revert.

**Aufwand:** ~1 PT inkl. CI-Wiring.

## 5. Open Decisions vor β-Start

| Frage | Default-Empfehlung | Confirm vor β? |
|---|---|---|
| Light-Mode in PROJ-51 oder PROJ-53? | **deferred zu PROJ-53** | Ja, User explizit OK |
| Welcher WCAG-Helper für Auto-Foreground? | **WCAG-1.4** (etabliert), APCA-Fallback in β.2 | Nein, Default |
| `next-themes` weiter verwenden oder rauswerfen? | **Beibehalten** für späteren Light-Toggle | Nein, Default |
| Charts: `--chart-1..5` neu definieren oder `--primary`/`--secondary` recyceln? | **`--chart-1..5` neu, semantisch** (Mat3-Tertiary für Warnings) | Nein, Default |
| `tenants.branding.primary_hex` Datenformat? | `#RRGGBB` (6-digit Hex), Server-Side validiert | Nein, Default |

## 6. Definition of Done — α

- [x] Token-Diff-Tabelle vollständig (`PROJ-51-alpha-ui-audit-tokens.md`)
- [x] Component-Impact-Matrix für 40 shadcn-Primitives (Tier 1)
- [x] Hardcoded-Color-Inventory (Hex + Tailwind-Direct), 26 Files / 105 Treffer
- [x] View-Transitions-Compat-Tabelle (2026-05 Stand)
- [x] Migrations-Plan β → ε mit Files / Risiken / Rollback / Aufwand pro Slice
- [x] Open-Decisions-Liste mit Default-Empfehlungen

α-Slice damit dokumentations-vollständig. Ready für β-Start.
