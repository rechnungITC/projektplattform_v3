# V3 Design System (Dark-Teal Theme)

Extracted from the seven dashboard templates in [`./dashboards/`](./dashboards/). All seven templates use the **same tokens**; this document is the canonical source.

## Color Palette

### Material-3-style semantic tokens (recommended for new components)

| Token | Hex | Usage |
|---|---|---|
| `background` | `#0b1326` | Page background |
| `surface` | `#0b1326` | Plain surfaces |
| `surface-dim` | `#0b1326` | Dim variant of surface |
| `surface-bright` | `#31394d` | Bright surface variant for highlights |
| `surface-container-lowest` | `#060e20` | Deepest container layer |
| `surface-container-low` | `#131b2e` | Cards, panels — most common container |
| `surface-container` | `#171f33` | Mid container layer |
| `surface-container-high` | `#222a3d` | High-emphasis container |
| `surface-container-highest` | `#2d3449` | Topmost container |
| `surface-variant` | `#2d3449` | Borders, dividers, subtle fills |
| `inverse-surface` | `#dae2fd` | Tooltips, snackbars (light on dark) |
| `outline` | `#8a9292` | Strong borders |
| `outline-variant` | `#404848` | Subtle borders (most common) |
| `primary` | `#a1cfd1` | Brand teal — active states, links, primary text-on-dark |
| `primary-fixed` | `#bdebed` | Brighter primary fill |
| `primary-fixed-dim` | `#a1cfd1` | Same as primary |
| `primary-container` | `#3b6769` | Primary button backgrounds |
| `on-primary` | `#013739` | Text on primary fill |
| `on-primary-container` | `#b5e3e5` | Text on primary-container |
| `on-primary-fixed` | `#002021` | Text on primary-fixed |
| `on-primary-fixed-variant` | `#204d4f` | Subdued primary text |
| `inverse-primary` | `#396567` | Primary on light surfaces |
| `secondary` | `#bec8c9` | Secondary text/icons |
| `secondary-fixed` | `#dae5e5` | Secondary fill |
| `secondary-fixed-dim` | `#bec8c9` | Same as secondary |
| `secondary-container` | `#3e494a` | Secondary chip / badge background |
| `on-secondary` | `#283233` | Text on secondary |
| `on-secondary-container` | `#acb7b8` | Text on secondary-container |
| `on-secondary-fixed` | `#131d1e` | Text on secondary-fixed |
| `on-secondary-fixed-variant` | `#3e494a` | Subdued secondary text |
| `tertiary` | `#ffb59f` | Warm accent (warnings, delays) |
| `tertiary-fixed` | `#ffdbd1` | Brighter tertiary fill |
| `tertiary-fixed-dim` | `#ffb59f` | Same as tertiary |
| `tertiary-container` | `#ac3811` | Tertiary fill background |
| `on-tertiary` | `#5f1600` | Text on tertiary |
| `on-tertiary-container` | `#ffd1c4` | Text on tertiary-container |
| `on-tertiary-fixed` | `#3a0a00` | Text on tertiary-fixed |
| `on-tertiary-fixed-variant` | `#862300` | Subdued tertiary text |
| `error` | `#ffb4ab` | Errors, blocked states |
| `error-container` | `#93000a` | Error fill background |
| `on-error` | `#690005` | Text on error |
| `on-error-container` | `#ffdad6` | Text on error-container |
| `on-background` | `#dae2fd` | Default page text |
| `on-surface` | `#dae2fd` | Default surface text |
| `on-surface-variant` | `#c0c8c8` | Muted secondary text |
| `inverse-on-surface` | `#283044` | Text on inverse surfaces |
| `surface-tint` | `#a1cfd1` | Elevation tint |

### Plain Tailwind aliases used in nav / chrome

The templates also use Tailwind's built-in `slate-*` and `teal-*` for the top nav and side nav. These pair cleanly with the Material tokens:

| Tailwind | Hex | Usage |
|---|---|---|
| `slate-950` | — | Side nav background |
| `slate-900/80` | — | Top nav background (with backdrop-blur) |
| `slate-800` | — | Nav borders |
| `slate-400` | — | Nav inactive item text |
| `slate-100` / `slate-50` | — | Nav active item text / brand text |
| `teal-400` / `teal-500` / `teal-600` | — | Active nav indicators, CTA buttons |

> The PMI dashboard template originally used `indigo-*` accents — those have been substituted for `teal-*` here so all seven templates match.

## Spacing scale

| Token | Value |
|---|---|
| `base` | 4px |
| `xs` | 8px |
| `sm` | 12px |
| `md` | 16px |
| `lg` | 24px |
| `gutter` | 24px (alias for `lg`) |
| `xl` | 32px |
| `margin` | 32px (alias for `xl`) |
| `xxl` | 48px |

## Typography

| Token | Size / line-height / weight / tracking |
|---|---|
| `display` | 48px / 1.1 / 700 / -0.02em |
| `h1` | 32px / 1.2 / 600 / -0.02em |
| `h2` | 24px / 1.3 / 600 / -0.01em |
| `h3` | 20px / 1.4 / 600 |
| `body-lg` | 18px / 1.6 / 400 |
| `body-md` | 16px / 1.6 / 400 |
| `body-sm` | 14px / 1.5 / 400 |
| `label-md` | 14px / 1 / 500 / 0.01em |
| `label-sm` | 12px / 1 / 600 / 0.05em |

Font family: **Inter** (`Inter:wght@400;500;600;700;900`) for everything.

Icon family: **Material Symbols Outlined** (`Material+Symbols+Outlined:wght,FILL@100..700,0..1`).

## Border radius

| Token | Value |
|---|---|
| `DEFAULT` | 0.25rem (4px) |
| `lg` | 0.5rem (8px) |
| `xl` | 0.75rem (12px) |
| `full` | 9999px |

## Patterns

### Card

```html
<div class="bg-surface-container-low rounded-lg border border-outline-variant p-lg">
  ...
</div>
```

### Subtle grid background (canvas areas)

```css
background-image: linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px);
background-size: 32px 32px;
```

### Status badge

```html
<!-- On track / advocate -->
<span class="bg-secondary/10 text-secondary border border-secondary/20 rounded-full px-2 py-0.5 font-label-sm text-label-sm">On Track</span>

<!-- Delayed / detractor / warning -->
<span class="bg-tertiary/10 text-tertiary border border-tertiary/20 rounded-full px-2 py-0.5 font-label-sm text-label-sm">Delayed</span>

<!-- At risk / blocked / error -->
<span class="bg-error/10 text-error border border-error/20 rounded-full px-2 py-0.5 font-label-sm text-label-sm">At Risk</span>

<!-- Critical path / advocate -->
<span class="bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-label-sm text-label-sm">Critical Path</span>
```

### Progress bar

```html
<div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
  <div class="h-full bg-primary rounded-full" style="width: 68%;"></div>
</div>
```

## How to apply this in V3

The tokens above are **not yet** wired into V3's `tailwind.config.ts` / `globals.css`. PROJ-1 and PROJ-2 use the shadcn defaults shipped with the starter kit.

**When the first dashboard feature lands** (likely PROJ-7 Project Room), the tokens above should be added to `tailwind.config.ts` (`theme.extend.colors` etc.) and to `globals.css` as CSS variables, so that shadcn primitives (`Card`, `Badge`, `Table`) automatically pick up the dark-teal theme. The migration is a one-time effort and does not require changes to existing PROJ-1 / PROJ-2 components beyond visual reskinning.

Until then, treat this document as the **target visual language** — anything new should be designed to fit it, even if implemented with shadcn defaults today.
