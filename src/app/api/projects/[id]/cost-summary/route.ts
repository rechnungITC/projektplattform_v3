import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

// PROJ-24 ST-07 — GET /api/projects/[id]/cost-summary
// Aggregates plan-cost across the whole project with breakdowns by:
//   - Epic (transitive: every descendant of an epic via parent_id rolls up)
//   - Phase (every work_item with phase_id = phase)
//   - Sprint (every work_item with sprint_id = sprint)
//   - "Unsorted" (work_items with no phase AND no sprint)
//
// Multi-currency policy: the route returns one bucket entry per (group, currency)
// pair instead of converting to a sammelwährung. PROJ-22 fx_rates is available
// for sammelwährungs-reports (PROJ-21), but this endpoint stays currency-explicit
// to avoid silent conversions in cost data. `multi_currency_warning` is true
// when any single bucket contains > 1 currency.
//
// Auth: project-member only. The view has `security_invoker = true` and
// work_items RLS is project-member; cross-project access yields empty data
// naturally. We still do an explicit 404 for non-existent / non-visible projects
// to keep parity with other project routes (no information leak).
//
// Performance: at < 500 work_items per project this is one round-trip for
// work_items + one for the cost-totals view + a TS-side O(n) aggregation.
// Epic transitive closure walks the parent_id chain in TS — depth is small
// (epics → features → stories → tasks, typically ≤ 4).

interface WorkItemRow {
  id: string
  kind: string
  parent_id: string | null
  phase_id: string | null
  sprint_id: string | null
  title: string
  is_deleted: boolean
}

interface CostTotalRow {
  work_item_id: string
  total_cost: number | string | null
  currency: string | null
  cost_lines_count: number | null
  multi_currency_count: number | null
}

interface CurrencyBucket {
  currency: string
  total: number
}

function pushBucketAmount(
  buckets: Map<string, number>,
  currency: string | null,
  amount: number
): void {
  if (!currency) return
  if (!Number.isFinite(amount) || amount === 0) return
  buckets.set(currency, (buckets.get(currency) ?? 0) + amount)
}

