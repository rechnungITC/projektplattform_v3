# PROJ-51-α — Token-Diff: shadcn ↔ Material-3 ↔ Ziel-Theme

> **α-Deliverable 1 von 2.** Begleitdokument zu `features/PROJ-51-modern-ui-ux-motion-system.md`. Kein Code-Change in α — dieser Audit ist die Grundlage für die β-Token-Bridge.

## Quellen

| Quelle | Inhalt |
|---|---|
| `src/app/globals.css` | **Aktiv** — shadcn-Default-HSL, Light + Dark, beide auf Slate-Basis |
| `tailwind.config.ts` | Dark-Teal-Hex-Werte als statische Tailwind-Utility-Classes (ohne CSS-Var-Bindung) — **toter Code für shadcn-Primitives** |
| `docs/design/design-system.md` | **Ziel** — Material-3 Dark-Teal-Theme, vollständige Token-Liste |
| `docs/design/dashboards/*.html` | 7 Visual-Referenz-HTML-Templates (Scrum, PMI, Budget, Dependencies, Stakeholder-Matrix, Stakeholder-Persona, WP-Eval) |

## Ist-Stand: Drei Token-Welten

```
┌──────────────────────┐         ┌──────────────────────┐
│  globals.css         │  ←──────│  shadcn UI (40 Stk.)  │
│  HSL-Vars (Slate)    │  liest  │  src/components/ui/   │
│  --background, ...   │         │                       │
└──────────────────────┘         └──────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│  tailwind.config.ts  │  ←──────│  Dashboard-Templates  │
│  Hex-Utility-Classes │  liest  │  docs/design/         │
│  bg-surface-*, ...   │         │  dashboards/*.html    │
└──────────────────────┘         └──────────────────────┘

  KEINE Verbindung zwischen den beiden Welten
  → shadcn-Primitives sehen NIE die Dark-Teal-Farben
```

## Ziel-Stand nach β

```
┌──────────────────────┐
│  globals.css         │  ←──── alle shadcn UI + Dashboards
│  HSL-Vars (Dark-Teal)│       lesen aus EINEM Token-Set
│  --background        │
│  --primary           │
│  --surface-container-low (NEU)
│  --primary-container (NEU)
│  --brand-* (Tenant-Override-Slot, NEU)
└──────────────────────┘
```

## Token-Diff-Tabelle

### Core-Tokens (in shadcn → werden remappt auf Dark-Teal)

| shadcn-Var | Heute (Slate-HSL) | Dark-Teal-Hex (Ziel) | Dark-Teal-HSL (Ziel) | Material-3-Quelle |
|---|---|---|---|---|
| `--background` | `0 0% 100%` (Light) / `240 10% 3.9%` (Dark) | `#0b1326` | `222 56% 9%` | `background` |
| `--foreground` | `240 10% 3.9%` / `0 0% 98%` | `#dae2fd` | `225 90% 92%` | `on-background` |
| `--card` | `0 0% 100%` / `240 10% 3.9%` | `#131b2e` | `224 41% 13%` | `surface-container-low` |
| `--card-foreground` | wie foreground | `#dae2fd` | `225 90% 92%` | `on-surface` |
| `--popover` | `0 0% 100%` / `240 10% 3.9%` | `#171f33` | `225 38% 14%` | `surface-container` |
| `--popover-foreground` | wie foreground | `#dae2fd` | `225 90% 92%` | `on-surface` |
| `--primary` | `240 5.9% 10%` / `0 0% 98%` | `#a1cfd1` | `183 32% 73%` | `primary` |
| `--primary-foreground` | `0 0% 98%` / `240 5.9% 10%` | `#013739` | `184 96% 12%` | `on-primary` |
| `--secondary` | `240 4.8% 95.9%` / `240 3.7% 15.9%` | `#bec8c9` | `184 9% 77%` | `secondary` |
| `--secondary-foreground` | `240 5.9% 10%` / `0 0% 98%` | `#283233` | `184 11% 18%` | `on-secondary` |
| `--muted` | `240 4.8% 95.9%` / `240 3.7% 15.9%` | `#222a3d` | `224 28% 19%` | `surface-container-high` |
| `--muted-foreground` | `240 3.8% 46.1%` / `240 5% 64.9%` | `#c0c8c8` | `180 7% 77%` | `on-surface-variant` |
| `--accent` | wie muted | `#3b6769` | `183 28% 32%` | `primary-container` |
| `--accent-foreground` | wie foreground | `#b5e3e5` | `183 53% 80%` | `on-primary-container` |
| `--destructive` | `0 84% 60%` | `#ffb4ab` | `5 100% 84%` | `error` |
| `--destructive-foreground` | `0 0% 98%` | `#690005` | `2 100% 21%` | `on-error` |
| `--border` | `240 5.9% 90%` / `240 3.7% 15.9%` | `#404848` | `180 4% 27%` | `outline-variant` |
| `--input` | wie border | `#404848` | `180 4% 27%` | `outline-variant` |
| `--ring` | `240 5.9% 10%` / `240 4.9% 83.9%` | `#a1cfd1` | `183 32% 73%` | `primary` |

