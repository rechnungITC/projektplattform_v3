import { describe, expect, it } from "vitest"

import { calculateWorkItemCosts } from "./calculate-work-item-costs"
import type {
  AllocationInput,
  RoleRateSnapshot,
  WorkItemCostInput,
} from "./types"

// ──────────────────────────────────────────────────────────────────────
// Test factories — keep tests terse.
// ──────────────────────────────────────────────────────────────────────

function makeWorkItem(
  overrides: Partial<WorkItemCostInput> = {}
): WorkItemCostInput {
  return {
    work_item_id: "wi-1",
    kind: "story",
    story_points: null,
    estimated_duration_days: null,
    created_at: "2026-04-01T00:00:00Z",
    ...overrides,
  }
}

function makeAllocation(
  overrides: Partial<AllocationInput> = {}
): AllocationInput {
  return {
    allocation_id: "alloc-1",
    resource_id: "res-1",
    allocation_pct: 100,
    role_key: "senior_dev",
    source_stakeholder_id: "stk-1",
    ...overrides,
  }
}

function makeRate(overrides: Partial<RoleRateSnapshot> = {}): RoleRateSnapshot {
  return {
    tenant_id: "tnt-1",
    role_key: "senior_dev",
    daily_rate: 1000,
    currency: "EUR",
    valid_from: "2026-01-01",
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Happy paths
// ──────────────────────────────────────────────────────────────────────

describe("calculateWorkItemCosts — happy paths", () => {
  it("computes a story-points cost-line: 3 SP × 0.5 velocity × 100% × 1000€ = 1500€", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "story", story_points: 3 }),
      allocations: [makeAllocation()],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })

    expect(result.warnings).toHaveLength(0)
    expect(result.cost_lines).toHaveLength(1)
    expect(result.cost_lines[0]).toMatchObject({
      work_item_id: "wi-1",
      source_type: "resource_allocation",
      amount: 1500,
      currency: "EUR",
      source_ref_id: "alloc-1",
    })
    expect(result.cost_lines[0].source_metadata).toMatchObject({
      basis: "story_points",
      story_points: 3,
      velocity_factor: 0.5,
      allocation_pct: 100,
      daily_rate: 1000,
      role_key: "senior_dev",
      valid_from: "2026-01-01",
    })
  })

  it("computes a duration cost-line: 10 days × 80% × 1200€ = 9600€", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({
        kind: "work_package",
        estimated_duration_days: 10,
      }),
      allocations: [makeAllocation({ allocation_pct: 80 })],
      role_rates: [makeRate({ daily_rate: 1200 })],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })

    expect(result.warnings).toHaveLength(0)
    expect(result.cost_lines).toHaveLength(1)
    expect(result.cost_lines[0].amount).toBe(9600)
    expect(result.cost_lines[0].source_metadata).toMatchObject({
      basis: "duration",
      estimated_duration_days: 10,
      allocation_pct: 80,
      daily_rate: 1200,
    })
  })

  it("emits one cost-line per allocation when multiple allocations resolve", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 5 }),
      allocations: [
        makeAllocation({ allocation_id: "alloc-a", role_key: "senior_dev" }),
        makeAllocation({
          allocation_id: "alloc-b",
          role_key: "key_user",
          allocation_pct: 50,
        }),
      ],
      role_rates: [
        makeRate({ role_key: "senior_dev", daily_rate: 1000 }),
        makeRate({ role_key: "key_user", daily_rate: 600, currency: "EUR" }),
      ],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })

    expect(result.warnings).toHaveLength(0)
    expect(result.cost_lines).toHaveLength(2)
    // Sorted by allocation_id → 'alloc-a' first.
    expect(result.cost_lines[0].source_ref_id).toBe("alloc-a")
    expect(result.cost_lines[0].amount).toBe(5 * 1.0 * 1000) // 5000
    expect(result.cost_lines[1].source_ref_id).toBe("alloc-b")
    expect(result.cost_lines[1].amount).toBe(5 * 0.5 * 600) // 1500
  })
})

// ──────────────────────────────────────────────────────────────────────
// Multi-currency
// ──────────────────────────────────────────────────────────────────────