function bucketsToArray(buckets: Map<string, number>): CurrencyBucket[] {
  return Array.from(buckets.entries())
    .map(([currency, total]) => ({
      currency,
      // numeric(14,2) rounding policy — match the engine.
      total: Math.round(total * 100) / 100,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Cross-project access: RLS hides projects → 404 (no existence-leak).
  const { data: proj, error: projErr } = await supabase
    .from("projects")
    .select("id, tenant_id")
    .eq("id", projectId)
    .eq("is_deleted", false)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!proj) return apiError("not_found", "Project not found.", 404)

  // Pull work_items + cost totals in parallel. Both are RLS-scoped to the
  // caller; we don't need cross-tenant escalation here.
  const [itemsRes, totalsRes, phasesRes, sprintsRes] = await Promise.all([
    supabase
      .from("work_items")
      .select("id, kind, parent_id, phase_id, sprint_id, title, is_deleted")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .limit(2000),
    supabase
      .from("work_item_cost_totals")
      .select("work_item_id, total_cost, currency, cost_lines_count, multi_currency_count")
      .eq("project_id", projectId)
      .limit(2000),
    supabase
      .from("phases")
      .select("id, name")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("sequence_number", { ascending: true })
      .limit(500),
    supabase
      .from("sprints")
      .select("id, name")
      .eq("project_id", projectId)
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(500),
  ])

  if (itemsRes.error) return apiError("list_failed", itemsRes.error.message, 500)
  if (totalsRes.error) return apiError("list_failed", totalsRes.error.message, 500)
  if (phasesRes.error) return apiError("list_failed", phasesRes.error.message, 500)
  if (sprintsRes.error) return apiError("list_failed", sprintsRes.error.message, 500)

  const items = (itemsRes.data ?? []) as WorkItemRow[]
  const totals = (totalsRes.data ?? []) as CostTotalRow[]
  const phases = (phasesRes.data ?? []) as { id: string; name: string }[]
  const sprints = (sprintsRes.data ?? []) as { id: string; name: string }[]

  // Build a per-item cost-line list. The view returns one row per
  // (work_item_id, currency) — empty items have a single row with
  // currency=null + total_cost=0 from the LEFT JOIN. We collapse the per-item
  // *total_cost* (already a sum across that item's cost-lines in that view's
  // chosen currency) into the buckets below.
  //
  // The view's `currency` is the most-frequent currency. If an item has
  // multi_currency_count > 1 the raw total_cost mixes currencies — to avoid
  // that double-counting risk we re-pull cost-lines for items with
  // multi-currency mixes. With < 500 items this is fine.
  const itemTotalsById = new Map<string, CostTotalRow>()
  for (const t of totals) {
    itemTotalsById.set(t.work_item_id, t)
  }

  // Detect any item with mixed currencies — we need its cost-lines split.
  const multiCurrencyItemIds = totals
    .filter((t) => (t.multi_currency_count ?? 0) > 1)
    .map((t) => t.work_item_id)

  // Per-item aggregated buckets. Map<work_item_id, Map<currency, total>>.
  const itemBuckets = new Map<string, Map<string, number>>()

  for (const t of totals) {
    if ((t.multi_currency_count ?? 0) <= 1) {
      const currency = t.currency
      const total = t.total_cost == null ? 0 : Number(t.total_cost)
      if (currency && total > 0) {
        const m = new Map<string, number>()
        m.set(currency, total)
        itemBuckets.set(t.work_item_id, m)
      } else {
        itemBuckets.set(t.work_item_id, new Map())
      }
    }
  }

  if (multiCurrencyItemIds.length > 0) {
    const { data: lines, error: linesErr } = await supabase
      .from("work_item_cost_lines")
      .select("work_item_id, amount, currency")
      .eq("project_id", projectId)
      .in("work_item_id", multiCurrencyItemIds)
      .limit(5000)
    if (linesErr) return apiError("list_failed", linesErr.message, 500)
    const linesData = (lines ?? []) as {
      work_item_id: string
      amount: number | string
      currency: string
    }[]
    // Initialize the multi-currency item buckets to empty maps.
    for (const id of multiCurrencyItemIds) itemBuckets.set(id, new Map())
    for (const line of linesData) {
      const b = itemBuckets.get(line.work_item_id)
      if (!b) continue
      pushBucketAmount(b, line.currency, Number(line.amount))
    }
  }

  // Build a parent → descendants index for epic transitive closure.
  const childrenByParent = new Map<string, string[]>()
  for (const it of items) {
    if (it.parent_id) {
      const arr = childrenByParent.get(it.parent_id) ?? []
      arr.push(it.id)
      childrenByParent.set(it.parent_id, arr)
    }
  }

  function collectDescendants(rootId: string): Set<string> {
    const visited = new Set<string>()
    const queue: string[] = [rootId]
    while (queue.length > 0) {
      const cur = queue.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      const children = childrenByParent.get(cur)
      if (children) queue.push(...children)
    }
    return visited
  }

  // ---- Epic buckets ----
  const epics = items.filter((i) => i.kind === "epic")
  const byEpic = epics.map((epic) => {
    const ids = collectDescendants(epic.id)
    const buckets = new Map<string, number>()
    for (const id of ids) {
      const itemBucket = itemBuckets.get(id)
      if (!itemBucket) continue
      for (const [currency, total] of itemBucket) {
        pushBucketAmount(buckets, currency, total)
      }
    }
    return {
      epic_id: epic.id,
      epic_title: epic.title,
      buckets: bucketsToArray(buckets),
    }
  })

  // ---- Phase buckets ----
  const phaseNameById = new Map(phases.map((p) => [p.id, p.name]))
  const phaseBucketsById = new Map<string, Map<string, number>>()
  for (const it of items) {
    if (!it.phase_id) continue
    const m = phaseBucketsById.get(it.phase_id) ?? new Map<string, number>()
    const itemBucket = itemBuckets.get(it.id)
    if (itemBucket) {
      for (const [currency, total] of itemBucket) {
        pushBucketAmount(m, currency, total)
      }
    }
    phaseBucketsById.set(it.phase_id, m)
  }
  // Iterate phases in their fetched order so the response is stable even
  // when a phase has no items (we still return it with empty buckets).
  const byPhase = phases.map((p) => ({
    phase_id: p.id,
    phase_name: p.name,
    buckets: bucketsToArray(phaseBucketsById.get(p.id) ?? new Map()),
  }))

  // ---- Sprint buckets ----
  const sprintBucketsById = new Map<string, Map<string, number>>()
  for (const it of items) {
    if (!it.sprint_id) continue
    const m = sprintBucketsById.get(it.sprint_id) ?? new Map<string, number>()
    const itemBucket = itemBuckets.get(it.id)
    if (itemBucket) {
      for (const [currency, total] of itemBucket) {
        pushBucketAmount(m, currency, total)
      }
    }
    sprintBucketsById.set(it.sprint_id, m)
  }
  const bySprint = sprints.map((s) => ({
    sprint_id: s.id,
    sprint_name: s.name,
    buckets: bucketsToArray(sprintBucketsById.get(s.id) ?? new Map()),
  }))

  // ---- Unsorted bucket: items with no phase AND no sprint ----
  const unsortedBuckets = new Map<string, number>()
  for (const it of items) {
    if (it.phase_id || it.sprint_id) continue
    const itemBucket = itemBuckets.get(it.id)
    if (!itemBucket) continue
    for (const [currency, total] of itemBucket) {
      pushBucketAmount(unsortedBuckets, currency, total)
    }
  }
  const unsorted = { buckets: bucketsToArray(unsortedBuckets) }

  // ---- Multi-currency warning: any single bucket has > 1 currency ----
  const multiCurrencyWarning =
    byEpic.some((g) => g.buckets.length > 1) ||
    byPhase.some((g) => g.buckets.length > 1) ||
    bySprint.some((g) => g.buckets.length > 1) ||
    unsorted.buckets.length > 1

  return NextResponse.json({
    by_epic: byEpic,
    by_phase: byPhase,
    by_sprint: bySprint,
    unsorted,
    multi_currency_warning: multiCurrencyWarning,
  })
}