### Erweiterungs-Tokens (NEU in `globals.css` — bisher nicht vorhanden)

Diese decken Dashboard-Templates ab und erweitern den shadcn-Default-Satz:

| Neue Var | Hex | HSL | Material-3-Token | Verwendung |
|---|---|---|---|---|
| `--surface` | `#0b1326` | `222 56% 9%` | `surface` | Plain-Surface ohne Container-Hierarchy |
| `--surface-bright` | `#31394d` | `224 18% 24%` | `surface-bright` | Highlights |
| `--surface-container-lowest` | `#060e20` | `222 65% 8%` | `surface-container-lowest` | Tiefste Container-Schicht |
| `--surface-container-low` | `#131b2e` | `224 41% 13%` | `surface-container-low` | Standard-Cards (alias `--card`) |
| `--surface-container` | `#171f33` | `225 38% 14%` | `surface-container` | Mid-Container |
| `--surface-container-high` | `#222a3d` | `224 28% 19%` | `surface-container-high` | High-Emphasis |
| `--surface-container-highest` | `#2d3449` | `224 23% 23%` | `surface-container-highest` | Topmost-Container |
| `--surface-variant` | `#2d3449` | `224 23% 23%` | `surface-variant` | Borders / Subtle Fills |
| `--surface-tint` | `#a1cfd1` | `183 32% 73%` | `surface-tint` | Elevation-Tint |
| `--on-surface` | `#dae2fd` | `225 90% 92%` | `on-surface` | Default-Surface-Text |
| `--on-surface-variant` | `#c0c8c8` | `180 7% 77%` | `on-surface-variant` | Muted-Secondary-Text |
| `--inverse-surface` | `#dae2fd` | `225 90% 92%` | `inverse-surface` | Tooltips / Snackbars |
| `--inverse-on-surface` | `#283044` | `222 25% 21%` | `inverse-on-surface` | Text auf Inverse |
| `--inverse-primary` | `#396567` | `183 30% 31%` | `inverse-primary` | Primary auf Light |
| `--outline` | `#8a9292` | `180 5% 56%` | `outline` | Strong Borders |
| `--primary-fixed` | `#bdebed` | `183 60% 84%` | `primary-fixed` | Brighter-Primary-Fill |
| `--primary-container` | `#3b6769` | `183 28% 32%` | `primary-container` | Primary-Button-BG (alias `--accent`) |
| `--on-primary-container` | `#b5e3e5` | `183 53% 80%` | `on-primary-container` | Text auf Primary-Container |
| `--on-primary-fixed` | `#002021` | `183 100% 6%` | `on-primary-fixed` | Text auf Primary-Fixed |
| `--on-primary-fixed-variant` | `#204d4f` | `183 42% 22%` | `on-primary-fixed-variant` | Subdued-Primary-Text |
| `--secondary-fixed` | `#dae5e5` | `180 17% 87%` | `secondary-fixed` | Brighter-Secondary-Fill |
| `--secondary-container` | `#3e494a` | `186 9% 27%` | `secondary-container` | Secondary-Chip / Badge-BG |
| `--on-secondary-container` | `#acb7b8` | `186 6% 70%` | `on-secondary-container` | Text auf Secondary-Container |
| `--on-secondary-fixed` | `#131d1e` | `186 21% 9%` | `on-secondary-fixed` | Text auf Secondary-Fixed |
| `--on-secondary-fixed-variant` | `#3e494a` | `186 9% 27%` | `on-secondary-fixed-variant` | Subdued-Secondary-Text |
| `--tertiary` | `#ffb59f` | `12 100% 81%` | `tertiary` | Warm-Accent (Warnings, Delays) |
| `--tertiary-fixed` | `#ffdbd1` | `12 100% 91%` | `tertiary-fixed` | Brighter-Tertiary-Fill |
| `--tertiary-container` | `#ac3811` | `13 82% 37%` | `tertiary-container` | Tertiary-Fill-BG |
| `--on-tertiary` | `#5f1600` | `14 100% 19%` | `on-tertiary` | Text auf Tertiary |
| `--on-tertiary-container` | `#ffd1c4` | `14 100% 88%` | `on-tertiary-container` | Text auf Tertiary-Container |
| `--on-tertiary-fixed` | `#3a0a00` | `12 100% 11%` | `on-tertiary-fixed` | Text auf Tertiary-Fixed |
| `--on-tertiary-fixed-variant` | `#862300` | `14 100% 26%` | `on-tertiary-fixed-variant` | Subdued-Tertiary-Text |
| `--error-container` | `#93000a` | `357 100% 29%` | `error-container` | Error-Fill-BG |
| `--on-error-container` | `#ffdad6` | `4 100% 92%` | `on-error-container` | Text auf Error-Container |
| `--outline-variant` | `#404848` | `180 4% 27%` | `outline-variant` | Subtle-Borders (alias `--border`) |

