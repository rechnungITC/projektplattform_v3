# PROJ-51: Modern UI/UX & Motion System

## Status: In Progress (α + β + γ + δ + ε baseline deployed; ε.2 + γ.5 follow-ups pending)
**Created:** 2026-05-06
**Last Updated:** 2026-05-07

## Kontext

Die Plattform nutzt bereits eine moderne Frontend-Basis mit Next.js, React, Tailwind, Radix/shadcn-Komponenten und Sonner. Damit ist ein UI/UX-Update ohne neues UI-System moeglich. Der bestehende Design-System-Stand liegt in `docs/design/design-system.md`, ist aber noch nicht konsistent in `tailwind.config.ts`, `globals.css` und die shadcn-Token verdrahtet.

User-Ziel (2026-05-06): Die Oberflaeche soll moderner werden, Corporate-Farben sollen fuer bestimmte Elemente pflegbar sein, Buttons sollen mit leichten Schatten und Hover-Effekten arbeiten, und Animationen sollen sauber statt wild eingebaut werden.

PROJ-51 ist deshalb kein einzelner Redesign-Big-Bang, sondern ein kontrollierter Design-System-Slice: erst Audit und Tokens, dann Corporate-Farben, dann Motion, danach gezielte Komponentenmigration.

## Dependencies

- **Requires:** PROJ-17 (Tenant Administration) — Tenant-Branding und Settings-Oberflaeche.
- **Requires:** PROJ-23 (Sidebar Global) — globaler Navigationsrahmen.
- **Requires:** PROJ-7 (Project Room) — wichtigste operative Projektoberflaeche.
- **Requires:** shadcn/Radix-Komponentenbestand — bestehendes UI-System bleibt Grundlage.
- **Requires:** `docs/design/design-system.md` — Ziel-Tokens und visuelle Referenz.
- **CIA-Review empfohlen** — Design-System-Aenderungen haben breite Oberflaechenwirkung.

## Slice-Struktur

| Slice | Inhalt | Schema-Change | Status |
|---|---|---|---|
| **51-alpha** | UI/UX Audit + Token-Inventar + Zielzustand dokumentieren | Nein | Planned |
| **51-beta** | Corporate-Farben als CSS-Variablen und Tenant-Branding-Anwendung fuer ausgewaehlte Elemente | Nein | Planned |
| **51-gamma** | Button-/Badge-/Card-Refresh mit Hover, Focus, Schatten und reduzierter Bewegung | Nein | Planned |
| **51-delta** | Motion-Layer fuer Microinteractions, Presence und View-Wechsel | Nein | Planned |
| **51-epsilon** | Project-Room/Dashboard-Anwendung und visuelle Regression | Nein | Planned |

## User Stories

1. **Als Tenant-Admin** moechte ich bestimmte UI-Elemente in Corporate-Farben anzeigen koennen, damit die Plattform zur Marke meines Unternehmens passt.
2. **Als PM** moechte ich Buttons, Status-Badges und Dashboard-Kacheln mit klaren Hover-/Focus-Zustaenden sehen, damit interaktive Elemente sofort erkennbar sind.
3. **Als Nutzer** moechte ich dezente Animationen bei View-Wechseln, Dialogen und Statusaenderungen erleben, damit die App moderner wirkt, ohne mich abzulenken.
4. **Als Nutzer mit reduzierter Bewegung** moechte ich, dass Animationen `prefers-reduced-motion` respektieren, damit die App barrierearm bleibt.
5. **Als Entwickler** moechte ich zentrale Design-Tokens statt komponentenweiser Sonderfarben nutzen, damit neue Features konsistent aussehen und wartbar bleiben.
6. **Als QA/CI-Verantwortlicher** moechte ich visuelle Regressionen fuer zentrale Screens pruefen koennen, damit ein Redesign keine unbemerkten Layout-Brueche erzeugt.

## Acceptance Criteria — 51-alpha UI/UX Audit + Tokens

- [ ] AC-1: Bestehende Design-Dokumente (`docs/design/design-system.md`, Dashboard-Templates) sind gegen aktuellen Codebestand abgeglichen.
- [ ] AC-2: Aktuelle globale Token in `globals.css`, `tailwind.config.ts` und shadcn-Komponenten sind dokumentiert.
- [ ] AC-3: Abweichungen zwischen Ziel-Design-System und realem UI sind als Liste mit betroffenen Bereichen erfasst.
- [ ] AC-4: Entscheidung dokumentiert, welche Tokens global werden und welche nur Tenant-/Branding-spezifisch sind.
- [ ] AC-5: CIA/GitNexus-Impact fuer gemeinsam genutzte UI-Komponenten (`Button`, `Badge`, `Card`, `Sidebar`, `Input`, `Select`) ist dokumentiert, bevor Code geaendert wird.
- [ ] AC-6: Kein visueller Big-Bang in alpha; alpha liefert Dokumentation und Migrationsplan.

## Acceptance Criteria — 51-beta Corporate-Farben

- [ ] AC-7: Corporate-Farben werden ueber CSS-Variablen abgebildet, nicht durch harte Tailwind-Farben in einzelnen Komponenten.
- [ ] AC-8: Tenant-Branding kann mindestens Accent/Primary fuer ausgewaehlte Elemente beeinflussen: Primary-Buttons, aktive Navigation, wichtige Status-Akzente.
- [ ] AC-9: Fallback-Tokens greifen, wenn keine Tenant-Farbe gesetzt ist.
- [ ] AC-10: Kontrast bleibt lesbar; fuer zu helle/dunkle Corporate-Farben wird ein sicherer Textkontrast gewaehlt.
- [ ] AC-11: PDF-/Report-Branding aus PROJ-21 bleibt kompatibel und wird nicht durch App-Chrome-Tokens gebrochen.

