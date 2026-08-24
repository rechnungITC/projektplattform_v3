# PROJ-51: Modern UI/UX & Motion System

## Status: Deployed (α + β + γ + γ.5/γ.6 + δ + δ.2/δ.3 + ε + ε.2/ε.3/ε.4/ε.5 + Theme-Toggle + Print-Theme — alle Slices live; einzig `work-item-kind-badge` und `ui/toast` bewusst hartcodiert)

## Deployment Scope: mvp

> Klassifiziert im rueckwirkenden `/qa`-Durchgang 2026-08-24 (PROJ-Y-51a). 24 von 25 Kriterien
> erfuellt; **AC-20** (`prefers-reduced-motion`) ist literal unerfuellt und als **PROJ-Y-51c**
> registriert, deshalb nicht `full` — die Waiver-Regel scheitert an ihrer ersten Bedingung
> („nothing was deferred“). Die gelieferte Grenze ist ein nutzbares, in den
> Implementierungsnotizen ausdruecklich als MVP benanntes Design-System; jede Auslassung ist
> benannt und verfolgt (PROJ-Y-51b/51c/51d).
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

- [x] AC-1: Bestehende Design-Dokumente (`docs/design/design-system.md`, Dashboard-Templates) sind gegen aktuellen Codebestand abgeglichen.
- [x] AC-2: Aktuelle globale Token in `globals.css`, `tailwind.config.ts` und shadcn-Komponenten sind dokumentiert.
- [x] AC-3: Abweichungen zwischen Ziel-Design-System und realem UI sind als Liste mit betroffenen Bereichen erfasst.
- [x] AC-4: Entscheidung dokumentiert, welche Tokens global werden und welche nur Tenant-/Branding-spezifisch sind.
- [x] AC-5: CIA/GitNexus-Impact fuer gemeinsam genutzte UI-Komponenten (`Button`, `Badge`, `Card`, `Sidebar`, `Input`, `Select`) ist dokumentiert, bevor Code geaendert wird.
- [x] AC-6: Kein visueller Big-Bang in alpha; alpha liefert Dokumentation und Migrationsplan.

## Acceptance Criteria — 51-beta Corporate-Farben

- [x] AC-7: Corporate-Farben werden ueber CSS-Variablen abgebildet, nicht durch harte Tailwind-Farben in einzelnen Komponenten.
- [x] AC-8: Tenant-Branding kann mindestens Accent/Primary fuer ausgewaehlte Elemente beeinflussen: Primary-Buttons, aktive Navigation, wichtige Status-Akzente.
- [x] AC-9: Fallback-Tokens greifen, wenn keine Tenant-Farbe gesetzt ist.
- [x] AC-10: Kontrast bleibt lesbar; fuer zu helle/dunkle Corporate-Farben wird ein sicherer Textkontrast gewaehlt.
- [x] AC-11: PDF-/Report-Branding aus PROJ-21 bleibt kompatibel und wird nicht durch App-Chrome-Tokens gebrochen.

## Acceptance Criteria — 51-gamma Component Refresh

- [x] AC-12: Buttons erhalten konsistente Hover-, Active-, Focus-visible- und Disabled-Zustaende.
- [x] AC-13: Leichte Schatten werden nur fuer interaktive oder elevated Elemente verwendet; keine grossflaechigen Card-in-Card-Layouts.
- [x] AC-14: Badges, Inputs, Selects und Dialoge nutzen konsistente Radius-, Border-, Shadow- und Spacing-Tokens.
- [x] AC-15: Existing shadcn/Radix-Komponenten bleiben die Basis; kein zweites UI-System wird eingefuehrt.
- [x] AC-16: Layouts bleiben auf Mobile und Desktop ohne Textueberlauf und ohne inkonsistente Ueberlappungen.

## Acceptance Criteria — 51-delta Motion Layer

