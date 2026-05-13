/**
 * PROJ-32-d — Cost-cap pre-call check + dashboard aggregations.
 *
 * Server-only. The router calls `checkCostCap()` right before invoking
 * any AI provider. If the tenant's cumulative monthly token usage has
 * exceeded the cap (with `cap_action='block'`), the router routes the
 * call to the StubProvider and flags the run as `external_blocked`.
 *
 * Dashboard data is bulk-fetched per request (current month + 5 prior
 * months) for the cost-dashboard UI.
 *
 * Locked decisions (/requirements 2026-05-05):
 *   * Monthly token-budget per tenant (not €).
 *   * Token logging via existing ki_runs.input_tokens/output_tokens.
 *   * Pre-call SELECT-aggregate (~5ms with the new partial index).
 *   * Dashboard: current month per-provider + 6-month per-month trend.
 */

import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { AIPurpose } from "./types"

export interface CostCapConfig {
  monthly_input_token_cap: number | null
  monthly_output_token_cap: number | null
  cap_action: "block" | "warn_only"
}

export interface MonthlyUsageRow {
  provider: string
  input_tokens: number
  output_tokens: number
  call_count: number
}

export interface CostCapCheckResult {
  /** True when the call must be blocked (cap exceeded + cap_action='block'). */
  blocked: boolean
  /** True when usage is over the soft threshold but the call is allowed. */
  warn: boolean
  /** Diagnostic detail used by the router for `error_message`. */
  detail: string | null
}

interface YearMonth {
  year: number
  month: number // 1..12
}

function currentYearMonth(): YearMonth {
  const now = new Date()
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
}