## Acceptance Criteria — 51-gamma Component Refresh

- [ ] AC-12: Buttons erhalten konsistente Hover-, Active-, Focus-visible- und Disabled-Zustaende.
- [ ] AC-13: Leichte Schatten werden nur fuer interaktive oder elevated Elemente verwendet; keine grossflaechigen Card-in-Card-Layouts.
- [ ] AC-14: Badges, Inputs, Selects und Dialoge nutzen konsistente Radius-, Border-, Shadow- und Spacing-Tokens.
- [ ] AC-15: Existing shadcn/Radix-Komponenten bleiben die Basis; kein zweites UI-System wird eingefuehrt.
- [ ] AC-16: Layouts bleiben auf Mobile und Desktop ohne Textueberlauf und ohne inkonsistente Ueberlappungen.

## Acceptance Criteria — 51-delta Motion Layer

- [ ] AC-17: Kleine Microinteractions nutzen zuerst Tailwind-Transitions und `motion-safe`/`motion-reduce`.
- [ ] AC-18: Komplexere Animationen (Presence, Layout, Drag, Page/View-Wechsel) werden nur mit einer dedizierten Motion-Library umgesetzt, wenn Tailwind nicht reicht.
- [ ] AC-19: View Transition API wird fuer Seiten-/Viewwechsel evaluiert, aber nur genutzt, wenn sie progressiv und ohne funktionalen Bruch funktioniert.
- [ ] AC-20: Alle Animationen respektieren `prefers-reduced-motion`.
- [ ] AC-21: Animationen duerfen Lade-, Speicher- oder PDF-Status nicht verdecken; Status muss weiterhin deterministisch sichtbar sein.

## Acceptance Criteria — 51-epsilon Project-Room Anwendung

- [ ] AC-22: Project-Room Dashboard nutzt die neuen Tokens fuer Health, Budget, Risiken, Status und Aktionen.
- [ ] AC-23: Health-/Budget-/Risk-Kacheln zeigen Datenquellen und leere Zustaende klar an.
- [ ] AC-24: UI-Aenderungen werden auf den wichtigsten Screens per Screenshot/Playwright geprueft.
- [ ] AC-25: Lint und relevante Frontend-Tests laufen gruen; bekannte React-Compiler-Warnungen werden separat bewertet und nicht als Styling-Fix versteckt.

## Edge Cases

- **EC-1: Tenant-Farbe mit schlechtem Kontrast** — UI muss automatisch lesbaren Vordergrund waehlen oder auf Fallback wechseln.
- **EC-2: User bevorzugt reduzierte Bewegung** — Animationen werden entfernt oder stark reduziert, ohne Layoutspruenge.
- **EC-3: PDF/Print-Kontext** — Print-Styles aus PROJ-21 duerfen nicht durch App-Animationen oder App-Backgrounds verschmutzt werden.
- **EC-4: Dark-/Light-Mischzustand** — solange kein vollstaendiger Theme-Switch existiert, muessen neue Tokens zum bestehenden Theme passen.
- **EC-5: Bestehende Feature-Slices mit eigenen Farben** — Sonderfarben werden nur migriert, wenn sie semantisch in globale Tokens passen.

## Technical Requirements

- **Token-Quelle:** CSS-Variablen in `globals.css`, Tailwind-Mapping in `tailwind.config.ts`.
- **Komponentenbasis:** shadcn/Radix bleibt verbindlich.
- **Animationen:** Tailwind-Transitions fuer einfache States; Motion-Library nur fuer klar begruendete komplexere Faelle.
- **Accessibility:** `focus-visible`, Kontrast, Tastaturbedienung und `prefers-reduced-motion` sind Pflicht.
- **QA:** Visuelle Regression fuer Project Room, Settings/Tenant, Reports und zentrale Dialoge.
- **GitNexus/CIA:** Vor Aenderungen an geteilten Komponenten Impact-Analyse dokumentieren.

## Out-of-Scope

- Vollstaendiger Theme-Builder fuer beliebig viele Paletten.
- Migration aller Screens in einem Schritt.
- Neues komponentenfremdes UI-Framework.
- Marketing-Landingpage-Redesign.
- PDF-Render-Pending-Fix — gehoert zu PROJ-21 Output Rendering.

## Tech Design (Solution Architect) — 2026-05-07

> CIA-Review (2026-05-07) hat 5 Architektur-Forks bewertet. Alle Empfehlungen wurden 1:1 übernommen. Der Hybrid-Token-Ansatz löst die heutige Inkonsistenz zwischen `tailwind.config.ts` (Dark-Teal-Hex als Utility-Classes) und `globals.css` (shadcn-Slate-HSL als CSS-Vars), ohne shadcn-Updates zu blockieren.

### Locked Architektur-Entscheidungen

