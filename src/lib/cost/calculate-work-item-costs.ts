/**
 * PROJ-24 — Pure-TS cost-calc engine.
 *
 * IMPORTANT: this module MUST NOT import from `@supabase/supabase-js` or any
 * server runtime. Determinism is part of the contract — same inputs always
 * produce the same outputs in deterministic order. The DB-bound part lives
 * in `role-rate-lookup.ts`.
 *
 * Costing formulas (Spec ST-04):
 *
 *   Story-point path (kind = story AND story_points > 0):
 *     amount = story_points
 *            × velocity_factor
 *            × (allocation_pct / 100)
 *            × daily_rate
 *
 *   Duration path (estimated_duration_days > 0, all other kinds OR fallback):
 *     amount = estimated_duration_days
 *            × (allocation_pct / 100)
 *            × daily_rate
 *
 *   Tie-break (item carries BOTH story_points AND estimated_duration_days):
 *     duration wins, deterministically — a concrete duration is always more
 *     precise than an SP estimate. No warning is emitted.
 *
 *   Item with NEITHER basis: no cost-lines emitted, ONE item-level warning
 *     `no_basis` (NOT one per allocation — that would be noisy).
 *
 * Edge cases:
 *   - `allocation_pct` null/undefined or ≤ 0 → skipped silently (allocation
 *     effectively disabled, this is not an error).
 *   - `role_key` null → warning `no_role_key`, no cost-line.
 *   - `role_key` present but `source_stakeholder_id` null AND no rate found
 *     → warning `no_stakeholder` plus `no_rate_for_role`.
 *   - Rate not found for a (role_key) → cost-line with `amount = 0`,
 *     `currency = default_currency`, `source_metadata.warning =
 *     'no_rate_for_role'`, plus a `no_rate_for_role` warning entry.
 *   - `velocity_factor = 0` → SP path produces `amount = 0` cost-lines but
 *     NO warning (a tenant may legitimately set velocity to 0 to suppress
 *     SP-derived costs).
 *
 * Currency handling: per-allocation. A single work-item can have cost-lines
 * in different currencies when allocations resolve to roles with different
 * currencies (e.g. EUR senior-dev + USD external consultant). This is
 * by design; the consumer view (`work_item_cost_totals`) flags this with
 * `multi_currency_count > 1`.
 *
 * Rounding: amounts are rounded to 2 decimals via `Math.round(x * 100) / 100`
 * to match the DB column precision `numeric(14,2)`. Rounding happens once,
 * at the very end of the per-allocation computation.
 *
 * Determinism: per-allocation iteration is sorted by `allocation_id` so that
 * cost_lines and warnings come back in stable order regardless of caller
 * input ordering.
 */

import type {
  AllocationInput,
  CostCalcResult,
  CostCalcWarning,
  CostLineDraft,
  RoleRateSnapshot,
  WorkItemCostInput,
} from "./types"

/** Kinds for which `story_points × velocity_factor` is the costing basis. */
const SP_KINDS: ReadonlySet<string> = new Set(["story"])

interface CalculateInput {
  work_item: WorkItemCostInput
  allocations: AllocationInput[]
  /** Pre-resolved by the lookup layer; one entry per (role_key) at the
   *  cutoff date. The engine matches by role_key. */
  role_rates: RoleRateSnapshot[]
  /** Tenant cost_settings.velocity_factor (Zod-validated to [0.1, 5.0] by
   *  the caller — but the engine does not assume a range and must handle
   *  velocity_factor = 0 cleanly). */
  velocity_factor: number
  /** Tenant cost_settings.default_currency. Used as the currency on
   *  warning-only cost-lines (rate not found). */
  default_currency: string
}

/**
 * Compute the resource-allocation cost-lines for a work-item.
 *
 * Pure: same inputs → same outputs. No clock reads, no random IDs, no
 * mutation of input arrays.
 */