- [x] AC-17: Kleine Microinteractions nutzen zuerst Tailwind-Transitions und `motion-safe`/`motion-reduce`.
- [x] AC-18: Komplexere Animationen (Presence, Layout, Drag, Page/View-Wechsel) werden nur mit einer dedizierten Motion-Library umgesetzt, wenn Tailwind nicht reicht.
- [x] AC-19: View Transition API wird fuer Seiten-/Viewwechsel evaluiert, aber nur genutzt, wenn sie progressiv und ohne funktionalen Bruch funktioniert.
- [ ] AC-20: Alle Animationen respektieren `prefers-reduced-motion`. — **FAIL** (`/qa` 2026-08-24, Befund F-2: `motion-reduce:transform-none` kann `active:scale-[0.98]` wegen geringerer Spezifitaet nicht ueberschreiben; im Browser gemessen und im Kontrollexperiment ursaechlich belegt) → **PROJ-Y-51c**
- [x] AC-21: Animationen duerfen Lade-, Speicher- oder PDF-Status nicht verdecken; Status muss weiterhin deterministisch sichtbar sein.

## Acceptance Criteria — 51-epsilon Project-Room Anwendung

- [x] AC-22: Project-Room Dashboard nutzt die neuen Tokens fuer Health, Budget, Risiken, Status und Aktionen.
- [x] AC-23: Health-/Budget-/Risk-Kacheln zeigen Datenquellen und leere Zustaende klar an.
- [x] AC-24: UI-Aenderungen werden auf den wichtigsten Screens per Screenshot/Playwright geprueft.
- [x] AC-25: Lint und relevante Frontend-Tests laufen gruen; bekannte React-Compiler-Warnungen werden separat bewertet und nicht als Styling-Fix versteckt.

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

### ε.3 — Authenticated Visual-Regression Baselines (2026-05-07, `a74e7f7`)

Erweitert den `tests/PROJ-51-visual-regression.spec.ts`-Set um 6
desktop-chromium-Snapshots für Top-Level-Pages, die **keine** Projekt-
Seeds brauchen — nur den `[E2E]`-Tenant + Admin-Membership, den
`tests/fixtures/global-setup.ts` ohnehin schon provisioniert:

- Dashboard (`/`)
- Projects-List (`/projects`)
- Stammdaten-Root (`/stammdaten`)
- Resources (`/stammdaten/resources`)
- Settings-Root (`/settings`)
- Tenant-Settings (`/settings/tenant`)

Implementations-Details:
- Neuer Spec-File `tests/PROJ-51-visual-regression-authenticated.spec.ts`,
  importiert die PROJ-29-Auth-Fixture (`./fixtures/auth-fixture`).
- Self-skip via `hasAuthStorageState()`: ohne valides
  `SUPABASE_SERVICE_ROLE_KEY` schaltet die Fixture komplett aus, der
  Spec wird zum No-Op.
- `test.skip(({browserName}) => browserName !== "chromium", …)` —
  Mobile-Safari-Hamburger-Layout ist ein eigener Follow-Up.
- `maxDiffPixelRatio: 0.02` (gg. 0.01 unauth), um leichten Dashboard-
  Daten-Jitter zu schlucken.
- AppShell-Sidebar (`[data-sidebar='sidebar']`) als Hydration-Marker.

Snapshot-PNGs werden beim ersten `npx playwright test --update-
snapshots`-Run unter `tests/PROJ-51-visual-regression-authenticated.
spec.ts-snapshots/` automatisch angelegt.

**Bewusst nicht in diesem Slice:**
- Project-Room-Pages (`/projects/[id]`, Gantt, Kanban, Risk-Matrix etc.)
  — brauchen einen fixed-UUID Seed-Projekt-Datensatz, sonst sprengen
  `Date.now()`-Timestamps + dynamische IDs jeden Pixel-Diff. Eigener
  Follow-Up-Slice (~0.5 PT zusätzlich auf den `globalSetup`).