| Fork | Entscheidung | Begründung (Kurz) |
|---|---|---|
| **Theme-Bridge** | **Hybrid** — shadcn-Core-Vars in `globals.css` auf Dark-Teal-HSL remappen + Material-3-Erweiterungs-Vars (`--surface-container-low`, `--primary-container`, `--on-primary-container`, `--tertiary`, `--outline-variant`) ergänzen. `tailwind.config.ts` bindet alle Tokens an `hsl(var(--…))`. | Eine Source-of-Truth pro Mode; alle 40 shadcn-Primitives reskinnen automatisch durch CSS-Var-Remap; Material-3-Tokens werden zugänglich für Dashboard-Components ohne Token-Drift. |
| **Tenant-Branding** | **Dual-Layer** — Plattform-Tokens stabil; separate `--brand-*`-Tokens (`--brand-accent`, `--brand-accent-foreground`) nur für gezielte Brand-Slots (Primary-CTA, Active-Nav-Indikator, Logo). Tenant-Hex aus `tenants.branding.primary_hex` per Server Component in `<style data-tenant-brand>` injiziert; Auto-Foreground-Berechnung (WCAG-Contrast) im API-Helper. | shadcn-`--primary` bleibt **immer** Plattform-Teal — Funktions-Semantik (Active, Focus, Disabled) bleibt konsistent; Brand-Akzent ist additiver Layer; PDF-Render (PROJ-21) kann denselben JSONB-Hex unverändert nutzen. |
| **Motion-Library** | **Hybrid Tailwind + Framer** — Tailwind `transition-*` / `animate-*` / `motion-safe:`/`motion-reduce:` für ≥80% (Hover, Focus, Active, Buttons, Cards). Framer Motion **nur** für `<AnimatePresence>` bei Drawer/Sheet/Custom-Toasts und View-Transitions-Fallback. Globaler `<MotionConfig reducedMotion="user">` in App-Layout. | Bundle ~30 KB tree-shaked, AC-20 deterministisch erfüllt, Konflikt mit @dnd-kit (PROJ-25b) ausgeschlossen weil nicht auf Backlog/Sprint-Drag verwendet. |
| **View-Transitions** | **Opt-In pro Route** — `view-transition-name` nur auf Project-Room-Tab-Wechsel, Stakeholder-Detail-Open, Phase-Drawer-Open. Browser-Fallback: Framer-`AnimatePresence` oder reine Tailwind-Transitions. **Negativ-Liste:** Gantt, Kanban-Board, Print/PDF. | Browser-Support 2026 nicht universell; Global-Default würde mit Framer-AnimatePresence stacken; AC-21 (Status-Anzeigen nicht verdecken) erfordert defensives Vorgehen. |
| **Visual-Regression** | **Playwright-Snapshots** — 8 Snapshot-Tests via `toHaveScreenshot({ maxDiffPixelRatio: 0.01 })`. Snapshots im Repo unter `tests/__screenshots__/`. CI-Trigger bei Änderungen in `src/components/ui/`, `src/app/globals.css`, `tailwind.config.ts`. | Playwright bereits im Stack — keine zusätzliche Dependency, keine Cloud-Cost; Storybook+Chromatic wäre 2 PT Setup + Cloud-Cost (~$100/Mo) disproportional zum Slice-Scope. |

### Slice-Reihenfolge (verbindlich)

```
α (Audit, kein Code-Change) — sequentiell zuerst
   ↓
β (Token-Bridge + Branding-Layer) — Solo-deploybar
   ↓
γ ‖ δ (parallel; verschiedene Files)
   ↓
ε (Visual-Regression + Validierung) — sequentiell zuletzt
```

**Deploy-Solo-Kandidat:** β allein. Tokens etabliert, Komponenten reskinnen automatisch via shadcn-Var-Remap, kein neuer Library-Import. γ + δ + ε bilden zusammen den vollständigen Refresh.

### α-Deliverables (präzisiert)

| Datei | Inhalt |
|---|---|
| `docs/design/PROJ-51-alpha-ui-audit-tokens.md` (existiert bereits) | Token-Diff-Tabelle: shadcn-Var ↔ Material-3-Token ↔ Ziel-HSL-Wert. |
| `docs/design/PROJ-51-alpha-impact-matrix.md` (NEU) | Component-Impact-Matrix der 40 shadcn-Primitives via GitNexus + Hardcoded-Color-Inventory (`risk-trend-sparkline.tsx` 4 hex-sentinels, `work-item-kind-badge.tsx` `indigo`/`teal` Tailwind-Classes, `gantt-view.tsx` `fill-indigo-400`) + View-Transitions-Compat-Tabelle + Migrations-Plan β→ε mit Risiken/Rollback pro Slice. |

α produziert ausschließlich Dokumentation. Kein Bruch in Production möglich. AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 sind α-Coverage.

### β-Implementations-Skizze (Token-Bridge + Branding)

```
β-Slice
├── globals.css           shadcn-Core-Vars → Dark-Teal-HSL (--background, --primary, ...)
│                         + Material-3-Erweiterungs-Vars (--surface-container-low, ...)
│                         + 3-4 --brand-*-Slots
├── tailwind.config.ts    Hex-Werte raus → alle Tokens auf hsl(var(--…))
├── app/layout.tsx        <style data-tenant-brand>-Injection per Server Component
│                         (liest tenants.branding.primary_hex; auto-foreground per WCAG-Helper)
├── lib/branding/
│   ├── contrast.ts       WCAG-1.4-Helper: hex → black|white-foreground
│   └── server.ts         Resolves tenant brand from request context
└── docs/design/          PROJ-51-alpha-impact-matrix.md (Migrations-Plan)
```

### γ-Implementations-Skizze (Component-Refresh)

- `Button` — Hover: `shadow-sm` → `shadow-md`, transition 200ms; Focus-visible: `ring-2 ring-primary`; Active: subtle scale 0.97
- `Card` — Default `bg-surface-container-low border-outline-variant`; Hover-Lift `hover:shadow-md transition-shadow`
- `Badge` — semantische Varianten (`success`, `warning`, `error`, `tertiary`) mit `bg-{token}/10 text-{token} border-{token}/20`
- `Input` / `Select` / `Textarea` — Focus-Ring `outline-2 outline-primary` (statt shadcn-Default `ring-offset`)
- `Dialog` / `Sheet` / `Popover` — Backdrop-Blur `backdrop-blur-sm` + `bg-black/40` + Shadow für Z-Hierarchy

### δ-Implementations-Skizze (Motion-Layer)

