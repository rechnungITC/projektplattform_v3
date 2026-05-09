# PROJ-51-alpha: UI/UX Audit + Token Plan

## Status

Started 2026-05-06

## Goal

Start PROJ-51 with a low-risk foundation slice: audit the current UI, define the token surface for corporate colors and interaction states, and identify the first implementation targets. This slice intentionally avoids adding `motion` or page transitions until the static interaction layer is clean.

## Current Stack Findings

### Design Tokens

- `docs/design/design-system.md` defines the intended dark-teal Material-style palette.
- `tailwind.config.ts` already contains many V3 dashboard tokens as flat Tailwind colors.
- `src/app/globals.css` still uses shadcn default CSS variables for `background`, `primary`, `secondary`, `accent`, `ring`, etc.
- There is no shared token set yet for interaction duration, easing, hover lift, button shadow, press state, or reduced-motion policy.

### Corporate Branding

- PROJ-17 already added `tenants.branding` as JSONB.
- Tenant settings UI currently exposes `logo_url`.
- Report snapshots already read `branding.logo_url` and `branding.accent_color`.
- `src/app/(app)/layout.tsx` already exposes `branding.accent_color` as `--color-brand-600`.
- Missing: full corporate token set (`primary`, `secondary`, `focus`, `surface tint`, text-on-brand), contrast validation, and central component variants.

### Components

- The app uses local shadcn/Radix primitives in `src/components/ui`.
- `Button` currently uses only `transition-colors`, no shared hover lift/shadow/press token.
- `Badge` variants are simple color mappings and will need brand-aware but semantically safe variants.
- Sidebar, dialog, sheet, tabs, table, command, input, select, and toast are available as central refresh targets.

### Motion Baseline

- Existing motion is mostly CSS transitions (`transition-colors`, sidebar width transition, accordion keyframes).
- No `motion` / Motion for React dependency is installed.
- No global reduced-motion policy exists beyond what individual Tailwind classes may add later.

## Surface Audit Matrix

| Surface | Representative Files | Current State | Alpha Classification | Notes |
|---|---|---|---|---|
| Global app shell / sidebar | `src/components/app/global-sidebar.tsx`, `src/components/ui/sidebar.tsx`, `src/app/(app)/layout.tsx` | Uses shadcn/sidebar tokens plus tenant logo/accent bridge | Component refresh | Good first visible target for active nav, focus rings, and brand accent. |
| Project list | `src/app/(app)/projects/projects-list-client.tsx` | Standard cards/buttons/tables | Token-only refresh | Low-risk proof surface for button and card hover behavior. |
| Project detail / project room shell | `src/app/(app)/projects/[id]/project-detail-client.tsx`, `src/components/projects/project-room-shell.tsx` | Dense operational UI, method-aware nav | Component refresh | Needs scanability, active-section affordance, no hero-style redesign. |
| Planning / Gantt | `src/app/(app)/projects/[id]/planung/planung-client.tsx`, `src/components/phases/gantt-view.tsx` | Complex interactive surface with existing drag shadows | Workflow redesign later | Audit only in alpha; avoid broad visual churn until tokens are stable. |
| Backlog / WBS | `src/components/work-items/backlog-tree.tsx`, `backlog-list.tsx`, `backlog-board.tsx` | Data-dense, DnD-aware, many inline hover states | Component refresh | High value for row hover, selected state, drag affordance, focus. |
| Work-item dialogs/drawer | `new-work-item-dialog.tsx`, `edit-work-item-dialog.tsx`, `work-item-detail-drawer.tsx` | shadcn dialogs, raw JSON in some flows | Component refresh | Good candidate for dialog/drawer polish and loading state consistency. |
| Decisions / Open Items | `decisions-tab-client.tsx`, `open-items-panel.tsx` | Governance workflow with forms, cards, conversion actions | Token-only refresh | Keep semantics clear; destructive/decision actions must not be brand-colored blindly. |
| Stakeholders / Health | `stakeholder-tab-client.tsx`, `stakeholder-health-page-client.tsx`, `stakeholder-matrix.tsx` | Mix of matrix/cards/alerts | Component refresh | Brand colors should not override risk/health meaning. |
| Budget / Resources | `src/components/budget`, `src/components/resources` | Dense financial/resource views | Token-only refresh | Table/list consistency and focus states first. |
| Tenant settings | `src/components/settings/tenant/*` | Existing tenant admin forms; branding starts here | Workflow redesign | Needs corporate-color form, contrast preview, fallback warning. |
| Assistant entry points | PROJ-37/38/39 planned surfaces | Not built yet | Keep | Use PROJ-51 tokens once assistant shell exists. |

## Token Plan

### Base CSS Variables

These should live in `globals.css` and be fed by tenant branding when available:

