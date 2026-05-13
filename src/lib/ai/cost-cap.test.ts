/**
 * PROJ-32-d — cost-cap.ts unit tests.
 *
 * Mocks Supabase's `from('tenant_ai_cost_caps')` + the
 * `tenant_ai_monthly_usage` RPC and exercises:
 *   - no cap configured → never blocks
 *   - cap_action='warn_only' → blocked=false, warn=true when over
 *   - cap_action='block' + over input cap → blocked=true with detail
 *   - cap_action='block' + over output cap → blocked=true
 *   - exactly at cap → blocked=true (>= comparison)
 *   - DB error on cap config → graceful fallback (no block)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { checkCostCap, getCostDashboardData } from "./cost-cap"

interface CapRow {
  monthly_input_token_cap: number | null
  monthly_output_token_cap: number | null
  cap_action: "block" | "warn_only"
}

interface UsageRow {
  provider: string
  input_tokens: number
  output_tokens: number
  call_count: number
}

function buildSupabase(opts: {
  capRow: CapRow | null
  capError?: { message: string } | null
  usageByMonth: Map<string, UsageRow[]> // key=`${year}-${month}`
}) {
  const capChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: opts.capRow,
      error: opts.capError ?? null,
    })),
  }
  return {
    rpc: vi.fn(async (fn: string, args?: { p_year?: number; p_month?: number }) => {
      if (fn === "tenant_ai_monthly_usage") {
        const key = `${args?.p_year}-${args?.p_month}`
        return { data: opts.usageByMonth.get(key) ?? [], error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    }),
    from: vi.fn((table: string) => {
      if (table === "tenant_ai_cost_caps") return capChain
      throw new Error(`unexpected table ${table}`)
    }),
  }
}

const T = "11111111-1111-4111-8111-111111111111"

const NOW = new Date()
const Y = NOW.getUTCFullYear()
const M = NOW.getUTCMonth() + 1

describe("checkCostCap", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it("no cap row → blocked=false, warn=false", async () => {
    const supabase = buildSupabase({
      capRow: null,
      usageByMonth: new Map(),
    })
    const r = await checkCostCap({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(r).toEqual({ blocked: false, warn: false, detail: null })
  })

  it("both caps null (unlimited) → blocked=false", async () => {
    const supabase = buildSupabase({
      capRow: {
        monthly_input_token_cap: null,
        monthly_output_token_cap: null,
        cap_action: "block",
      },
      usageByMonth: new Map([
        [
          `${Y}-${M}`,
          [
            {
              provider: "anthropic",
              input_tokens: 999_999_999,
              output_tokens: 999_999_999,
              call_count: 1,
            },
          ],
        ],
      ]),
    })
    const r = await checkCostCap({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(r.blocked).toBe(false)
  })

  it("cap_action='block' + over input cap → blocked with detail", async () => {
    const supabase = buildSupabase({
      capRow: {
        monthly_input_token_cap: 1000,
        monthly_output_token_cap: null,
        cap_action: "block",
      },
      usageByMonth: new Map([
        [
          `${Y}-${M}`,
          [
            {
              provider: "anthropic",
              input_tokens: 1500,
              output_tokens: 200,
              call_count: 5,
            },
          ],
        ],
      ]),
    })
    const r = await checkCostCap({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(r.blocked).toBe(true)
    expect(r.detail).toContain("input 1500 / cap 1000")
  })

  it("cap_action='block' + exactly at cap → blocked (>= semantics)", async () => {
    const supabase = buildSupabase({
      capRow: {
        monthly_input_token_cap: 1000,
        monthly_output_token_cap: null,
        cap_action: "block",
      },
      usageByMonth: new Map([
        [
          `${Y}-${M}`,
          [
            {
              provider: "anthropic",
              input_tokens: 1000,
              output_tokens: 200,
              call_count: 1,
            },
          ],
        ],
      ]),
    })
    const r = await checkCostCap({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(r.blocked).toBe(true)
  })

  it("cap_action='warn_only' + over → warn=true, blocked=false", async () => {
    const supabase = buildSupabase({
      capRow: {
        monthly_input_token_cap: 1000,
        monthly_output_token_cap: null,
        cap_action: "warn_only",
      },
      usageByMonth: new Map([
        [
          `${Y}-${M}`,
          [
            {
              provider: "anthropic",
              input_tokens: 1500,
              output_tokens: 0,
              call_count: 1,
            },
          ],
        ],
      ]),
    })
    const r = await checkCostCap({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(r).toMatchObject({ blocked: false, warn: true })
    expect(r.detail).toContain("input 1500 / cap 1000")
  })

  it("over output cap only → blocked", async () => {
    const supabase = buildSupabase({
      capRow: {
        monthly_input_token_cap: null,
        monthly_output_token_cap: 500,
        cap_action: "block",
      },
      usageByMonth: new Map([
        [
          `${Y}-${M}`,
          [
            {
              provider: "anthropic",
              input_tokens: 100,
              output_tokens: 600,
              call_count: 1,
            },
          ],
        ],
      ]),
    })
    const r = await checkCostCap({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(r.blocked).toBe(true)
    expect(r.detail).toContain("output 600 / cap 500")
  })

  it("DB error on cap fetch → graceful fallback (no block)", async () => {
    const supabase = buildSupabase({
      capRow: null,
      capError: { message: "simulated DB outage" },
      usageByMonth: new Map(),
    })
    const r = await checkCostCap({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(r.blocked).toBe(false)
  })

  it("aggregates across multiple providers", async () => {
    const supabase = buildSupabase({
      capRow: {
        monthly_input_token_cap: 2000,
        monthly_output_token_cap: null,
        cap_action: "block",
      },
      usageByMonth: new Map([
        [
          `${Y}-${M}`,
          [
            {
              provider: "anthropic",
              input_tokens: 1200,
              output_tokens: 0,
              call_count: 5,
            },
            {
              provider: "openai",
              input_tokens: 900,
              output_tokens: 0,
              call_count: 3,
            },
          ],
        ],
      ]),
    })
    const r = await checkCostCap({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(r.blocked).toBe(true)
    // 1200 + 900 = 2100 ≥ 2000
    expect(r.detail).toContain("input 2100 / cap 2000")
  })
})

describe("getCostDashboardData", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it("returns 6 trend points + current month aggregates", async () => {
    const usageMap = new Map<string, UsageRow[]>()
    usageMap.set(`${Y}-${M}`, [
      {
        provider: "anthropic",
        input_tokens: 100,
        output_tokens: 50,
        call_count: 2,
      },
      {
        provider: "openai",
        input_tokens: 200,
        output_tokens: 80,
        call_count: 3,
      },
    ])
    const supabase = buildSupabase({
      capRow: {
        monthly_input_token_cap: 1000,
        monthly_output_token_cap: null,
        cap_action: "block",
      },
      usageByMonth: usageMap,
    })
    const d = await getCostDashboardData({
       
      supabase: supabase as any,
      tenantId: T,
    })
    expect(d.cap).toMatchObject({
      monthly_input_token_cap: 1000,
      cap_action: "block",
    })
    expect(d.current.total_input).toBe(300)
    expect(d.current.total_output).toBe(130)
    expect(d.current.total_calls).toBe(5)
    expect(d.current.per_provider).toHaveLength(2)
    expect(d.trend).toHaveLength(6)
    // Trend ends with current month
    expect(d.trend[5].year).toBe(Y)
    expect(d.trend[5].month).toBe(M)
    expect(d.trend[5].input_tokens).toBe(300)
  })
})