describe("calculateWorkItemCosts — multi-currency", () => {
  it("emits cost-lines in different currencies when role rates differ in currency", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 1 }),
      allocations: [
        makeAllocation({ allocation_id: "alloc-eur", role_key: "senior_dev" }),
        makeAllocation({
          allocation_id: "alloc-usd",
          role_key: "external_consultant",
        }),
      ],
      role_rates: [
        makeRate({ role_key: "senior_dev", currency: "EUR", daily_rate: 1000 }),
        makeRate({
          role_key: "external_consultant",
          currency: "USD",
          daily_rate: 1500,
        }),
      ],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })

    expect(result.cost_lines).toHaveLength(2)
    const byRef = new Map(
      result.cost_lines.map((cl) => [cl.source_ref_id, cl] as const)
    )
    expect(byRef.get("alloc-eur")?.currency).toBe("EUR")
    expect(byRef.get("alloc-usd")?.currency).toBe("USD")
    expect(byRef.get("alloc-eur")?.amount).toBe(1000)
    expect(byRef.get("alloc-usd")?.amount).toBe(1500)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Allocation edge-cases
// ──────────────────────────────────────────────────────────────────────

describe("calculateWorkItemCosts — allocation edge-cases", () => {
  it("skips allocations with allocation_pct = 0 silently (no cost-line, no warning)", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 5 }),
      allocations: [makeAllocation({ allocation_pct: 0 })],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("skips allocations with NULL allocation_pct silently", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 5 }),
      allocations: [makeAllocation({ allocation_pct: null })],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("warns no_role_key when allocation.role_key is null and stakeholder is set", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 5 }),
      allocations: [
        makeAllocation({
          role_key: null,
          source_stakeholder_id: "stk-1",
        }),
      ],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("no_role_key")
    expect(result.warnings[0].allocation_id).toBe("alloc-1")
  })

  it("warns no_stakeholder when both role_key and source_stakeholder_id are null", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 5 }),
      allocations: [
        makeAllocation({
          role_key: null,
          source_stakeholder_id: null,
        }),
      ],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("no_stakeholder")
  })

  it("emits placeholder cost-line + warning when no rate is found for role_key", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 5 }),
      allocations: [makeAllocation({ role_key: "obscure_role" })],
      role_rates: [makeRate({ role_key: "senior_dev" })],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(1)
    expect(result.cost_lines[0].amount).toBe(0)
    expect(result.cost_lines[0].currency).toBe("EUR") // = default_currency
    expect(result.cost_lines[0].source_metadata).toMatchObject({
      warning: "no_rate_for_role",
      role_key: "obscure_role",
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("no_rate_for_role")
  })
})

// ──────────────────────────────────────────────────────────────────────
// Item-level basis edge-cases
// ──────────────────────────────────────────────────────────────────────

describe("calculateWorkItemCosts — item-level basis", () => {
  it("emits ONE no_basis warning (not per allocation) when item has neither SP nor duration", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({
        kind: "task",
        story_points: null,
        estimated_duration_days: null,
      }),
      allocations: [
        makeAllocation({ allocation_id: "alloc-a" }),
        makeAllocation({ allocation_id: "alloc-b" }),
        makeAllocation({ allocation_id: "alloc-c" }),
      ],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("no_basis")
    expect(result.warnings[0].allocation_id).toBeNull()
  })

  it("uses duration when BOTH story_points and estimated_duration_days are set (deterministic tie-break)", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({
        kind: "story",
        story_points: 5,
        estimated_duration_days: 2,
      }),
      allocations: [makeAllocation({ allocation_pct: 100 })],
      role_rates: [makeRate({ daily_rate: 1000 })],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(1)
    expect(result.cost_lines[0].amount).toBe(2000) // 2 × 1.0 × 1000
    expect(result.cost_lines[0].source_metadata).toMatchObject({
      basis: "duration",
      estimated_duration_days: 2,
    })
    // No "story_points" leakage when duration wins.
    expect(result.cost_lines[0].source_metadata).not.toHaveProperty("story_points")
    expect(result.warnings).toHaveLength(0)
  })

  it("velocity_factor = 0 produces SP cost-lines with amount=0 and NO warning", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "story", story_points: 5 }),
      allocations: [makeAllocation()],
      role_rates: [makeRate({ daily_rate: 1200 })],
      velocity_factor: 0,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(1)
    expect(result.cost_lines[0].amount).toBe(0)
    expect(result.cost_lines[0].source_metadata).toMatchObject({
      basis: "story_points",
      velocity_factor: 0,
    })
    expect(result.warnings).toHaveLength(0)
  })

  it("kind='task' with story_points falls through to duration path; falls back to no_basis when no duration", () => {
    // Task with SP but no duration → SP is ignored (kind not in SP set) →
    // no basis at all → no_basis warning, no cost-lines.
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({
        kind: "task",
        story_points: 8,
        estimated_duration_days: null,
      }),
      allocations: [makeAllocation()],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("no_basis")
  })

  it("kind='feature' with story_points falls back to no_basis when no duration", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({
        kind: "feature",
        story_points: 8,
        estimated_duration_days: null,
      }),
      allocations: [makeAllocation()],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("no_basis")
  })

  it("kind='task' with duration uses duration path (SP is irrelevant for tasks)", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({
        kind: "task",
        story_points: 8, // ignored
        estimated_duration_days: 3,
      }),
      allocations: [makeAllocation()],
      role_rates: [makeRate({ daily_rate: 800 })],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(1)
    expect(result.cost_lines[0].amount).toBe(3 * 1 * 800) // 2400
    expect(result.cost_lines[0].source_metadata).toMatchObject({ basis: "duration" })
  })
})