| Token | Purpose | Default |
|---|---|---|
| `--brand-primary` | Tenant primary accent | current `--color-brand-600` fallback to shadcn primary |
| `--brand-primary-foreground` | Text/icon on primary brand | computed/validated accessible foreground |
| `--brand-secondary` | Optional secondary accent | V3 teal secondary fallback |
| `--brand-secondary-foreground` | Text/icon on secondary brand | computed/validated accessible foreground |
| `--brand-focus` | Focus ring / active outline | brand primary fallback |
| `--brand-surface` | Subtle brand-tinted surface | low-alpha primary mix or neutral fallback |
| `--brand-border` | Brand-aware border | low-alpha primary mix |

### Interaction Variables

| Token | Purpose | Proposed Default |
|---|---|---|
| `--motion-duration-fast` | hover/focus feedback | `120ms` |
| `--motion-duration-base` | button/menu/drawer micro states | `180ms` |
| `--motion-ease-standard` | default easing | `cubic-bezier(0.2, 0, 0, 1)` |
| `--motion-ease-emphasized` | open/close emphasis | `cubic-bezier(0.2, 0, 0, 1)` |
| `--shadow-button` | subtle actionable elevation | `0 1px 2px rgb(15 23 42 / 0.10)` |
| `--shadow-button-hover` | hover elevation | `0 4px 10px rgb(15 23 42 / 0.14)` |
| `--translate-button-hover` | hover lift | `-1px` |

### Component Targets

First implementation targets for beta:

1. `src/components/ui/button.tsx`
   - Add brand-safe variant and central hover/shadow behavior.
   - Keep `destructive` semantically red/destructive.
   - Add `motion-reduce:transform-none` when hover lift is used.

2. `src/components/ui/badge.tsx`
   - Add restrained `brand` or `accent` variant for non-status labels.
   - Keep status/risk/priority badges domain-colored.

3. `src/components/ui/sidebar.tsx` and `src/components/app/global-sidebar.tsx`
   - Apply brand focus/active navigation tokens.
   - Keep module-disabled and permission states visually distinct.

4. `src/components/settings/tenant/base-data-section.tsx`
   - Extend branding form to include accent/corporate color fields.
   - Add preview swatches and contrast warnings.

## First High-Value Targets

1. **Tenant settings branding**
   - Reason: source of corporate colors; admins need a controlled place to configure them.
   - Risk: low-to-medium because `tenants.branding` already exists, but schema validation must be tightened.

2. **Button + focus token refresh**
   - Reason: immediate consistency across the whole app.
   - Risk: medium because `Button` is widely used. Requires visual QA on destructive and disabled actions.

3. **Global sidebar active/hover treatment**
   - Reason: visible on every authenticated page and already uses tenant logo.
   - Risk: low if token-only.

## Alpha Acceptance Checklist

- [ ] Confirm exact `tenants.branding` shape and decide whether PROJ-51 beta needs a migration or JSON-only extension.
- [ ] Define default brand tokens in `globals.css`.
- [ ] Define contrast validation rules for admin-entered colors.
- [ ] Decide whether brand colors may be tenant-specific runtime CSS variables only, or also Tailwind theme entries.
- [ ] Identify Playwright screenshot routes for the first visual pass.
- [ ] Do not add Motion for React in alpha.

## Recommended Next Implementation Slice

Start with a narrow beta spike:

1. Extend tenant branding data shape and UI with `accent_color` if missing from the form.
2. Bridge `accent_color` into full brand CSS variables in `src/app/(app)/layout.tsx`.
3. Add token-driven button hover/shadow behavior in `src/components/ui/button.tsx`.
4. Run visual smoke checks on:
   - `/projects`
   - `/settings/tenant`
   - one project-room page
   - one destructive-confirm dialog

## 51-beta Spike Notes

Started after the alpha audit:

- `accent_color` was already present in the tenant branding type, API schema, and base-data form, so no database migration or type expansion is needed for the first slice.
- `globals.css` now owns brand and interaction defaults (`--brand-*`, `--motion-*`, `--shadow-button*`).
- `src/app/(app)/layout.tsx` maps tenant `branding.accent_color` to full brand CSS variables server-side, keeping the old `--color-brand-600` bridge for existing consumers.
- `Button` gained centralized hover/shadow/press/focus behavior and a `brand` variant.
- `Badge` gained a restrained `brand` variant for non-semantic labels and previews; domain/status/risk badges keep their existing semantic colors.
- Tenant base-data settings now show a brand-button preview and WCAG-style contrast ratio with automatic foreground selection.
- Sidebar menu buttons and sub-menu buttons now use brand focus/surface tokens for hover, active, and focus-visible states.
- Brand color validation, normalization, foreground selection, and contrast calculation now live in `src/lib/brand-colors.ts`; app layout and tenant settings use the same helper to avoid divergent corporate-color behavior.
- Form primitives (`Input`, `Textarea`, `SelectTrigger`) now use the brand focus token and shared motion timing for focus feedback.
- Project-Room `HealthSnapshot` now loads live budget, risk, schedule, and stakeholder-health data from `/api/projects/[id]/health-summary`; report snapshots freeze the same `project_health` payload. Formula details live in `docs/design/project-health-summary.md`.

Deferred from beta:

- Secondary brand color and surface tint admin fields.
- Playwright screenshot baseline.