- Mobile-Snapshots — das Hamburger-Shell ist Layout-different genug,
  um eine eigene Snapshot-Suite zu rechtfertigen.

### ε.4 + ε.5 — Project-Room Seed + Mobile-Snapshots (2026-05-07, `feba11e`)

**ε.4 — Project-Room Baselines:**
- `tests/fixtures/constants.ts`: neue Konstanten `E2E_PROJECT_ID` + `E2E_PROJECT_NAME` (UUID `00000000-0000-0000-0000-000000000e21`).
- `tests/fixtures/global-setup.ts`: idempotenter Upsert eines Test-Projekts unter dem `[E2E]`-Tenant mit `project_type: "general"` — kein Method-Trigger, also keine zusätzlichen Phasen/Sprints/WBS, die zwischen Runs jittern würden. Upsert-Fehler nicht fatal: nur ε.4-Snapshots skippen, Auth bleibt intakt.
- `PROJ-51-visual-regression-authenticated.spec.ts`: neuer ε.4-`describe`-Block mit Project-Room-Overview-Snapshot auf `/projects/<E2E_PROJECT_ID>`. `maxDiffPixelRatio: 0.03` (vs. 0.02 sonst) für computed-path / last-edit-time-Jitter; fallback auf `test.skip` wenn Seed nicht erreichbar (HTTP ≥ 400).

**ε.5 — Mobile-Layout Baselines:**
- Neue Datei `tests/PROJ-51-visual-regression-mobile.spec.ts`.
- 5 Mobile-Safari-only Snapshots (chromium per Project-Guard geskippt): Login + Signup (unauth) + Dashboard + Projects + Settings (authenticated).
- Mischt plain `@playwright/test`-Runner (unauth) mit Auth-Fixture (authenticated). Mobile-Shell hat Sidebar hinter Hamburger versteckt → wartet auf `networkidle` statt auf `data-sidebar`-Selector.

Snapshot-PNGs generieren beim ersten `npx playwright test --update-snapshots`-Run automatisch.

### Status: PROJ-51 vollständig in Production

Damit ist PROJ-51 als Slice-Familie technisch durch — alle 5 Bereiche (α Audit, β Brand-Layer + WCAG-Helpers, γ Component-Refresh + Status-Tokens + Microinteractions, δ Motion-Layer + View-Transitions, ε Visual-Regression) sind deployt und produktionsverfügbar. Die zwei verbleibenden Komponenten (`work-item-kind-badge`, `ui/toast`) bleiben bewusst hartcodiert — Begründung in den vorigen Notizen.

## QA Test Results

**Rückwirkender `/qa`-Durchgang 2026-08-24 — Verdikt: 24 von 25 Kriterien PASS, **AC-20 FAIL**;
0 Critical / 0 High / 2 Medium / 1 Low. Deployment Scope: `mvp`.**

Anlass war **PROJ-Y-51a**: PROJ-51 lief seit 2026-05-07 in Produktion, ohne dass ein einziges seiner
Kriterien bewertet worden wäre — beide Abschnitte dieser Spec standen wörtlich auf `_To be added by …_`.
Die Buchführung war damit die einzige unklassifizierte Zeile des Portfolio-Audits (PROJ-Y-145b, Tranche 5).
Die dort protokollierte Begründung — die Kriterien seien Urteilsfragen, die sich nicht messen lassen —
**trägt für den größeren Teil nicht**, und das ist der eigentliche Ertrag dieses Durchgangs:
Konsistenz von Hover/Active/Focus-visible/Disabled entsteht nicht pro Aufrufstelle, sondern in **einer**
cva-Basisklasse; und ob eine Animation läuft, steht im ausgelieferten Stylesheet, nicht im Auge des
Betrachters. Gemessen wurde deshalb überall dort, wo ein Mechanismus existiert — und genau das hat die
zwei Befunde gefunden, die ein Code-Review nicht sehen konnte.