function priorYearMonth(ym: YearMonth, monthsBack: number): YearMonth {
  // Step back `monthsBack` calendar months.
  const d = new Date(Date.UTC(ym.year, ym.month - 1 - monthsBack, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

// ---------------------------------------------------------------------------
// Cap config + monthly-usage cached per request.
// ---------------------------------------------------------------------------

/**
 * PROJ-34-ε.β (CIA-L7) — purpose-aware cap config lookup.
 *
 * Tries the purpose-specific row first (`purpose = $P`); falls back to the
 * NULL-purpose default row (`purpose IS NULL`). When no purpose is given,
 * only the NULL-default row is considered.
 *
 * Per-purpose usage isolation is intentionally NOT implemented in this
 * slice — the dashboard RPC stays purpose-agnostic. Purpose caps therefore
 * apply against cumulative tenant token usage. v2 enhancement is tracked
 * as a follow-up.
 */
const getCapConfig = cache(
  async (
    supabase: SupabaseClient,
    tenantId: string,
    purpose?: AIPurpose,
  ): Promise<CostCapConfig | null> => {
    if (purpose) {
      const purposeRes = await supabase
        .from("tenant_ai_cost_caps")
        .select("monthly_input_token_cap, monthly_output_token_cap, cap_action")
        .eq("tenant_id", tenantId)
        .eq("purpose", purpose)
        .maybeSingle()
      if (purposeRes.error) {
        console.error(
          `[cost-cap] getCapConfig(${tenantId}, ${purpose}) failed: ${purposeRes.error.message}. Falling back to default.`,
        )
      } else if (purposeRes.data) {
        return {
          monthly_input_token_cap:
            (purposeRes.data.monthly_input_token_cap as number | null) ?? null,
          monthly_output_token_cap:
            (purposeRes.data.monthly_output_token_cap as number | null) ?? null,
          cap_action:
            (purposeRes.data.cap_action as CostCapConfig["cap_action"]) ??
            "block",
        }
      }
    }
    const { data, error } = await supabase
      .from("tenant_ai_cost_caps")
      .select("monthly_input_token_cap, monthly_output_token_cap, cap_action")
      .eq("tenant_id", tenantId)
      .is("purpose", null)
      .maybeSingle()
    if (error) {
      console.error(
        `[cost-cap] getCapConfig default failed for ${tenantId}: ${error.message}. Treating as no-cap.`,
      )
      return null
    }
    if (!data) return null
    return {
      monthly_input_token_cap:
        (data.monthly_input_token_cap as number | null) ?? null,
      monthly_output_token_cap:
        (data.monthly_output_token_cap as number | null) ?? null,
      cap_action: (data.cap_action as CostCapConfig["cap_action"]) ?? "block",
    }
  },
)

const getMonthlyUsage = cache(
  async (
    supabase: SupabaseClient,
    tenantId: string,
    year: number,
    month: number,
  ): Promise<MonthlyUsageRow[]> => {
    // The `tenant_ai_monthly_usage` RPC has its EXECUTE revoked from
    // `authenticated` (security hardening). The caller is expected to
    // already be authorized for `tenantId`; we issue the RPC over the
    // service-role admin client. Tests inject the client they want by
    // monkey-patching `supabase.rpc`, which still works because we fall
    // back to the supplied client when the admin factory throws.
    let client: SupabaseClient = supabase
    try {
      // Lazy import keeps the admin module out of test-bundles that
      // don't set SUPABASE_SERVICE_ROLE_KEY.
      const { createAdminClient } = await import("@/lib/supabase/admin")
      client = createAdminClient()
    } catch {
      // Falls through with the user-context client (used in tests).
    }
    const { data, error } = await client.rpc("tenant_ai_monthly_usage", {
      p_tenant_id: tenantId,
      p_year: year,
      p_month: month,
    })
    if (error) {
      console.error(
        `[cost-cap] tenant_ai_monthly_usage failed for ${tenantId} ${year}-${month}: ${error.message}`,
      )
      return []
    }
    return (data ?? []) as MonthlyUsageRow[]
  },
)

function sumUsage(rows: MonthlyUsageRow[]): {
  input: number
  output: number
} {
  let input = 0
  let output = 0
  for (const r of rows) {
    input += Number(r.input_tokens) || 0
    output += Number(r.output_tokens) || 0
  }
  return { input, output }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pre-call cap check used by the AI router. Returns `blocked: true`
 * when the current-month usage has exceeded a configured cap AND the
 * cap_action is 'block'. `warn_only` never blocks.
 *
 * If the tenant has no cap config row, treat as unlimited.
 */
export async function checkCostCap(args: {
  supabase: SupabaseClient
  tenantId: string
  /** PROJ-34-ε.β — when given, look up the purpose-specific cap first. */
  purpose?: AIPurpose
}): Promise<CostCapCheckResult> {
  const { supabase, tenantId, purpose } = args
  const cfg = await getCapConfig(supabase, tenantId, purpose)
  if (!cfg) return { blocked: false, warn: false, detail: null }
  if (
    cfg.monthly_input_token_cap === null &&
    cfg.monthly_output_token_cap === null
  ) {
    return { blocked: false, warn: false, detail: null }
  }
  const ym = currentYearMonth()
  const usage = sumUsage(await getMonthlyUsage(supabase, tenantId, ym.year, ym.month))

  const inputOverHard =
    cfg.monthly_input_token_cap !== null &&
    usage.input >= cfg.monthly_input_token_cap
  const outputOverHard =
    cfg.monthly_output_token_cap !== null &&
    usage.output >= cfg.monthly_output_token_cap
  const overAny = inputOverHard || outputOverHard

  if (!overAny) {
    return { blocked: false, warn: false, detail: null }
  }
  const detailParts: string[] = []
  if (inputOverHard)
    detailParts.push(
      `input ${usage.input} / cap ${cfg.monthly_input_token_cap}`,
    )
  if (outputOverHard)
    detailParts.push(
      `output ${usage.output} / cap ${cfg.monthly_output_token_cap}`,
    )
  const detail = `Monthly token cap exceeded — ${detailParts.join(", ")}.`

  if (cfg.cap_action === "warn_only") {
    return { blocked: false, warn: true, detail }
  }
  return { blocked: true, warn: false, detail }
}

// ---------------------------------------------------------------------------
// Dashboard data — current month per-provider + 6-month per-month trend
// ---------------------------------------------------------------------------

export interface DashboardCurrentMonth {
  per_provider: MonthlyUsageRow[]
  total_input: number
  total_output: number
  total_calls: number
}

export interface DashboardMonthPoint {
  year: number
  month: number // 1..12
  input_tokens: number
  output_tokens: number
  call_count: number
}

export interface DashboardData {
  cap: CostCapConfig | null
  current: DashboardCurrentMonth
  trend: DashboardMonthPoint[] // last 6 months including current, ascending
}

export async function getCostDashboardData(args: {
  supabase: SupabaseClient
  tenantId: string
}): Promise<DashboardData> {
  const { supabase, tenantId } = args
  const cap = await getCapConfig(supabase, tenantId)

  const ym = currentYearMonth()
  const current = await getMonthlyUsage(supabase, tenantId, ym.year, ym.month)

  // Last 6 months including current — ascending so the chart reads left-to-right.
  const trendPromises: Promise<DashboardMonthPoint>[] = []
  for (let back = 5; back >= 0; back--) {
    const target = priorYearMonth(ym, back)
    trendPromises.push(
      getMonthlyUsage(supabase, tenantId, target.year, target.month).then(
        (rows) => {
          const sums = sumUsage(rows)
          const callCount = rows.reduce(
            (acc, r) => acc + (Number(r.call_count) || 0),
            0,
          )
          return {
            year: target.year,
            month: target.month,
            input_tokens: sums.input,
            output_tokens: sums.output,
            call_count: callCount,
          }
        },
      ),
    )
  }
  const trend = await Promise.all(trendPromises)

  const sums = sumUsage(current)
  const callCount = current.reduce(
    (acc, r) => acc + (Number(r.call_count) || 0),
    0,
  )

  return {
    cap,
    current: {
      per_provider: current,
      total_input: sums.input,
      total_output: sums.output,
      total_calls: callCount,
    },
    trend,
  }
}