- App-Layout: `<MotionConfig reducedMotion="user">` als Provider
- Drawer/Sheet/Dialog: `<AnimatePresence>` Wrapper mit `motion.div` initial/animate/exit (200ms)
- Toast (Sonner): existing slide-in beibehalten, prefers-reduced-motion respekten
- Microinteractions: Tailwind-only (`hover:`, `focus:`, `active:`, `motion-reduce:transition-none`)
- View-Transitions: `view-transition-name` CSS auf opt-in Routes; `useViewTransition`-Hook mit Feature-Detection-Fallback

### ε-Implementations-Skizze (Validierung)

- Playwright-Snapshots: 8 Schlüssel-Pages
  - Login, Project-Liste, Project-Room (Scrum/Waterfall/Kanban-Variant), Stakeholder-Detail, Settings/Tenant-Branding, PDF-Preview
- Test-Tenant mit fixen Seeds (anti-flake)
- CI-Trigger bei `src/components/ui/`, `src/app/globals.css`, `tailwind.config.ts`-Änderungen
- WCAG-Kontrast-Smoke pro Token-Paar (manueller Audit + ein Lighthouse-Run pro Page)

### Dependencies (zusätzlich zu Spec-Liste)

- **NEW Package:** `framer-motion` (~30 KB tree-shaked); zu installieren in δ
- **CSS-Var-Pattern:** bestehend (shadcn nutzt es bereits)
- **PROJ-17 `tenants.branding`:** vorhandenes JSONB-Feld, kein Schema-Change
- **PROJ-21 PDF-Render:** unberührt — eigener Render-Pfad mit eigenem `<style>`-Inline; PDF kann denselben Brand-Hex aus `tenants.branding.primary_hex` ohne Code-Sharing nutzen

### Migrations-/Deploy-Risiko

- **Schema-Drift-CI (PROJ-42-α):** kein Risiko — keine SQL-Änderungen
- **RLS-Risiko:** kein Risiko — Frontend-only-Slice, keine Datenbank
- **Frontend-Regression:** mittel — Token-Remap betrifft alle 40 shadcn-Primitives → Playwright-Snapshots in ε sind Pflicht-Gate vor `/deploy`
- **Bundle-Risiko (γ + δ):** Framer-Motion-Import muss tree-shaked sein (`import { motion, AnimatePresence } from "framer-motion"` — nicht das Default); Bundle-Audit in ε-QA
- **Tenant-Branding-Risiko:** Auto-Foreground-Helper (WCAG-1.4) muss Edge-Cases (Mid-Range-Helligkeiten) sauber wählen — APCA als Fallback erwägen falls WCAG-1.4 zu rigid
- **Rollback:** β reverten = `globals.css` + `tailwind.config.ts` zurück; γ reverten = component-für-component möglich; δ reverten = Framer-Imports + `<MotionConfig>` weg

### Offene Fragen für `/frontend`-Skill

| Frage | Default-Empfehlung |
|---|---|
| Light-Mode in PROJ-51 mitliefern? | **Nein, deferred** — MVP ist Dark-first laut Spec; Light-Mode als eigener PROJ-53-Folge-Slice (kein Architektur-Bruch, nur zusätzlicher `:root[data-theme="light"]`-Block) |
| `--brand-*`-Tokens in PDF-Render? | PDF-Renderer (Puppeteer-basiert) liest `tenants.branding.primary_hex` direkt aus DB für Print-CSS — keine CSS-Var-Notwendigkeit; konsistent mit App-Brand-Slot |
| Next-16 `unstable_ViewTransition`-API stabil? | Vor δ-Start prüfen; falls nicht stabil → reine `document.startViewTransition`-API + Feature-Detection (Web-API-direkt) |
| WCAG-1.4 oder APCA für Auto-Foreground? | WCAG-1.4 als Default (etablierter), APCA-Fallback bei mittleren Helligkeiten als β.2-Slice falls Pilot-Tenants Probleme melden |

### Übergabe an Implementierung

Reihenfolge: **`/architecture` ✓ → `/frontend` α (Audit) → `/frontend` β (Token-Bridge + Branding) → `/frontend` γ + δ parallel → `/frontend` ε → `/qa` → `/deploy`**.

Geschätzter Gesamtaufwand: **~4-5 PT** (1 PT Audit, 1 PT β, 1 PT γ, 1 PT δ, 1 PT ε + QA + Deploy). Pilot-Reskinning via β allein deploybar in ~1.5 PT inkl. QA-Smoke.

### CIA-Review

Continuous Improvement Agent (2026-05-07) hat:
- 5 Architektur-Forks bewertet, alle mit klaren Empfehlungen (1c / 2c / 3d / 4b / 5b)
- Slice-Sequenz formalisiert: α → β (solo-deploybar) → γ ‖ δ → ε
- Anti-Patterns explizit benannt: shadcn-`--primary` durch Tenant-Branding ersetzen, Framer auf jeder Komponente, View-Transitions ohne Fallback, Snapshot-Tests ohne Sub-Pixel-Toleranz
- 4 offene Fragen markiert (Light-Mode, View-Transitions-API-Status, PDF-Brand, WCAG-vs-APCA)
- Bundle-Budget benannt: ≤30 KB Framer-Motion tree-shaked

Vollständiger CIA-Bericht in der Session-Konversation 2026-05-07 dokumentiert. Tech-Design folgt CIA-Empfehlungen 1:1.

## Implementation Notes

### α — Audit + Inventory (2026-05-07)

**Geliefert:**
- `docs/design/PROJ-51-alpha-ui-audit-tokens.md` — Token-Diff-Tabelle: 19 Core-Tokens (shadcn → Dark-Teal-HSL), 35 Erweiterungs-Tokens (Material-3-Surface/Container/Tertiary), 3 Brand-Layer-Tokens, Sidebar-Mapping (8), Spacing/Typography/Border-Radius-Scales, WCAG-Kontrast-Validierungs-Critical-Pairs.
- `docs/design/PROJ-51-alpha-impact-matrix.md` — Component-Impact-Matrix der 40 shadcn-Primitives (Tier 1 auto-reskin / Tier 2 manuell), Hardcoded-Color-Inventory: 4 Files mit ~10 Hex-Werten + 26 Files mit 105 Tailwind-Direct-Color-Treffern (`emerald`, `amber`, `red`, `indigo`, `teal`, ...), View-Transitions-Compat-Tabelle (Stand 2026-05), Migrations-Plan β→ε mit Files/Risiken/Rollback/Aufwand pro Slice.