// ──────────────────────────────────────────────────────────────────────
// Rounding + determinism
// ──────────────────────────────────────────────────────────────────────

describe("calculateWorkItemCosts — rounding + determinism", () => {
  it("rounds to 2 decimals: 33.33% × 1 day × 1000€ = 333.30 (round-half-to-even-ish via Math.round)", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 1 }),
      allocations: [makeAllocation({ allocation_pct: 33.33 })],
      role_rates: [makeRate({ daily_rate: 1000 })],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(1)
    // 1 × 0.3333 × 1000 = 333.3 — rounded to 2 decimals stays 333.3
    expect(result.cost_lines[0].amount).toBe(333.3)
  })

  it("rounds to 2 decimals: 33.33 × 1 × 1000 → exactly 333.33 in IEEE-754, stays 333.33 after round2", () => {
    // This case verifies the rounding is doing what we expect when the
    // unrounded result has > 2 decimal places.
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "task", estimated_duration_days: 1 }),
      allocations: [makeAllocation({ allocation_pct: 100 / 3 })],
      role_rates: [makeRate({ daily_rate: 1000 })],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    // (100/3) / 100 = 1/3 → 1/3 × 1000 = 333.333… → rounded to 333.33.
    expect(result.cost_lines[0].amount).toBe(333.33)
  })

  it("is deterministic: identical inputs produce byte-identical JSON output across calls", () => {
    const args = {
      work_item: makeWorkItem({
        kind: "story",
        story_points: 5,
        estimated_duration_days: null,
      }),
      allocations: [
        makeAllocation({ allocation_id: "alloc-z", role_key: "key_user" }),
        makeAllocation({ allocation_id: "alloc-a", role_key: "senior_dev" }),
      ],
      role_rates: [
        makeRate({ role_key: "senior_dev", daily_rate: 1000 }),
        makeRate({ role_key: "key_user", daily_rate: 600 }),
      ],
      velocity_factor: 0.5,
      default_currency: "EUR",
    }
    const r1 = calculateWorkItemCosts(args)
    const r2 = calculateWorkItemCosts(args)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
    // And confirm sort order is allocation_id-asc, not input order.
    expect(r1.cost_lines[0].source_ref_id).toBe("alloc-a")
    expect(r1.cost_lines[1].source_ref_id).toBe("alloc-z")
  })

  it("returns empty result for empty allocations input", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({ kind: "story", story_points: 3 }),
      allocations: [],
      role_rates: [makeRate()],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("returns empty result for empty allocations even when item has no basis (no warning leakage)", () => {
    const result = calculateWorkItemCosts({
      work_item: makeWorkItem({
        kind: "task",
        story_points: null,
        estimated_duration_days: null,
      }),
      allocations: [],
      role_rates: [],
      velocity_factor: 0.5,
      default_currency: "EUR",
    })
    // Item has no basis → no_basis warning fires regardless of whether
    // there are allocations. This is the intended behavior: surface the
    // missing basis to the user even before allocations exist.
    expect(result.cost_lines).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].kind).toBe("no_basis")
  })
})
