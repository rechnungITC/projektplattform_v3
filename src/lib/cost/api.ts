/**
 * PROJ-24 — fetch wrappers for /api/projects/[id]/work-items/[wid]/cost-lines
 * and /api/projects/[id]/cost-summary.
 */

import type { SupportedCurrency } from "@/types/tenant-settings"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export interface WorkItemCostLine {
  id: string
  tenant_id: string
  project_id: string
  work_item_id: string
  source_type:
    | "resource_allocation"
    | "manual"
    | "lv_position"
    | "material"
    | "stueckliste"
    | "mischkalkulation"
  amount: number
  currency: SupportedCurrency
  occurred_on: string | null
  source_ref_id: string | null
  source_metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
}

export interface ManualCostLineInput {
  amount: number
  currency: SupportedCurrency
  occurred_on?: string
  source_metadata?: Record<string, unknown>
}

const itemBase = (projectId: string, workItemId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/cost-lines`

export async function listWorkItemCostLines(
  projectId: string,
  workItemId: string
): Promise<WorkItemCostLine[]> {
  const res = await fetch(itemBase(projectId, workItemId), {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { cost_lines: WorkItemCostLine[] }
  return body.cost_lines ?? []
}

export async function createManualCostLine(
  projectId: string,
  workItemId: string,
  input: ManualCostLineInput
): Promise<WorkItemCostLine> {
  const res = await fetch(itemBase(projectId, workItemId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { cost_line: WorkItemCostLine }
  return body.cost_line
}

// ─── Per-item totals (Backlog list) ────────────────────────────────────

/**
 * One aggregated row per (work_item_id, currency) from the
 * `work_item_cost_totals` view. Items with multiple currencies appear as
 * multiple rows — the consumer renders them grouped by item-id.
 */
export interface WorkItemCostTotal {
  work_item_id: string
  total_cost: number | null
  currency: string | null
  cost_lines_count: number
  multi_currency_count: number
  is_estimated: boolean
}

export async function listWorkItemCostTotals(
  projectId: string
): Promise<WorkItemCostTotal[]> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-item-cost-totals`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { totals: WorkItemCostTotal[] }
  return body.totals ?? []
}