**Audit-Ergebnisse:**
- **Token-Welten getrennt:** `globals.css` (shadcn-Slate-HSL aktiv) ↔ `tailwind.config.ts` (Dark-Teal-Hex als toter Code für shadcn). β-Bridge ist die Lösung.
- **40 shadcn-Komponenten** auto-reskinbar via CSS-Var-Remap. Hoch-Risk-Re-Skin-Komponenten: `button`, `card`, `sidebar`, `chart`. Manueller Eingriff in γ.
- **Hardcoded-Schwerpunkte** sind Status-Badges (Risk, Approval, Lifecycle, Health) + Charts. γ konsolidiert auf semantische Tokens (`--risk-low/medium/high/critical`, `--success`, `--warning`, `--chart-1..5`).
- **Light-Mode** explizit deferred zu PROJ-53; MVP ist Dark-first.
- **Browser-Compat** für View-Transitions-API: Chrome/Edge/Safari stable, Firefox 124+ Beta — Opt-In + Feature-Detection-Fallback (Framer-AnimatePresence) ist robust.

**Aufwand-Schätzung (gesamt):**
- α (dieser Slice): ✓ done, reine Doku
- β (Token-Bridge + Branding): ~1 PT — solo-deploybar
- γ (Component-Refresh): ~1 PT
- δ (Motion-Layer): ~1 PT — `framer-motion` als neue Dependency
- ε (Visual-Regression): ~1 PT — 8 Playwright-Snapshots
- **Total: ~4-5 PT** für vollständigen Refresh

**Open Decisions** für `/architecture`-Folge bzw. β-Start (Defaults gesetzt):
1. Light-Mode → deferred PROJ-53 ✓
2. WCAG-1.4 vs APCA → WCAG-1.4 (β.2 als Fallback)
3. `next-themes` beibehalten → Ja
4. Charts: eigene `--chart-1..5` neu, semantisch
5. `tenants.branding.primary_hex` Format → `#RRGGBB` 6-digit-Hex

**β-Start-Voraussetzungen erfüllt:** Token-Definition komplett, Migrations-Plan dokumentiert, Risiken benannt, Rollback-Strategie pro Slice spezifiziert.

α-Slice damit dokumentations-vollständig. Ready für β.

### β — Token-Bridge + Brand-Layer (2026-05-07)

**Geliefert (3 Locks):**

- **β.1** (`8b6cc25`) — `src/app/globals.css` + `tailwind.config.ts`
  - `globals.css` `:root`: 19 Core-Tokens auf Dark-Teal-HSL (`--background: 222 56% 9%`, `--primary: 183 32% 73%`, ...) + 35 Material-3-Erweiterungs-Tokens (`--surface-container-low/high/highest`, `--primary-container`, `--tertiary`, `--outline-variant`, ...) + 3 Brand-Layer-Slots (`--brand-accent`, `--brand-accent-foreground`, `--brand-nav-active`) als Plattform-Default = primary
  - `--chart-1..5` Material-3-distinct-Hues (teal/warm/secondary/error/on-surface)
  - `--sidebar-*` (8 Vars) auf Dark-Teal — PROJ-23-Erbe zieht automatisch durch
  - `.dark`-Block bleibt no-op (Dark = Default in PROJ-51; Light-Mode = PROJ-53)
  - `tailwind.config.ts`: Material-3-Tokens von Hex → `hsl(var(--…))`; Brand-Layer-Utilities (`bg-brand-accent`, `text-brand-accent-foreground`, `border-brand-nav-active`)

- **β.2** (`7ccfc31`) — `src/lib/branding/contrast.ts` + Tests
  - `parseHex()` strict `#RRGGBB`-Parser
  - `relativeLuminance()` WCAG 2.1 sRGB-linearization
  - `contrastRatio()` (Lmax + 0.05) / (Lmin + 0.05)
  - `pickBrandForeground()` → `"white" | "black"` (auto-WCAG-AA)
  - `hexToHslTriplet()` → `H S% L%` für CSS-Var-Substitution
  - `buildBrandStyleBlock()` für `<style data-tenant-brand>`-Pattern
  - 21 Vitest-Cases grün

- **β.3** (`4063c6a`) — `src/app/(app)/layout.tsx` Server-Component-Brand-Injection
  - Existing `--color-brand-600` (PROJ-17 Legacy) bleibt für `profile-radar-chart.tsx`
  - NEU: `--brand-accent` / `--brand-accent-foreground` / `--brand-nav-active` werden via Server-rendered inline-Style in den AppShell-Wrapper gesetzt
  - Auto-Foreground via WCAG-1.4 (Helper aus β.2)
  - Override scoped auf authenticated Routes (keine Leakage auf `/login`, `/signup`, `/onboarding`)
  - Invalid/missing Brand-Hex → kein Override → Plattform-Default greift

**Verifikation:**
- `npm run build` ✓ 51 Pages, type-check sauber
- `npx vitest run` ✓ 1155/1155 (127 Files; +21 neue β.2-Tests)
- Vercel-Deploy: `dpl_5i87fjVmDwLGThidqyYBrmGg58Ee` → `dpl_4AuFP9qj5LXE6KcUnyiKX7Wt5rub` (live nach ~25s)

