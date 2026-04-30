import { describe, expect, it } from "vitest"

import { buildSummary, pickLatestRate } from "./aggregation"
import type { BudgetItem, BudgetItemTotals, FxRate } from "@/types/budget"

function makeItem(overrides: Partial<BudgetItem & { category_name: string }> = {}): BudgetItem & { category_name: string } {
  return {
    id: "item-1",
    tenant_id: "tenant-1",
    project_id: "project-1",
    category_id: "cat-1",
    name: "Test-Posten",
    description: null,
    planned_amount: 1000,
    planned_currency: "EUR",
    is_active: true,
    position: 0,
    created_by: "user-1",
    created_at: "2026-04-30T00:00:00Z",
    updated_at: "2026-04-30T00:00:00Z",
    category_name: "Test-Kategorie",
    ...overrides,
  }
}

function makeTotals(overrides: Partial<BudgetItemTotals> = {}): BudgetItemTotals {
  return {
    item_id: "item-1",
    tenant_id: "tenant-1",
    project_id: "project-1",
    category_id: "cat-1",
    planned_amount: 1000,
    planned_currency: "EUR",
    is_active: true,
    actual_amount: 0,
    reservation_amount: 0,
    multi_currency_postings_count: 0,
    traffic_light_state: "green",
    ...overrides,
  }
}

function makeRate(overrides: Partial<FxRate> = {}): FxRate {
  return {
    id: "rate-1",
    tenant_id: "tenant-1",
    from_currency: "USD",
    to_currency: "EUR",
    rate: 0.92,
    valid_on: "2026-04-29",
    source: "manual",
    created_by: "user-1",
    created_at: "2026-04-29T00:00:00Z",
    ...overrides,
  }
}

describe("pickLatestRate", () => {
  it("returns null for identity (from === to)", () => {
    const rates = [makeRate({ from_currency: "EUR", to_currency: "EUR" })]
    expect(pickLatestRate(rates, "EUR", "EUR")).toBeNull()
  })

  it("returns null when no matching pair exists", () => {
    const rates = [makeRate({ from_currency: "USD", to_currency: "EUR" })]
    expect(pickLatestRate(rates, "GBP", "EUR")).toBeNull()
  })

  it("picks the most recent valid_on for a pair", () => {
    const rates = [
      makeRate({ id: "r1", valid_on: "2026-01-01", rate: 1.0 }),
      makeRate({ id: "r2", valid_on: "2026-04-29", rate: 0.92 }),
      makeRate({ id: "r3", valid_on: "2026-03-15", rate: 0.95 }),
    ]
    expect(pickLatestRate(rates, "USD", "EUR")?.id).toBe("r2")
  })

  it("does not pick a rate for the wrong direction", () => {
    const rates = [makeRate({ from_currency: "USD", to_currency: "EUR" })]
    expect(pickLatestRate(rates, "EUR", "USD")).toBeNull()
  })
})

describe("buildSummary", () => {
  it("identity-pass when item currency matches in_currency", () => {
    const summary = buildSummary({
      inCurrency: "EUR",
      items: [makeItem({ planned_currency: "EUR", planned_amount: 500 })],
      totals: [makeTotals({ actual_amount: 200 })],
      rates: [],
    })
    expect(summary.items[0].converted_planned).toBe(500)
    expect(summary.items[0].converted_actual).toBe(200)
    expect(summary.items[0].rate_used).toBe(1)
    expect(summary.totals.converted_planned).toBe(500)
    expect(summary.totals.converted_actual).toBe(200)
    expect(summary.missing_rates).toHaveLength(0)
  })

  it("converts USD item to EUR when rate exists", () => {
    const summary = buildSummary({
      inCurrency: "EUR",
      items: [makeItem({ planned_currency: "USD", planned_amount: 1000 })],
      totals: [
        makeTotals({ planned_currency: "USD", planned_amount: 1000, actual_amount: 500 }),
      ],
      rates: [makeRate({ rate: 0.9 })],
    })
    expect(summary.items[0].converted_planned).toBe(900)
    expect(summary.items[0].converted_actual).toBe(450)
    expect(summary.items[0].rate_used).toBe(0.9)
    expect(summary.missing_rates).toHaveLength(0)
  })

  it("flags missing FX rate without dropping the item", () => {
    const summary = buildSummary({
      inCurrency: "EUR",
      items: [makeItem({ planned_currency: "GBP", planned_amount: 800 })],
      totals: [
        makeTotals({ planned_currency: "GBP", planned_amount: 800, actual_amount: 100 }),
      ],
      rates: [],
    })
    expect(summary.items[0].converted_planned).toBeNull()
    expect(summary.items[0].converted_actual).toBeNull()
    expect(summary.missing_rates).toEqual([
      { from_currency: "GBP", to_currency: "EUR", item_count: 1 },
    ])
    // Item bleibt in der Liste — UI muss "n/a" rendern, nicht den Posten verschlucken
    expect(summary.items[0].planned_amount).toBe(800)
  })

  it("excludes inactive items from the summary", () => {
    const summary = buildSummary({
      inCurrency: "EUR",
      items: [
        makeItem({ id: "i1", is_active: true }),
        makeItem({ id: "i2", is_active: false }),
      ],
      totals: [
        makeTotals({ item_id: "i1" }),
        makeTotals({ item_id: "i2", is_active: false }),
      ],
      rates: [],
    })
    expect(summary.items).toHaveLength(1)
    expect(summary.items[0].item_id).toBe("i1")
  })

  it("aggregates missing-rates count across multiple items in same pair", () => {
    const summary = buildSummary({
      inCurrency: "EUR",
      items: [
        makeItem({ id: "i1", planned_currency: "GBP", planned_amount: 100 }),
        makeItem({ id: "i2", planned_currency: "GBP", planned_amount: 200 }),
        makeItem({ id: "i3", planned_currency: "JPY", planned_amount: 5000 }),
      ],
      totals: [
        makeTotals({ item_id: "i1", planned_currency: "GBP" }),
        makeTotals({ item_id: "i2", planned_currency: "GBP" }),
        makeTotals({ item_id: "i3", planned_currency: "JPY" }),
      ],
      rates: [],
    })
    expect(summary.missing_rates).toHaveLength(2)
    const gbp = summary.missing_rates.find(
      (r) => r.from_currency === "GBP" && r.to_currency === "EUR"
    )
    expect(gbp?.item_count).toBe(2)
  })

  it("rounds converted amounts to 2 decimals", () => {
    const summary = buildSummary({
      inCurrency: "EUR",
      items: [makeItem({ planned_currency: "USD", planned_amount: 333.33 })],
      totals: [
        makeTotals({ planned_currency: "USD", planned_amount: 333.33, actual_amount: 100 }),
      ],
      rates: [makeRate({ rate: 0.9123 })],
    })
    // 333.33 * 0.9123 = 304.0966… → 304.10 (banker-style 2-decimal rounding)
    expect(summary.items[0].converted_planned).toBe(304.1)
  })
})
