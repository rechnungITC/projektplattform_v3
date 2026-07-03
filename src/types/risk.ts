/**
 * PROJ-20 — risk types. PROJ-107 adds category + confidentiality (M&A).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

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
  // PROJ-107 — M&A risk register additions.
  category_id: string | null
  confidentiality_level: MaConfidentialityLevel
  workstream_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * PROJ-107 — tenant-scoped risk category catalog (M&A DUP→REUSE).
 * `applies_to_project_type` null = applies to all project types.
 */
export interface RiskCategory {
  id: string
  tenant_id: string
  key: string
  label: string
  applies_to_project_type: string | null
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