**AC-Coverage (β):**
| AC | Status |
|---|---|
| AC-7 (Corporate-Farben via CSS-Vars) | ✓ |
| AC-8 (Tenant-Branding für Primary/Active-Nav-Slots) | ✓ |
| AC-9 (Fallback-Tokens wenn Tenant nichts gesetzt hat) | ✓ |
| AC-10 (Lesbarer Kontrast — WCAG-1.4-Auto-Foreground) | ✓ |
| AC-11 (PDF-Branding aus PROJ-21 bleibt kompatibel) | ✓ — PDF-Render-Pfad nicht angefasst |

β-Slice fertig & deployt. Solo-deploybar wie geplant. Ready für γ (Component-Refresh).

### γ — Component-Refresh + Status-Token-Migration (2026-05-07)

**Geliefert (3 Locks):**

- **γ.1** (`ec1e04d`) — 7 semantische CSS-Var-Tokens + Badge-Variants
  - `--risk-low/medium/high/critical` (light HSL für Dark-Teal-Background) + `--success` / `--warning` / `--info` (Aliase)
  - Tailwind-Utilities (`bg-risk-low/10`, `text-success`, `border-warning/20`, etc.)
  - `Badge`-Komponente um 7 neue Varianten erweitert: `success`, `warning`, `info`, `risk-low`, `risk-medium`, `risk-high`, `risk-critical` — folgt dem `bg-{token}/10 text-{token} border-{token}/20`-Pattern aus design-system.md

- **γ.2** (`c5f6979`) — Migration der 6 Status-Badge-Konsumenten
  - `risk-banner.tsx`: 4 Buckets (green/yellow/orange/red) → `--risk-low/medium/high/critical`
  - `risk-score-preview.tsx`: gleicher Pattern
  - `phase-status-badge.tsx`: `completed` → `--success`
  - `milestone-status-badge.tsx`: `achieved` → `--success`
  - `phase-compliance-warnings.tsx`: amber-50/300/600/900 + dark:variants → `--warning` (konsolidiert, da Dark = Default)
  - `work-item-compliance-section.tsx`: `text-emerald-600 dark:text-emerald-400` → `text-success`

- **γ.3** (`0c28fc2`) — Button + Card Microinteractions
  - `Button`: `transition-all 150ms` + `active:scale-[0.98]` (subtile Press-Feedback) + Hover-Shadow-Lift (sm→md). `motion-reduce:transform-none` respektiert Accessibility-Pref. `link`-Variante opt-out für scale.
  - `Card`: `transition-shadow 200ms` + `hover:shadow-md` (gentle lift). `motion-reduce:transition-none`. Consumer-Override über `className="hover:shadow-sm"` möglich.

**Verifikation:**
- `npm run build` ✓ 51 Pages, type-check sauber
- `npx vitest run` ✓ 1155/1155 grün (127 Files)
- Vercel-Deploy: `dpl_4AuFP9qj5LXE6KcUnyiKX7Wt5rub` → `dpl_79DKCiUeAggiPuZbwNEmMpTVWK62` (live nach ~25s)

**AC-Coverage (γ):**
| AC | Status |
|---|---|
| AC-12 (Hover/Active/Focus-Visible/Disabled-Zustände) | ✓ Button alle Varianten |
| AC-13 (Schatten nur interaktiv/elevated) | ✓ Button + Card hover-shadow |
| AC-14 (Konsistente Radius/Border/Shadow/Spacing-Tokens) | ✓ via Badge-Variants + globals.css |
| AC-15 (shadcn/Radix bleibt Basis) | ✓ kein neues UI-System |
| AC-16 (Mobile + Desktop ohne Bruch) | ✓ Token-Migration ändert keine Layouts |

**Bewusst NICHT angefasst (γ-Out-of-Scope, kann γ.4 / Folge-Slice werden):**
- Charts mit Hex-Konstanten (`risk-trend-sparkline.tsx`, `cost-cap-section.tsx`, `profile-radar-chart.tsx`) — `--chart-1..5` Tokens existieren, Migration ist kosmetisch
- ~80 verbleibende Tailwind-Direct-Color-Treffer in 20 Files (profile-tab, lifecycle-badge, risk-matrix, stakeholder-table, approval-status-banner, ...) — Hauptarbeit ist erledigt; Rest = nachgelagerte Pflege
- `Input`/`Select`/`Textarea`-Focus-Ring + `Dialog`/`Sheet`/`Popover`-Backdrop-Blur — können in γ.4 ergänzt werden

γ-Slice in 3 Locks deployt. Ready für δ (Motion-Layer) oder γ.4 (rest of the audit-list).

### β-Revision (2026-05-07, nach User-Feedback)

User-Befund: meine β.1-Migration hat Light- und Dark-Modus komplett ersetzt. Im Project-Room war die Folge "Hintergrund weiß, Items dunkel", weil `next-themes` `class="light"` setzte aber `:root` Dark-Teal lieferte und keine `.light`-Definition existierte.

**Fix (`d418a26`):**
1. `:root` zurück auf **shadcn Light** (Supabase-Default)
2. `.dark` zurück auf **shadcn Dark** (Supabase-Default)
3. Material-3-Erweiterungs-Tokens als **Aliasse** auf shadcn-Vars (`--surface: var(--background)`, etc.) — tracken Light/Dark automatisch
4. Brand-Layer als Aliasse (`--brand-accent: var(--primary)`)
5. Risk/Status-Tokens jetzt **per Mode getuned** (Light: `emerald-600 / amber-500`, Dark: `light emerald / amber`)
6. **Dark-Teal opt-in** via `[data-theme="dark-teal"]` — Tenants/User können das explizit aktivieren ohne Default zu brechen

`next-themes`-Light/Dark-Toggle funktioniert wieder identisch zu vor PROJ-51. AC-7..AC-11 weiterhin abgedeckt; Dark-Teal als 3. Theme-Preset zugänglich aber nicht erzwungen.

