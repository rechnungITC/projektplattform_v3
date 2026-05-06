/**
 * PROJ-35 Phase 35-γ — fetch wrapper for the stakeholder-health endpoint.
 */

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${r.status}`
  } catch {
    return `HTTP ${r.status}`
  }
}

export interface StakeholderHealthRow {
  id: string
  name: string
  is_active: boolean
  attitude: string | null
  conflict_potential: string | null
  decision_authority: string | null
  influence: string | null
  impact: string | null
  communication_need: string | null
  preferred_channel: string | null
  current_escalation_patterns: string[]
  agreeableness_fremd: number | null
  emotional_stability_fremd: number | null
  on_critical_path: boolean
  /**
   * PROJ-43-γ — granular sources for the on_critical_path flag.
   * Drives the dashboard tooltip ("Vom PM markiert" / "Vom Algorithmus erkannt"
   * / "Beide"). Marked optional so older payloads (pre-γ) deserialize cleanly.
   */
  critical_path_sources?: {
    manual: boolean
    computed: boolean
  }
}

export interface StakeholderHealthResponse {
  stakeholders: StakeholderHealthRow[]
  risk_score_overrides: Record<string, unknown>
  tenant_id: string
}

export async function fetchStakeholderHealth(
  projectId: string,
): Promise<StakeholderHealthResponse> {
  const r = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/stakeholder-health`,
    { method: "GET", cache: "no-store" },
  )
  if (!r.ok) throw new Error(await safeError(r))
  return (await r.json()) as StakeholderHealthResponse
}

export interface RiskTrendPoint {
  at: string
  score: number
  bucket: "green" | "yellow" | "orange" | "red"
}

export interface RiskTrendResponse {
  days: 30 | 90 | 365
  points: RiskTrendPoint[]
  current: { score: number; bucket: RiskTrendPoint["bucket"] }
}

export async function fetchRiskTrend(
  projectId: string,
  stakeholderId: string,
  days: 30 | 90 | 365 = 90,
): Promise<RiskTrendResponse> {
  const r = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/stakeholders/${encodeURIComponent(stakeholderId)}/risk-trend?days=${days}`,
    { method: "GET", cache: "no-store" },
  )
  if (!r.ok) throw new Error(await safeError(r))
  return (await r.json()) as RiskTrendResponse
}
