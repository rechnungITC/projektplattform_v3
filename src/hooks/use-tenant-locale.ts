/**
 * PROJ-53-β-ST-06 (CIA-D6) — Tenant locale hook.
 *
 * In β this is a deliberate no-op that always returns `"de-DE"`. The
 * indirection exists so γ can flip every date-formatter in the Gantt
 * timeline over to `tenants.locale` without a call-site refactor.
 *
 * Why this lives in its own file instead of inside `gantt-view.tsx`:
 *   - `gantt-timeline.ts` is pure (no React) and uses module-level
 *     `Intl.DateTimeFormat` instances. γ will refactor those into
 *     functions that accept a `locale` argument. Until then, the
 *     hook stays read-only and stable.
 */

export function useTenantLocale(): string {
  return "de-DE"
}
