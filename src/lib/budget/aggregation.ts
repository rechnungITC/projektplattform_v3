/**
 * PROJ-22 — Sammelwährungs-Aggregation für /api/projects/[id]/budget/summary.
 *
 * Holt alle aktiven Posten + ihre Aggregations-Werte aus `budget_item_totals`,
 * holt die jüngste verfügbare FX-Rate aus `fx_rates`, und rechnet jeden Posten
 * in die angefragte Sammelwährung um. Wenn keine Rate für ein Pair gefunden
 * wird, wird `converted_*` auf `null` gesetzt und der Pair in `missing_rates`
 * aufgeführt — die UI kann den Tenant-Admin dann auffordern, die Rate zu pflegen.
 *
 * Pure function-ish: nimmt bereits geladene Daten entgegen, kein DB-Zugriff.
 * Der Caller (API-Route) macht die zwei SELECTs.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  BudgetSummary,
  FxRate,
  BudgetItemTotals,
  BudgetItem,
} from "@/types/budget"
import type { SupportedCurrency } from "@/types/tenant-settings"

// ──────────────────────────────────────────────────────────────────────
// Pure helpers (testable without DB)
// ──────────────────────────────────────────────────────────────────────

/**
 * Pick the most recent FX rate for a (from, to) pair from the given list.
 * Returns null if no rate is available.
 */
export function pickLatestRate(
  rates: readonly FxRate[],
  from: SupportedCurrency,
  to: SupportedCurrency
): FxRate | null {
  if (from === to) return null // identity – callers handle this separately
  let best: FxRate | null = null
  for (const r of rates) {
    if (r.from_currency !== from || r.to_currency !== to) continue
    if (!best || new Date(r.valid_on) > new Date(best.valid_on)) {
      best = r
    }
  }
  return best
}

interface BuildSummaryArgs {
  inCurrency: SupportedCurrency
  items: ReadonlyArray<
    BudgetItem & { category_name: string }
  >
  totals: ReadonlyArray<BudgetItemTotals>
  rates: ReadonlyArray<FxRate>
}

export function buildSummary(args: BuildSummaryArgs): BudgetSummary {
  const totalsById = new Map(args.totals.map((t) => [t.item_id, t]))
  const summaryItems: BudgetSummary["items"] = []
  const missingRatesMap = new Map<string, { from: SupportedCurrency; to: SupportedCurrency; count: number }>()

  let convertedPlannedSum = 0
  let convertedActualSum = 0

  for (const item of args.items) {
    if (!item.is_active) continue
    const totals = totalsById.get(item.id)
    const actual = totals?.actual_amount ?? 0
    const trafficLight = totals?.traffic_light_state ?? "green"

    let convertedPlanned: number | null
    let convertedActual: number | null
    let rateUsed: number | null
    let rateValidOn: string | null

    if (item.planned_currency === args.inCurrency) {
      // Identity: keine Umrechnung nötig
      convertedPlanned = item.planned_amount
      convertedActual = actual
      rateUsed = 1
      rateValidOn = null
    } else {
      const rate = pickLatestRate(
        args.rates,
        item.planned_currency,
        args.inCurrency
      )
      if (rate) {
        convertedPlanned = round2(item.planned_amount * rate.rate)
        convertedActual = round2(actual * rate.rate)
        rateUsed = rate.rate
        rateValidOn = rate.valid_on
      } else {
        convertedPlanned = null
        convertedActual = null
        rateUsed = null
        rateValidOn = null
        const key = `${item.planned_currency}->${args.inCurrency}`
        const entry = missingRatesMap.get(key) ?? {
          from: item.planned_currency,
          to: args.inCurrency,
          count: 0,
        }
        entry.count += 1
        missingRatesMap.set(key, entry)
      }
    }

    if (convertedPlanned !== null) convertedPlannedSum += convertedPlanned
    if (convertedActual !== null) convertedActualSum += convertedActual

    summaryItems.push({
      item_id: item.id,
      item_name: item.name,
      category_id: item.category_id,
      category_name: item.category_name,
      planned_currency: item.planned_currency,
      planned_amount: item.planned_amount,
      actual_amount: actual,
      converted_planned: convertedPlanned,
      converted_actual: convertedActual,
      rate_used: rateUsed,
      rate_valid_on: rateValidOn,
      traffic_light_state: trafficLight,
    })
  }

  return {
    in_currency: args.inCurrency,
    items: summaryItems,
    totals: {
      converted_planned: round2(convertedPlannedSum),
      converted_actual: round2(convertedActualSum),
    },
    missing_rates: Array.from(missingRatesMap.values()).map((r) => ({
      from_currency: r.from,
      to_currency: r.to,
      item_count: r.count,
    })),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ──────────────────────────────────────────────────────────────────────
// DB-bound helper (used by the API route)
// ──────────────────────────────────────────────────────────────────────

interface ResolveSummaryArgs {
  supabase: SupabaseClient
  projectId: string
  tenantId: string
  inCurrency: SupportedCurrency
}

/**
 * Loads the data needed for the summary: items + their categories + totals
 * + tenant-scoped FX rates. Then delegates to `buildSummary`.
 */
export async function resolveBudgetSummary(
  args: ResolveSummaryArgs
): Promise<BudgetSummary> {
  const { supabase, projectId, tenantId, inCurrency } = args

  const [itemsRes, totalsRes, ratesRes] = await Promise.all([
    supabase
      .from("budget_items")
      .select("*, budget_categories!inner(name)")
      .eq("project_id", projectId)
      .eq("is_active", true),
    supabase
      .from("budget_item_totals")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active", true),
    supabase.from("fx_rates").select("*").eq("tenant_id", tenantId),
  ])

  if (itemsRes.error) {
    throw new Error(`resolveBudgetSummary items: ${itemsRes.error.message}`)
  }
  if (totalsRes.error) {
    throw new Error(`resolveBudgetSummary totals: ${totalsRes.error.message}`)
  }
  if (ratesRes.error) {
    throw new Error(`resolveBudgetSummary rates: ${ratesRes.error.message}`)
  }

  type ItemRow = BudgetItem & {
    budget_categories: { name: string } | { name: string }[]
  }
  const items = ((itemsRes.data ?? []) as unknown as ItemRow[]).map(
    (i): BudgetItem & { category_name: string } => {
      const cat = Array.isArray(i.budget_categories)
        ? i.budget_categories[0]
        : i.budget_categories
      const { budget_categories: _omit, ...rest } = i
      void _omit
      return { ...(rest as unknown as BudgetItem), category_name: cat?.name ?? "" }
    }
  )

  return buildSummary({
    inCurrency,
    items,
    totals: (totalsRes.data ?? []) as unknown as BudgetItemTotals[],
    rates: (ratesRes.data ?? []) as unknown as FxRate[],
  })
}