### Brand-Layer (Tenant-Branding, NEU)

Drei opt-in Tokens für gezielte Brand-Slots — **NICHT** für funktionale Semantik (Active/Focus/Disabled):

| Brand-Var | Default (Plattform) | Wenn Tenant-Brand gesetzt | Verwendung |
|---|---|---|---|
| `--brand-accent` | gleicher Wert wie `--primary` | aus `tenants.branding.primary_hex` | Primary-CTA-Button, Logo-Akzent |
| `--brand-accent-foreground` | gleicher Wert wie `--primary-foreground` | WCAG-1.4-Auto: schwarz/weiß je nach Brand-Hex-Helligkeit | Text auf Brand-CTA |
| `--brand-nav-active` | gleicher Wert wie `--primary` | aus `tenants.branding.primary_hex` | Active-Nav-Indikator (Sidebar) |

### Spacing-Scale (Tailwind-Aliases ergänzen)

| Token | Heute | Ziel (Material-3) | Aktion |
|---|---|---|---|
| `base` | — | `4px` | NEU als `theme.extend.spacing.base = "4px"` |
| `xs` | — | `8px` | NEU |
| `sm` | — | `12px` | NEU |
| `md` | — | `16px` | NEU |
| `lg` | — | `24px` | NEU |
| `gutter` | — | `24px` (alias `lg`) | NEU |
| `xl` | — | `32px` | NEU |
| `margin` | — | `32px` (alias `xl`) | NEU |
| `xxl` | — | `48px` | NEU |

### Typography-Scale

| Token | Heute | Ziel | Aktion |
|---|---|---|---|
| Default-Font | shadcn nutzt System-Stack | Inter (`@import` bereits in `globals.css` da) | β: `font-family: Inter, system-ui` setzen |
| Icon-Font | Lucide-React | Material Symbols Outlined (Import bereits in `globals.css`) | Beibehalten beide; M-Symbols als neue Icon-Quelle für Dashboards |
| `display` | — | `48px / 1.1 / 700 / -0.02em` | β: `theme.extend.fontSize.display` |
| `h1` | — | `32px / 1.2 / 600 / -0.02em` | β: `theme.extend.fontSize.h1` |
| `h2` | — | `24px / 1.3 / 600 / -0.01em` | β |
| `h3` | — | `20px / 1.4 / 600` | β |
| `body-lg` | — | `18px / 1.6 / 400` | β |
| `body-md` | — | `16px / 1.6 / 400` | β |
| `body-sm` | — | `14px / 1.5 / 400` | β |
| `label-md` | — | `14px / 1 / 500 / 0.01em` | β |
| `label-sm` | — | `12px / 1 / 600 / 0.05em` | β |