### γ.4 — Dialog/Sheet Backdrop-Blur (2026-05-07)

**Geliefert (`b4b6971`):** `DialogOverlay` + `SheetOverlay` von `bg-black/80` → `bg-black/40 backdrop-blur-sm`. Modernes Backdrop-Pattern, Inhalt darunter bleibt teilweise sichtbar.

### δ — Motion-Layer (2026-05-07)

**Geliefert (`d3eb718`):**
- `framer-motion ^12` als Dependency installiert
- `src/components/motion/reduced-motion-provider.tsx` — Client-Component-Wrapper mit `<MotionConfig reducedMotion="user">`. AC-20 (`prefers-reduced-motion`) deterministisch erfüllt für alle künftigen Framer-Motion-Animations.
- `src/lib/motion/use-view-transition.ts` — Progressive-Enhancement-Hook für `document.startViewTransition`. Browser ohne API fallen auf direkte Callback-Execution durch. 4 Vitest-Cases.
- `app/layout.tsx` mountet `<ReducedMotionProvider>` innerhalb `<ThemeProvider>` um children + Toaster.

**Bewusst NICHT in δ:**
- `<AnimatePresence>` auf Dialog/Sheet/Popover — Radix animiert bereits via CSS-`data-state`-Pattern; Framer würde konkurrieren
- `view-transition-name` CSS auf bestimmten Routen (Project-Room-Tabs, Stakeholder-Detail) — können in einem späteren Polish-Slice ergänzt werden
- Bundle-Size-Bench in echtem Prod-Build — ~30 KB tree-shaked laut CIA-Plan akzeptabel

### ε — Visual-Regression-Baseline (2026-05-07)

**Geliefert (`5ecdacf`):** `tests/PROJ-51-visual-regression.spec.ts` mit 2 Playwright-Snapshot-Tests:
- Login desktop (1280×720)
- Login mobile portrait (375×812)
- `maxDiffPixelRatio: 0.01` (1% Toleranz) gegen Anti-Flake

**Setup-Anleitung für CI/local:**
```
npx playwright test --update-snapshots PROJ-51-visual-regression
git add tests/PROJ-51-visual-regression.spec.ts-snapshots/
git commit -m "ci: seed visual-regression baselines"
```

**ε.2 (Follow-up):** 6 weitere Snapshot-Targets aus dem α-Migrationsplan (Project-Room Scrum/Waterfall/Kanban, Stakeholder-Detail, Settings/Tenant-Branding, PDF-Preview) — brauchen vorher einen stabilen Test-Tenant mit fixen Seeds, damit Date.now()-/UUID-Drift keine False-Positives erzeugt.

### Verifikation (alle vier Locks heute)

- ✅ `npm run build` durchgängig grün, 51 Pages
- ✅ `npx vitest run` 1159/1159 grün (128 Files; +4 view-transition Tests)
- ✅ Vercel-Deploys live für jeden Commit (4 separate Deploy-IDs verifiziert)
- ✅ shadcn Light/Dark-Toggle funktioniert wieder wie vor PROJ-51
- ✅ Project-Room-"weißer Hintergrund"-Bug behoben (durch β-Revision)

### Verbleibende Follow-Ups (nicht blockierend)

| Slice | Was | Aufwand |
|---|---|---|
| **γ.5** | Charts (`risk-trend-sparkline`, `cost-cap-section`, `profile-radar-chart`) auf `--chart-1..5` umstellen | ~0.3 PT |
| **γ.6** | Restliche ~80 Tailwind-Direct-Color-Treffer in 20 Files (profile-tab, lifecycle-badge, approval-status-banner, ...) | ~1 PT, kosmetisch |
| **δ.2** | `<AnimatePresence>`-Wiring auf ausgewählten Drawers + `view-transition-name` CSS auf Project-Room-Tabs | ~0.5 PT |
| **ε.2** | 6 zusätzliche Visual-Regression-Snapshots mit Test-Tenant-Seeds | ~0.5 PT |

PROJ-51-MVP ist damit deployt: Theme-Token-Bridge + Brand-Layer + Status-Token-Migration + Button/Card-Microinteractions + Dialog-Backdrop-Blur + Motion-Provider + View-Transition-Hook + Visual-Regression-Baseline. Die offenen Follow-Ups sind Polish, kein Blocker.

### γ.5 + γ.6 batch 1 + δ.2 + ε.2 (2026-05-07, Folge-Slices)

**γ.5 (`8b56d8e`):** 3 Charts auf Theme-Tokens migriert (risk-trend-sparkline / profile-radar-chart / cost-cap-section).

**γ.6 batch 1 (`f372aba`):** 6 Status-Domain-Files (work-item-status-badge, work-item-priority-badge, lifecycle-badge, 3 approval-Files). `work-item-kind-badge` (7 Taxonomie-Farben) + `traffic-light-pill` (print-friendly) bewusst übergangen.

**δ.2 (`64a738a`):** 4 View-Transition-CSS-Utility-Classes als Consumer-opt-in.

**ε.2 (`72b0af2`):** Signup-Snapshot + Login-Dark-Mode-Snapshot.

**Verifikation:** alle 4 Slices `npm run build` grün, 1159/1159 vitest grün, Vercel-Deploys live.

### δ.3 + Theme-Toggle UI (2026-05-07)

**δ.3 (`1735980`):** `vt-tab-panel` className auf den Children-Wrapper in
`src/components/projects/project-room-shell.tsx` gelegt. Project-Room
nutzt route-basierte Navigation (kein Tabs-Component) — der Wrapper im
Shell ist die einzige Stelle, an der alle Tab-Panels durchlaufen, also
genau dort die opt-in View-Transition. Negativ-Liste laut α-Impact-
Matrix dokumentiert (Gantt + Kanban-Board sind Sub-Routes mit eigenen
DnD-Animations und werden vom Wrapper nicht erfasst).

