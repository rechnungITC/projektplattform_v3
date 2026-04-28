/**
 * PROJ-20 — risk types.
 */

export type RiskStatus = "open" | "mitigated" | "accepted" | "closed"

export const RISK_STATUSES: readonly RiskStatus[] = [
  "open",
  "mitigated",
  "accepted",
  "closed",
] as const

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: "Offen",
  mitigated: "Gemindert",
  accepted: "Akzeptiert",
  closed: "Geschlossen",
}

export interface Risk {
  id: string
  tenant_id: string
  project_id: string
  title: string
  description: string | null
  probability: number
  impact: number
  score: number
  status: RiskStatus
  mitigation: string | null
  responsible_user_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}