**Erste Korrektur: es sind 25 Kriterien, nicht 24.** Das Followup-Register und die Tranche-5-Notiz nennen
24; gezählt sind AC-1…AC-25 (α 6 · β 5 · γ 5 · δ 5 · ε 4). Die Zahl war nie geprüft — dieselbe Klasse
Fehler wie QA-Befund F-1 in PROJ-45-β.

### Testumgebung

Eigener Worktree `proj-51/qa` auf `origin/main` (`cd8c171`), Dev-Server auf Port 3055 (PROJ-Y-143l-Muster:
`PLAYWRIGHT_BASE_URL` pinnt Runner, Server und Fixture auf denselben Host, sonst bedient ein fremder
Worktree die Tests). Kein Produktivcode geändert — dieser Durchgang liefert Nachweise und Tests, keine
Fixes (Hausregel: `/qa` findet, `/frontend` behebt).

### Kriterien-Matrix

| AC | Verdikt | Nachweis |
|---|---|---|
| AC-1 Design-Doku gegen Codebestand abgeglichen | ✅ | `docs/design/PROJ-51-alpha-ui-audit-tokens.md`, Abschnitt „Quellen" + „Ist-Stand: Drei Token-Welten" |
| AC-2 Token-Inventar dokumentiert | ✅ | 19 Core + 35 Erweiterung + 3 Brand + 8 Sidebar, dazu Spacing/Typografie/Radius-Skalen |
| AC-3 Abweichungsliste mit betroffenen Bereichen | ✅ | Hardcoded-Inventory: 4 Dateien mit Hex, 26 Dateien mit 105 Tailwind-Direktfarben, je mit Dateinamen |
| AC-4 Entscheidung global vs. Tenant-spezifisch | ✅ | Brand-Layer als eigener Abschnitt getrennt von den Core-Tokens |
| AC-5 Impact für die 6 geteilten Primitiven | ✅ | Impact-Matrix führt alle 40 shadcn-Primitiven mit Risikostufe; `button`/`card`/`sidebar` als **Hoch**, `badge`/`input`/`select` als **Mittel** einzeln begründet; CIA-Review dokumentiert |
| AC-6 kein visueller Big-Bang in α | ✅ **gemessen** | `git show --stat bcc3146`: 4 Dateien, **keine unter `src/`** — α ist nachweislich reine Dokumentation |
| AC-7 Corporate-Farben über CSS-Variablen | ✅ mit benannter Grenze | Brand-Layer über `--brand-*`; 6 Dateien tragen noch rohes Hex, stichprobenartig als legitim belegt (`\|\| "#ffffff"` Vorgabewert, `?? "#0f172a"` Report-Default, `placeholder="#2563EB"`) |
| AC-8 Tenant-Branding für Primary/Nav/Status | ✅ | `(app)/layout.tsx` injiziert `--brand-accent`, `--brand-accent-foreground`, `--brand-nav-active` server-seitig, scoped auf authentifizierte Routen |
| AC-9 Fallback bei fehlender Tenant-Farbe | ✅ | `buildBrandStyleBlock` gibt bei ungültigem Wert `""` zurück → Plattform-Default greift; 33 Tests in `contrast.test.ts` |
| AC-10 lesbarer Kontrast | ✅ | `pickBrandForeground` über WCAG-2.1-Relativluminanz; Grenzfälle (Weiß/Schwarz/Gelb/dunkles Blau) testgepinnt |
| AC-11 PDF-/Report-Branding bleibt kompatibel | ✅ **stärker als dokumentiert** | Der `.theme-print`-Scope wird heute von **7** Druckseiten benutzt (β/γ-Notizen nannten 2) — PROJ-45-β/γ, PROJ-116, PROJ-131, PROJ-132 haben ihn übernommen; der Mechanismus hat 15 Monate Folge-Slices getragen |
| AC-12 Buttons: Hover/Active/Focus-visible/Disabled | ✅ **im Browser gemessen** | Hover ändert Fläche; **Tastaturfokus** erzeugt Ring, **Maus-Fokus nicht** (belegt `focus-visible`, nicht `focus`); Disabled nach der Transition 0.5 + `pointer-events: none`; dazu 12 Vertragsfälle über alle 6 Varianten |
| AC-13 Schatten nur interaktiv/elevated | ✅ | `shadow-sm→md` nur an `default`/`destructive`/`secondary`, Card-Hover-Lift, Dialog `shadow-lg`; `ghost`/`link` bewusst ohne |
| AC-14 konsistente Radius/Border/Shadow/Spacing | ✅ **testgepinnt** | Input, Textarea und Select-Trigger teilen einen **identischen** 10-Token-Satz; Badge: 11 Varianten nach einem Muster; Dialog + Sheet gemeinsame Backdrop-Behandlung |
| AC-15 shadcn/Radix bleibt Basis | ✅ | Keine zweite Komponentenbibliothek; `framer-motion` hat 5 Konsumenten, davon 4 Graph-/Trajektorien-Ansichten — Motion, kein UI-System |
| AC-16 kein Textüberlauf/Überlappung mobil+Desktop | ✅ (chromium) | `scrollWidth <= clientWidth` auf `/login` und `/signup` bei 375 / 768 / 1440 px; Mobile-Safari env-gesperrt (PROJ-67/F2) |
| AC-17 Tailwind-Transitions zuerst, `motion-safe`/`motion-reduce` | ✅ mit Einschränkung | Tailwind-first ist eingehalten; der `motion-reduce`-Guard existiert aber nur an 2 Komponenten (3 Dateien, 7 Vorkommen) — siehe F-2 |
| AC-18 Motion-Library nur wo Tailwind nicht reicht | ✅ | 4 echte framer-motion-Stellen (Graph, Trajektorie, Bulk-Bar), nicht flächig; Bundle-Budget aus dem CIA-Review eingehalten |
| AC-19 View-Transition-API progressiv | ✅ | `useViewTransition` mit Feature-Detection + Server-Zweig, 4 Tests; opt-in über 4 CSS-Klassen, verdrahtet an `vt-tab-panel` |
| **AC-20 alle Animationen respektieren `prefers-reduced-motion`** | ❌ **FAIL** | **Befund F-2**, gemessen und ursächlich belegt — siehe unten |
| AC-21 Animationen verdecken keinen Lade-/Speicher-/PDF-Status | ✅ | `pdf_status` wird in drei expliziten Zweigen als Text/Badge gerendert **plus** Stale-Guard (`isPdfPendingStale` → `failed`): der Status kommt aus Daten, die Animation begleitet ihn |
| AC-22 Projektraum-Dashboard nutzt die neuen Tokens | ✅ | `health-snapshot.tsx` 0 Direktfarben; `project-detail-client.tsx` 18 Token-Treffer / 0 Direktfarben |
| AC-23 Kacheln zeigen Datenquellen und Leerzustände | ✅ | Datenquelle ausgeschrieben („Basis: Budget · Risiken · Termine · Stakeholder"), Leerzustände in Health-Snapshot und Detail-Client vorhanden |
| AC-24 Screenshot-/Playwright-Prüfung der Hauptscreens | ✅ **heute ausgeführt** | **13 Screenshot-Vergleiche grün** über die drei ε-Suiten (Login hell/dunkel, Signup, Dashboard, Projekte, Stammdaten, Ressourcen, Einstellungen, Tenant-Einstellungen, Projektraum), 5 Mobile-Safari-Fälle env-übersprungen |
| AC-25 Lint + Frontend-Tests grün, React-Compiler-Warnungen separat | ✅ | ESLint **0 Probleme** (exit 0, auch keine Warnungen), vitest **3647/3647**, Build clean; die React-Compiler-Warnungsklasse ist in PROJ-67 (AC-4/F3) separat abgehandelt |

### Befunde

**F-1 (Medium) — 109 tote Animations-Klassen: die Ein-/Ausblendungen der Radix-Primitiven laufen nicht.**
`tailwindcss-animate` ist **keine** Abhängigkeit und `tailwind.config.ts` hat `plugins: []`. Damit existieren
`animate-in`, `animate-out`, `fade-in-0`, `zoom-in-95` und `slide-in-from-*` im ausgelieferten Stylesheet
nicht — obwohl **9 Dateien sie an 109 Stellen tragen**: Dialog, Alert-Dialog, Sheet, Select, Popover,
Dropdown-Menu, Toast und Navigation-Menu. Sie erscheinen und verschwinden ohne jede Animation.
Belegt am Kompilat, nicht am Quelltext: es enthält genau **vier** Keyframes (`accordion-down`, `accordion-up`,
`pulse`, `spin`) und **null** `--tw-enter-*`-Variablen (die Signatur des Pakets); im Browser liefert eine Sonde
mit den wörtlichen `DialogContent`-Klassen `animationName: "none"`, während die Positivkontrolle
`animate-pulse` eine Animation liefert. Ladeanzeigen (`animate-spin`/`animate-pulse`, 259 Vorkommen)
funktionieren also — die Lücke ist genau die Enter-/Exit-Schicht.
**Nebenwirkung auf die Dokumentation:** die δ-Notiz begründet den Verzicht auf `<AnimatePresence>` mit
„Radix animiert bereits via CSS-`data-state`-Pattern; Framer würde konkurrieren". Diese Prämisse ist
**falsch** — es konkurriert nichts, weil nichts animiert. Die Entscheidung ist damit nicht widerlegt, aber
ihre Begründung trägt nicht mehr. → **PROJ-Y-51b**

**F-2 (Medium, Barrierefreiheit) — AC-20 verletzt: der `motion-reduce`-Guard am Button ist wirkungslos.**
Unter `prefers-reduced-motion: reduce` skaliert der Button beim Drücken **weiter** (`matrix(0.98, 0, 0, 0.98, 0, 0)`),
obwohl er `motion-reduce:transform-none` trägt. **Ursache gemessen, nicht vermutet:**
`active:scale-[0.98]` gibt `.active\:scale-\[0\.98\]:active` aus — Spezifität (0,2,0) —, während
`motion-reduce:transform-none` als `.motion-reduce\:transform-none` innerhalb der Media-Query landet — (0,1,0).
Die Zustandsregel gewinnt unabhängig von der Reihenfolge. Im Kontrollexperiment mit **angeglichener**
Spezifität (`…:disabled` innerhalb derselben Media-Query) kippt das Ergebnis sofort auf `none`.
Tragfähig wäre `motion-reduce:active:scale-100`. Der **Transitions**-Anteil des Guards greift dagegen
(gemessen: unter `reduce` ist `transition-property` nicht mehr `all`, sondern die Farbliste) — der Defekt ist
also auf den Transform-Anteil begrenzt und nicht „reduced motion ist kaputt".
Ein Code-Review konnte das nicht sehen: die Klasse steht da und sieht richtig aus. → **PROJ-Y-51c**

**F-3 (Low) — die Token-Bereinigung erodiert, weil nichts sie bewacht.**
Der α-Audit zählte **105** Tailwind-Direktfarb-Treffer in **26** Dateien und γ.5/γ.6 haben sie abgearbeitet.
Heute sind es **656 Treffer in 81 Dateien**. Das ist **nicht** PROJ-51 zuzurechnen: von zehn namentlich
migrierten Zielen sind **neun unverändert token-basiert** (`risk-banner`, `lifecycle-badge`,
`stakeholder-table`, `traffic-light-pill`, `utilization-heatmap`, `work-item-status-badge`,
`milestone-status-badge`, `risk-table`, `risk-matrix`); die zehnte (`phase-status-badge`) trug immer nur den
`completed`-Zweig im Umfang. Der Zuwachs kam mit den ~50 Slices danach — es gibt keine Regel, keinen
Lint und keinen Guard, der Direktfarben verhindert, während das Repo für Migrationsnamen, Index-Scope,
Funktionsinventar und Read-Log-Abdeckung längst Wächter hat. → **PROJ-Y-51d**

### Neue dauerhafte Nachweise (in dieser Slice geschrieben)

- `tests/PROJ-51-interaction-states.spec.ts` — **7 Fälle chromium grün**. Interaktionszustände und
  Reduced-Motion im Browser gemessen, jeder Block mit **Positiv- und Gegenkontrolle** (ohne die
  Gegenkontrolle beweist „kein Unterschied messbar" nichts). Die beiden Defekte F-1/F-2 sind als
  `test.fail()` kodiert: sie beschreiben den **Soll**-Zustand, gelten heute als erwartet rot und schlagen
  an, sobald jemand sie behebt — die Alternative, den Ist-Zustand zuzusichern, hätte die Fehler zementiert.
- `src/components/ui/design-system-contract.test.ts` — **35 Fälle**. Der Vertrag hinter AC-12/AC-14:
  jede Button-Variante braucht einen Hover-Zustand und erbt Focus-visible + Disabled; die `link`-Ausnahme
  ist als Entscheidung festgeschrieben; die drei Formular-Primitiven teilen einen Token-Satz.
  **Rot-Grün ausgeführt:** drei Sabotagen (fehlendes `disabled:opacity-50`, `ghost` ohne Hover, Input ohne
  `disabled:cursor-not-allowed`) → **8 rot**, nach Rücksetzung 35/35, Arbeitsbaum sauber.
- `src/lib/branding/contrast.test.ts` — **+12 Rot-Team-Fälle** (21 → 33). Der Brand-Hex fließt in eine
  CSS-Zeichenkette, die auf jede authentifizierte Seite geht; 10 Injektions-Nutzlasten
  (`red;}html{display:none}`, `#fff;}</style><script>…`, `var(--primary)`, `url(javascript:…)`,
  `expression(…)`, `0 0% 0%;--primary:…`, `!important`, …) werden von `parseHex` abgewiesen, der
  legitime Wert kommt weiter durch (Gegenkontrolle), und die erzeugten Werte enthalten nur Zahlen,
  Prozent und Leerzeichen. **Rot-Grün ausgeführt:** ohne die Prüfung in `parseHex` fallen **14** Fälle.

### Sicherheitsprüfung (Rot-Team)

Die einzige Angriffsfläche dieser Slice ist der Weg **Tenant-Branding → CSS**. Er ist geschlossen:
`parseHex` prüft strikt `^[0-9a-fA-F]{6}$` nach dem Abstreifen genau eines `#`, jeder andere Wert führt zu
`null` → `buildBrandStyleBlock` gibt `""` → kein `<style>`-Block. Die Injektion ist jetzt mit 12 Fällen
dauerhaft abgesichert (siehe oben). Kein neuer Endpunkt, keine RLS-Fläche, keine Migration, kein
Datenpfad — die übrigen Kriterien haben keine Sicherheitsdimension.

### Regressionen

- vitest **3647/3647** in 429 Dateien (Basis dieses Worktrees 3600/428, +47 aus dieser Slice)
- ESLint **0 Probleme**, exit 0 · `npm run build` clean · tsc **13 = Baseline**, keiner davon in einer neuen Datei
- Visual-Regression **13 grün / 5 env-übersprungen** — **ohne Neuaufnahme einer Baseline**
- `npm run check:index-scope` 0 Fehler

### Abweichungen

- **D-51-QA-1: Lifecycle-Status bleibt `Deployed`.** Die Skill-Checkliste verlangt „In Review" zum
  QA-Start; das wäre hier eine Falschaussage — der Code läuft seit 2026-05-07 in Produktion. Ein
  rückwirkender Durchgang bewertet, er nimmt die Auslieferung nicht zurück.
- **D-51-QA-2: Cross-Browser nur chromium.** Firefox ist nicht konfiguriert, Mobile-Safari-WebKit ist auf
  diesem Host env-gesperrt (offener Handoff PROJ-67/F2). Bestehende Praxis des Repos.
- **D-51-QA-3: Kein Urteil über Gestaltung.** „Wirkt moderner" (User-Story 3) und die Ästhetik der
  Schattenstaffelung sind nicht messbar und werden hier nicht behauptet. Was gezeigt ist: die
  Mechanismen existieren, greifen und sind gegen Drift gesichert. Die visuelle Abnahme im Browser bleibt
  beim Nutzer.
- **D-51-QA-4: Responsive nur auf den unauthentifizierten Seiten gemessen.** Die Überlauf-Sonde läuft auf
  `/login` und `/signup`; die authentifizierten Flächen sind über die 13 Screenshot-Baselines abgedeckt,
  aber nicht per Überlauf-Zusicherung bei 768 px.

### Produktionsreife

**READY** nach Hausmaßstab (0 Critical / 0 High) — und faktisch seit 15 Monaten in Produktion.
`full` ist trotzdem **nicht** buchbar: AC-20 ist eine ursprüngliche Anforderung, die literal unerfüllt ist,
und die Waiver-Regel scheitert an ihrer **ersten** Bedingung („nothing was deferred") — F-2 verlangt eine
Behebung und ist mit Ziel-ID registriert. Damit **`mvp`**: die gelieferte Grenze ist ein nutzbares,
ausdrücklich als MVP benanntes Design-System (die Implementierungsnotiz sagt selbst „PROJ-51-MVP ist
damit deployt"), jede Auslassung ist benannt und verfolgt.

Followups: **PROJ-Y-51b** (F-1) · **PROJ-Y-51c** (F-2) · **PROJ-Y-51d** (F-3).

## Deployment

_To be added by /deploy_

**Rückwirkend protokolliert im `/qa`-Durchgang 2026-08-24** — dieser Abschnitt stand seit 2026-05-07 auf
`_To be added by /deploy_`, obwohl die Slice-Familie inkrementell ausgeliefert wurde. Kein neuer
Runtime-Deploy: PROJ-51 ging in Einzel-Locks live, jede mit eigenem Vercel-Deployment.

- **β** `8b6cc25` / `7ccfc31` / `4063c6a` — Token-Bridge, WCAG-Helfer, Brand-Injection
  (`dpl_5i87fjVmDwLGThidqyYBrmGg58Ee` → `dpl_4AuFP9qj5LXE6KcUnyiKX7Wt5rub`)
- **β-Revision** `d418a26` — Light/Dark wiederhergestellt, Dark-Teal als opt-in-Preset
- **γ** `ec1e04d` / `c5f6979` / `0c28fc2` / `b4b6971` — Status-Tokens, Badge-Varianten,
  Button-/Card-Microinteractions, Backdrop-Blur (`dpl_79DKCiUeAggiPuZbwNEmMpTVWK62`)
- **γ.5 / γ.6** `8b56d8e` / `f372aba` + 4 Sub-Batches `ad10592` / `be7f451` / `f9a3424` / `dbf7fb0`
- **δ / δ.2 / δ.3** `d3eb718` / `64a738a` / `1735980` + Theme-Toggle `87b21cc`
- **Print-Theme** `b05d987` · **ε / ε.2 / ε.3 / ε.4+ε.5** `5ecdacf` / `72b0af2` / `a74e7f7` / `feba11e`
- **α** `bcc3146` — reine Dokumentation, kein `src/`-Diff (Nachweis für AC-6)

Keine Migration, kein neues Env/Secret, keine DB-Fläche. Der Nachweis der Auslieferung ist nicht der
Deploy-Eintrag, sondern das Verhalten: die 13 Screenshot-Vergleiche und die Browser-Messungen dieses
Durchgangs laufen gegen den heute ausgelieferten Stand.