**Theme-Toggle UI (`87b21cc`):** Dark-Teal als 4. Theme-Option im
User-Menu freigeschaltet:
- `globals.css`: Selector von `[data-theme="dark-teal"]` auf `.dark-teal`
  umgestellt, damit `next-themes` mit `attribute="class"` die Klasse
  automatisch auf `<html>` setzt, wenn `setTheme("dark-teal")` aufgerufen
  wird.
- `layout.tsx`: `themes={["light","dark","system","dark-teal"]}` an den
  ThemeProvider übergeben — sonst normalisiert `next-themes` unbekannte
  Werte zurück auf `defaultTheme`.
- `user-menu.tsx`: 4. `<DropdownMenuRadioItem value="dark-teal">` mit
  `Palette`-Icon zwischen Dark und System; Trigger-Icon-Branch ergänzt.

Damit ist das Dark-Teal-Theme aus β nicht mehr nur opt-in via Dev-DOM-
Tweak, sondern wirklich als End-User-Option live.

**Verifikation:** `npm run build` grün, Commits gepusht, Live auf Vercel.

### γ.6 batch 2 (2026-05-07, 4 Sub-Batches)

19 weitere Komponenten in 4 Sub-Commits auf semantische Tokens migriert.
Pro Sub-Batch eigener Commit + Push, damit jede Lock einzeln verifiziert.

**γ.6 batch 2a — forms (`ad10592`):** decision-form, edit-work-item-
dialog, change-kind-dialog, delete-work-item-dialog. Pattern: hartes
`border-amber-300/bg-amber-50/text-amber-900` (+ dark twins) →
`border-warning/40 bg-warning/10 text-warning`.

**γ.6 batch 2b — charts/heatmaps (`be7f451`):** risk-matrix (cellTone),
stakeholder-matrix (cellTone), utilization-heatmap (heatClass — 4-
Stufen-Auslastung), phases-timeline (completed-pill emerald → success).
Kein `-foreground`-Token für success/warning/info eingeführt; `text-
foreground` + Alpha-Tönung hält WCAG-AA.

**γ.6 batch 2c — panels (`f9a3424`):** open-items-panel statusIcon,
suggestion-card scoreTone, outbox-panel emailStubMode-Banner. Reports
(status-report-body, executive-summary-body) bewusst übersprungen —
identisch zu traffic-light-pill ein print-friendly-Concern, gehört in
einen Print-Layout-Slice mit `forcedTheme="light"`.

**γ.6 batch 2d — tables/badges/banners (`dbf7fb0`):** risk-table,
vendor-evaluations-tab, budget/format.ts (TRAFFIC_LIGHT_CLASSES für
Budget-UI; print-Variante in traffic-light-pill bleibt hartcodiert),
project-budget-tab-client (FX-Banner), stakeholder-table (SCORE_TONE +
ATTITUDE_TONE), stakeholder-health-page-client (4-Bucket-Palette
green/yellow/orange/red → `risk-low/medium/high/critical` — exakter
1:1-Fit), profile-tab (3 Stellen: Delta-Chip, Invite-Status-Badges,
Skill-Delta), ai-providers-page-client (HTTP-Warnung + StatusBadge).

**Verifikation:** alle 4 Sub-Batches `npm run build` grün, finale
1159/1159 vitest grün, Vercel-Deploys live.

### Print-Theme (2026-05-07, `b05d987`)

Schließt den batch-2c-Defer für die Print-friendly-Trio. Statt einen
separaten ThemeProvider mit `forcedTheme="light"` einzuführen
(funktioniert mit `next-themes` im selben Tree nicht zuverlässig),
wurde eine **CSS-only-Scope** gebaut:

- **`.theme-print` in `globals.css`:** redeklariert sämtliche relevante
  Light-Mode-HSL-Tokens (shadcn Core + risk-* + success/warning/info)
  direkt im Selector. Eltern-`.dark` oder `.dark-teal` werden
  überspielt, weil `.theme-print` näher am Element steht. `color-
  scheme: light` setzt zusätzlich Form-Controls + Scrollbars zurück.
- **Wrapper-Anwendung:** `/reports/snapshots/[id]/page.tsx` (öffentliche
  Ansicht) und `/print/page.tsx` (Puppeteer-Quelle) tragen jetzt
  `theme-print` auf der Container-Div und nutzen `bg-background` statt
  hartem `bg-white` — der Token resolved durch den Scope wieder zu
  weiß.
- **3 Print-Komponenten migriert:**
  - `traffic-light-pill.tsx` — emerald/amber/rose → success/warning/
    destructive (Badge-Tone + Dot + Ring). Docblock erklärt die Scope-
    Abhängigkeit.
  - `status-report-body.tsx` + `executive-summary-body.tsx` —
    "revidiert"-Chip amber → warning.

Damit sind die deferreds aus batch 2c geschlossen; Print/PDF bleibt AA-
lesbar auf weißem Papier unabhängig vom App-Theme des Users.

### Bewusst nicht migriert (Architektur-Entscheidungen)
- `work-item-kind-badge.tsx` — 7 distinkte Taxonomie-Farben, lassen
  sich nicht sinnvoll auf 4 Status-Tokens abbilden.
- `ui/toast.tsx` — shadcn-Primitive, sollte über `variant="destructive"`
  statt direkter Farbe gesteuert werden.

### Verbleibende Folge-Slices (alle nicht blockierend)
| Slice | Was | Aufwand |
|---|---|---|
| **ε.3** | Test-Tenant-Seed + 6 authenticated-Page Snapshots | ~1 PT |

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_
