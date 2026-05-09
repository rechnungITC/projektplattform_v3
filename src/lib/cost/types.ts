/**
 * PROJ-24 — Cost-Stack shared types.
 *
 * The engine in `calculate-work-item-costs.ts` is pure-TS and deterministic;
 * it MUST NOT import from `@supabase/supabase-js`. The DB-bound layer in
 * `role-rate-lookup.ts` resolves rates against `_resolve_role_rate` via the
 * service-role admin client and shapes the engine input.
 *
 * Field semantics:
 *   - `WorkItemCostInput.story_points` and `estimated_duration_days` are
 *     pre-extracted from `work_items.attributes` JSONB by the caller. They
 *     are NOT native columns on `work_items` (see migration
 *     `20260428110000_proj9_work_items_sprints_dependencies.sql`).
 *   - `AllocationInput.role_key` is pre-resolved from the chain
 *     `work_item_resources → resources.source_stakeholder_id →
 *      stakeholders.role_key`. The engine itself does not traverse joins.
 *   - `RoleRateSnapshot[]` is a pre-resolved batch of the latest applicable
 *     rates at `work_item.created_at`, one per (tenant, role_key). The
 *     resolver is in `role-rate-lookup.ts`.
 */

/**
 * One applicable role rate, as resolved by `_resolve_role_rate(...)` for a
 * given `(tenant_id, role_key, as_of_date)` triple.
 */
export interface RoleRateSnapshot {
  /** Tenant boundary — the engine matches by role_key only and trusts the
   *  caller has filtered by tenant before invoking. Kept for symmetry and
   *  for future multi-tenant sanity checks. */
  tenant_id: string
  role_key: string
  /** Daily rate as numeric — typed as number for arithmetic. The DB column
   *  is `numeric(10,2)`; coercion happens in the lookup layer. */
  daily_rate: number
  /** ISO 4217 currency code (3 letters, uppercase). */
  currency: string
  /** ISO date string (YYYY-MM-DD) of the rate's applicable start date. */
  valid_from: string
}

/**
 * PROJ-54-α — One resolved daily-rate per resource, returned by
 * `_resolve_resource_rate(...)` and the `resolveResourceRates()` lookup
 * layer. Source-discriminated:
 *   - `'override'` — taken directly from `resources.daily_rate_override`.
 *     `role_key` is null and `valid_from` is null (no version date in α).
 *   - `'role'` — derived from the role-rate chain
 *     `resources.source_stakeholder_id → stakeholders.role_key → role_rates`.
 *
 * Resolution-order in the SQL helper: override wins; otherwise the latest
 * role_rate with `valid_from <= as_of_date`; otherwise the helper returns
 * no row (caller surfaces the `no_rate_resolved` warning).
 */
export interface ResolvedRate {
  tenant_id: string
  /** Source-discriminator. */
  source: "override" | "role"
  /** Set when `source === 'role'`; null for overrides. */
  role_key: string | null
  /** Set when `source === 'override'`; null for role-based resolutions. */
  resource_id: string | null
  daily_rate: number
  currency: string
  /** Set when `source === 'role'`; null for overrides (Latest-only in α). */
  valid_from: string | null
}

/**
 * The engine's view of a single allocation on a work-item. The caller
 * pre-resolves `role_key` and `source_stakeholder_id` from the
 * `work_item_resources × resources × stakeholders` join chain; either may
 * be null if the chain is broken (e.g. resource without stakeholder, or
 * stakeholder without role_key) — the engine emits warnings accordingly.
 */
export interface AllocationInput {
  allocation_id: string
  resource_id: string
  /** Percentage 0..100. NULL or values <= 0 produce no cost-line and no
   *  warning (allocation effectively disabled). */
  allocation_pct: number | null
  /** Pre-resolved from stakeholder.role_key. NULL → warning `no_role_key`. */
  role_key: string | null
  /** Pre-resolved from resources.source_stakeholder_id. NULL plus null
   *  role_key → warning `no_stakeholder`. */
  source_stakeholder_id: string | null
}

/**
 * The engine's view of the work-item the cost-lines belong to. The caller
 * extracts `story_points` and `estimated_duration_days` from
 * `work_items.attributes` JSONB.
 */
export interface WorkItemCostInput {
  work_item_id: string
  /** One of `'epic' | 'feature' | 'story' | 'task' | 'subtask' | 'bug' |
   *  'work_package'`. The engine routes SP-based costing only to `story`
   *  and duration-based costing to all kinds that carry an
   *  `estimated_duration_days` value. */
  kind: string
  /** Pulled from `attributes.story_points`. NULL when absent. */
  story_points: number | null
  /** Pulled from `attributes.estimated_duration_days`. NULL when absent. */
  estimated_duration_days: number | null
  /** ISO timestamp — used by the lookup layer to pick the rate cutoff. The
   *  engine itself does not consume this field, but it is part of the
   *  engine input contract for symmetry and to keep all
   *  `(work_item, allocations, role_rates)` data traveling together. */
  created_at: string
}

/**
 * One drafted cost-line. Caller (24-γ API route or 24-δ resource hook) is
 * responsible for adding `id`, `created_at`, `created_by`, `tenant_id`,
 * `project_id` and persisting via the service-role admin client.
 */
export interface CostLineDraft {
  work_item_id: string
  source_type: "resource_allocation"
  amount: number
  currency: string
  source_ref_id: string
  source_metadata: Record<string, unknown>
}

export type CostCalcWarningKind =
  | "no_role_key"
  | "no_stakeholder"
  | "no_rate_for_role"
  | "no_basis"

export interface CostCalcWarning {
  /** NULL for item-level warnings (e.g. `no_basis`). */
  allocation_id: string | null
  kind: CostCalcWarningKind
  detail: string
}

export interface CostCalcResult {
  cost_lines: CostLineDraft[]
  warnings: CostCalcWarning[]
}

/**
 * Lookup-key shape for `resolveRoleRates`. The lookup layer dedupes
 * identical keys before issuing RPC calls.
 */
export interface RoleRateLookupKey {
  tenant_id: string
  role_key: string
  /** ISO date string (YYYY-MM-DD). Lookup returns the latest row with
   *  `valid_from <= as_of_date`. */
  as_of_date: string
}

/**
 * PROJ-54-α — Lookup-key shape for `resolveResourceRates`. The lookup layer
 * dedupes identical keys before issuing RPC calls. One key per resource
 * resolves to either an override-rate, a role-rate, or no row.
 */
export interface ResourceRateLookupKey {
  tenant_id: string
  resource_id: string
  /** ISO date string (YYYY-MM-DD). The role-rate fallback uses the latest
   *  role_rate with `valid_from <= as_of_date`. Override-rates ignore the
   *  date (Latest-only in α). */
  as_of_date: string
}
