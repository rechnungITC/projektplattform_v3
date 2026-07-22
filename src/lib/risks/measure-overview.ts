/**
 * PROJ-109 — Maßnahmen-Übersicht (read-only) client wrapper + types.
 *
 * A "Maßnahme" is a task (work_item) linked to a risk via risk_links(work_item)
 * — the primitive shipped with PROJ-107; status/deadline/owner/workstream live
 * on the work_item, so this surface only READS them. The overview is served by
 * the SECURITY INVOKER RPC risk_measure_overview, need-to-know inherited from
 * the risks/work_items RESTRICTIVE gates. No new write model.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type { RiskStatus } from "@/types/risk"
import type { WorkItemKind, WorkItemStatus } from "@/types/work-item"

/** One measure = a work_item linked to the risk. */
export interface RiskMeasure {
  id: string
  title: string
  kind: WorkItemKind
  status: WorkItemStatus
  due_date: string | null
  responsible_user_id: string | null
  workstream_id: string | null
}

/** One risk with its linked measures + derived coverage flags. */
export interface RiskMeasureRow {
  id: string
  title: string
  status: RiskStatus
  responsible_user_id: string | null
  workstream_id: string | null
  confidentiality_level: MaConfidentialityLevel
  /** Free-text acceptance rationale / mitigation note (PROJ-20). */
  mitigation: string | null
  probability: number
  impact: number
  score: number
  measure_count: number
  has_measure: boolean
  accepted_with_rationale: boolean
  /** covered = has a measure OR accepted-with-rationale OR mitigated/closed. */
  covered: boolean
  /** AC3 soft signal: open risk, no measure, no documented acceptance. */
  active_uncovered: boolean
  measures: RiskMeasure[]
}

export interface RiskMeasureSummary {
  risk_total: number
  active_total: number
  active_uncovered: number
  measure_total: number
}

export interface RiskMeasureOverview {
  risks: RiskMeasureRow[]
  summary: RiskMeasureSummary
}

const EMPTY_SUMMARY: RiskMeasureSummary = {
  risk_total: 0,
  active_total: 0,
  active_uncovered: 0,
  measure_total: 0,
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string }
    }
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/**
 * Live measures overview for a project — one risk per row with its linked
 * measure-tasks + coverage flags. Need-to-know-scoped server-side.
 */
export async function fetchRiskMeasureOverview(
  projectId: string
): Promise<RiskMeasureOverview> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/risk-measure-overview`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const json = (await res.json()) as Partial<RiskMeasureOverview>
  return {
    risks: json.risks ?? [],
    summary: json.summary ?? EMPTY_SUMMARY,
  }
}