export function calculateWorkItemCosts(input: CalculateInput): CostCalcResult {
  const { work_item, allocations, role_rates, velocity_factor, default_currency } = input

  const cost_lines: CostLineDraft[] = []
  const warnings: CostCalcWarning[] = []

  // Determine the basis for this item once (item-level decision, not per
  // allocation). Locked decision: `estimated_duration_days` wins when both
  // are present.
  const basis = pickBasis(work_item)

  if (basis === "none") {
    warnings.push({
      allocation_id: null,
      kind: "no_basis",
      detail:
        "Work-item has neither a positive story_points value (for kind story) " +
        "nor a positive estimated_duration_days value — no cost-lines can be computed.",
    })
    return { cost_lines, warnings }
  }

  // Build a role_key → rate index. Match purely on role_key — the caller
  // has already filtered by tenant.
  const rateByRoleKey = new Map<string, RoleRateSnapshot>()
  for (const r of role_rates) {
    rateByRoleKey.set(r.role_key, r)
  }

  // Sort allocations for deterministic output ordering.
  const sortedAllocations = [...allocations].sort((a, b) =>
    a.allocation_id < b.allocation_id ? -1 : a.allocation_id > b.allocation_id ? 1 : 0
  )

  for (const allocation of sortedAllocations) {
    // Disabled allocation (NULL or non-positive percentage) → silently skip.
    const pct = allocation.allocation_pct
    if (pct === null || pct === undefined || pct <= 0) {
      continue
    }

    if (allocation.role_key === null || allocation.role_key === undefined) {
      // No role at all on this allocation — emit a warning so the UI can
      // prompt the user to fix the stakeholder profile.
      if (allocation.source_stakeholder_id === null) {
        warnings.push({
          allocation_id: allocation.allocation_id,
          kind: "no_stakeholder",
          detail: `Resource ${allocation.resource_id} has no source_stakeholder_id and no role_key — cannot determine a daily rate.`,
        })
      } else {
        warnings.push({
          allocation_id: allocation.allocation_id,
          kind: "no_role_key",
          detail: `Stakeholder ${allocation.source_stakeholder_id} has no role_key — cannot resolve a daily rate.`,
        })
      }
      continue
    }

    const rate = rateByRoleKey.get(allocation.role_key)
    if (!rate) {
      // No rate configured for this role at the work_item.created_at cutoff.
      // Per Spec edge-case: emit a placeholder cost-line with amount=0 and a
      // warning flag so the UI can surface "Tagessatz fehlt — bitte
      // Tenant-Admin fragen".
      cost_lines.push({
        work_item_id: work_item.work_item_id,
        source_type: "resource_allocation",
        amount: 0,
        currency: default_currency,
        source_ref_id: allocation.allocation_id,
        source_metadata: {
          warning: "no_rate_for_role",
          role_key: allocation.role_key,
          allocation_pct: pct,
          basis,
        },
      })
      warnings.push({
        allocation_id: allocation.allocation_id,
        kind: "no_rate_for_role",
        detail: `No role_rates entry found for role_key='${allocation.role_key}' applicable to work_item.created_at='${work_item.created_at}'.`,
      })
      continue
    }

    // Compute cost.
    const pctFraction = pct / 100

    let amount: number
    let metadata: Record<string, unknown>

    if (basis === "duration") {
      // Safe: pickBasis() only returns "duration" if the value is > 0.
      const days = work_item.estimated_duration_days as number
      amount = days * pctFraction * rate.daily_rate
      metadata = {
        basis: "duration",
        estimated_duration_days: days,
        allocation_pct: pct,
        daily_rate: rate.daily_rate,
        role_key: rate.role_key,
        valid_from: rate.valid_from,
      }
    } else {
      // basis === "story_points"
      const sp = work_item.story_points as number
      amount = sp * velocity_factor * pctFraction * rate.daily_rate
      metadata = {
        basis: "story_points",
        story_points: sp,
        velocity_factor,
        allocation_pct: pct,
        daily_rate: rate.daily_rate,
        role_key: rate.role_key,
        valid_from: rate.valid_from,
        estimated: "true",
      }
    }

    cost_lines.push({
      work_item_id: work_item.work_item_id,
      source_type: "resource_allocation",
      amount: round2(amount),
      currency: rate.currency,
      source_ref_id: allocation.allocation_id,
      source_metadata: metadata,
    })
  }

  return { cost_lines, warnings }
}

/**
 * Item-level basis decision. Returns `'duration'` whenever a positive
 * `estimated_duration_days` is present (deterministic tie-break), `'story_points'`
 * when only story_points apply (and the kind is in the SP set), otherwise
 * `'none'`.
 */
function pickBasis(item: WorkItemCostInput): "duration" | "story_points" | "none" {
  const hasDuration =
    typeof item.estimated_duration_days === "number" &&
    Number.isFinite(item.estimated_duration_days) &&
    item.estimated_duration_days > 0

  if (hasDuration) return "duration"

  const hasSp =
    typeof item.story_points === "number" &&
    Number.isFinite(item.story_points) &&
    item.story_points > 0

  if (hasSp && SP_KINDS.has(item.kind)) return "story_points"

  return "none"
}

/** Rounds to 2 decimals to match `numeric(14,2)` precision. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