### Border-Radius

| Token | Heute (`globals.css`) | Ziel | Aktion |
|---|---|---|---|
| `--radius` | `0.5rem` (8px) | beibehalten | unverändert |
| `--radius-default` | — | `0.25rem` (4px) | NEU |
| `--radius-xl` | — | `0.75rem` (12px) | NEU |
| `--radius-full` | — | `9999px` | NEU |

## Sidebar-Spezial (PROJ-23-Erbe)

PROJ-23 hat eigene `--sidebar-*`-Vars. β-Mapping:

| Sidebar-Var | Heute (Slate) | Ziel (Dark-Teal) |
|---|---|---|
| `--sidebar-background` | `0 0% 98%` / `240 5.9% 10%` | `#060e20` (`surface-container-lowest`) |
| `--sidebar-foreground` | `240 5.3% 26.1%` / `240 4.8% 95.9%` | `#dae2fd` (`on-surface`) |
| `--sidebar-primary` | `240 5.9% 10%` / `224.3 76.3% 48%` | `#a1cfd1` (`primary`) |
| `--sidebar-primary-foreground` | `0 0% 98%` / `0 0% 100%` | `#013739` (`on-primary`) |
| `--sidebar-accent` | `240 4.8% 95.9%` / `240 3.7% 15.9%` | `#171f33` (`surface-container`) |
| `--sidebar-accent-foreground` | `240 5.9% 10%` / `240 4.8% 95.9%` | `#dae2fd` (`on-surface`) |
| `--sidebar-border` | `220 13% 91%` / `240 3.7% 15.9%` | `#404848` (`outline-variant`) |
| `--sidebar-ring` | `217.2 91.2% 59.8%` | `#a1cfd1` (`primary`) |

## Light-Mode-Strategie

**MVP: Dark-only.** Spec liest sich Dark-first. Light-Mode ist dokumentiert als deferred-PROJ-53-Kandidat. β liefert daher:

- `:root` mit Dark-Teal-Token-Set (Default)
- `.dark`-Class wird **nicht** mehr benötigt (Dark ist Default)
- Light-Mode-Migrationspfad: zweiter Block `:root[data-theme="light"]` mit hellen Token-Werten — additiv, kein Architektur-Bruch

## Kontrast-Audit (WCAG 2.1 AA — Pflicht-Check vor β-Deploy)

Critical pairs zu validieren in β:

| Token-Paar | Anforderung | Erwartung |
|---|---|---|
| `--foreground` (`#dae2fd`) auf `--background` (`#0b1326`) | ≥ 4.5:1 (Body) | ✓ ~14:1 (sehr gut) |
| `--on-primary` (`#013739`) auf `--primary` (`#a1cfd1`) | ≥ 4.5:1 | ✓ ~7.5:1 |
| `--on-primary-container` (`#b5e3e5`) auf `--primary-container` (`#3b6769`) | ≥ 4.5:1 | ✓ ~5.2:1 |
| `--muted-foreground` (`#c0c8c8`) auf `--background` (`#0b1326`) | ≥ 4.5:1 | ✓ ~10:1 |
| `--destructive-foreground` (`#690005`) auf `--destructive` (`#ffb4ab`) | ≥ 4.5:1 | ✓ ~6:1 |
| `--on-tertiary-container` (`#ffd1c4`) auf `--tertiary-container` (`#ac3811`) | ≥ 4.5:1 | ✓ ~6.5:1 |

→ Alle Critical-Paare WCAG-AA-konform per Augenmaß; β liefert konkrete Lighthouse-Validierung.

## Out-of-Scope für α

- Implementierung der Token-Bridge (β)
- WCAG-APCA-Migration (β.2 nur falls nötig)
- Custom-Brand-Hex-Foreground-Auto-Berechnung (β2-Helper)
- Charts (Recharts/Tremor) — eigener Slice
- Print-CSS für PROJ-21 PDF-Render — bleibt PROJ-21-Pfad
