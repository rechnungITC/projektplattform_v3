/**
 * PROJ-131 — Management-Reporting & Steering-Dashboard (VIEW-class, read-only).
 *
 * Shape of the SECURITY-INVOKER RPC `steering_report(project)`. Bundles the
 * steering-level sections — deal_status (A2), next_stage_gate (F1),
 * red_flags (G3 findings + E2 risks), critical_tasks (PROJ-103 logic) and a
 * steering pre_read (H1). Everything that reaches the client is already
 * need-to-know-filtered for the caller. Kaufpreis (I1/I2) and Synergie (K2)
 * are NOT part of this shape — the UI renders "not-yet-available" placeholders
 * until PROJ-120/121/126 land (AC-131-5 → PROJ-Y-131a).
 */

import type { ReportConfidentiality } from "@/lib/audit/confidential-read"
import type {
  FindingSeverity,
  FindingStatus,
  FindingTreatment,
} from "@/lib/ma-project/dd-findings-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type { ValuationMethod } from "@/types/valuation"
import type { WorkItemKind, WorkItemStatus } from "@/types/work-item"

export type SteeringPhaseStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "suspended"
  | "cancelled"

export type SteeringGateStatus = "pending" | "passed" | "conditional" | "aborted"

export type RiskSeverityBucket =
  | "unknown"
  | "low"
  | "medium"
  | "high"
  | "critical"

export interface SteeringCurrentPhase {
  id: string
  name: string
  sequence_number: number
  status: SteeringPhaseStatus
}

export interface SteeringPhaseSummary {
  total: number
  planned: number
  in_progress: number
  completed: number
  suspended: number
  cancelled: number
}

export interface SteeringDealStatus {
  lifecycle_status: string | null
  current_phase: SteeringCurrentPhase | null
  phase_summary: SteeringPhaseSummary
}

export interface SteeringNextGate {
  id: string
  sequence_number: number
  status: SteeringGateStatus
  target_phase_id: string | null
  target_phase_name: string | null
  confidentiality_level: MaConfidentialityLevel
}

export interface SteeringGateSummary {
  total: number
  pending: number
  passed: number
  conditional: number
  aborted: number
}

export interface SteeringRedFlagFinding {
  id: string
  dd_stream_id: string
  stream_label: string | null
  title: string
  severity: FindingSeverity
  economic_impact_eur: number | null
  recommended_treatment: FindingTreatment | null
  status: FindingStatus
  confidentiality_level: MaConfidentialityLevel
}

export interface SteeringRedFlagRisk {
  id: string
  title: string
  probability: number
  impact: number
  score: number
  severity_bucket: RiskSeverityBucket
  status: string
  workstream_id: string | null
  workstream_label: string | null
  confidentiality_level: MaConfidentialityLevel
}

export interface SteeringRedFlagSummary {
  finding_deal_breaker: number
  finding_hoch: number
  risk_critical: number
  risk_high: number
  total: number
}

export interface SteeringCriticalTask {
  id: string
  title: string
  kind: WorkItemKind
  status: WorkItemStatus
  due_date: string | null
  days_overdue: number
  responsible_user_id: string | null
  phase_id: string | null
  phase_name: string | null
  workstream_id: string | null
  workstream_label: string | null
  confidentiality_level: MaConfidentialityLevel
  is_overdue: boolean
  is_due_today: boolean
  is_due_this_week: boolean
  is_blocked: boolean
}

export interface SteeringTaskSummary {
  open_total: number
  overdue_total: number
  due_today_total: number
  due_this_week_total: number
  blocked_total: number
  critical_total: number
}

export interface SteeringPreRead {
  lifecycle_status: string | null
  current_phase_name: string | null
  next_gate_sequence: number | null
  next_gate_status: SteeringGateStatus | null
  open_red_flag_findings: number
  open_high_risks: number
  critical_tasks: number
  // PROJ-120 (F5) — Kaufpreisbandbreite der gültigen Bewertung. `null`, wenn es
  // keine Bewertung gibt ODER der Aufrufer dafür nicht freigegeben ist (die RPC
  // ist SECURITY INVOKER → Need-to-know greift, kein zweites Gate im Client).
  valuation_version_no: number | null
  valuation_value_low: number | null
  valuation_value_high: number | null
  valuation_currency: string | null
}

/** PROJ-120 — die gültige Bewertungsversion des Deals (AC4). */
export interface SteeringValuation {
  id: string
  version_no: number
  title: string
  valuation_date: string
  method: ValuationMethod
  value_low: number | null
  value_high: number | null
  currency: string
  version_comment: string | null
  author_user_id: string | null
  confidentiality_level: MaConfidentialityLevel
}

export interface SteeringReport {
  deal_status: SteeringDealStatus
  next_stage_gate: SteeringNextGate | null
  stage_gate_summary: SteeringGateSummary
  /** PROJ-120 — null ohne Bewertung oder ohne Clearance. */
  valuation: SteeringValuation | null
  red_flags: {
    findings: SteeringRedFlagFinding[]
    risks: SteeringRedFlagRisk[]
    summary: SteeringRedFlagSummary
  }
  critical_tasks: {
    tasks: SteeringCriticalTask[]
    summary: SteeringTaskSummary
  }
  pre_read: SteeringPreRead
  /**
   * PROJ-130-δ2 — Stufen-Zusammenfassung dieser Auswertung, von der RPC im
   * INVOKER-Kontext des Aufrufers berechnet. Grundlage der Zugriffs-
   * Protokollierung; NICHT aus der Nutzlast rechenbar, weil `stage_gate_summary`
   * und `pre_read` über Objekte aggregieren, deren Stufen nie einzeln erscheinen.
   */
  confidentiality: ReportConfidentiality
}

export const EMPTY_STEERING_REPORT: SteeringReport = {
  deal_status: {
    lifecycle_status: null,
    current_phase: null,
    phase_summary: {
      total: 0,
      planned: 0,
      in_progress: 0,
      completed: 0,
      suspended: 0,
      cancelled: 0,
    },
  },
  next_stage_gate: null,
  stage_gate_summary: { total: 0, pending: 0, passed: 0, conditional: 0, aborted: 0 },
  valuation: null,
  red_flags: {
    findings: [],
    risks: [],
    summary: {
      finding_deal_breaker: 0,
      finding_hoch: 0,
      risk_critical: 0,
      risk_high: 0,
      total: 0,
    },
  },
  critical_tasks: {
    tasks: [],
    summary: {
      open_total: 0,
      overdue_total: 0,
      due_today_total: 0,
      due_this_week_total: 0,
      blocked_total: 0,
      critical_total: 0,
    },
  },
  pre_read: {
    lifecycle_status: null,
    current_phase_name: null,
    next_gate_sequence: null,
    next_gate_status: null,
    open_red_flag_findings: 0,
    open_high_risks: 0,
    critical_tasks: 0,
    valuation_version_no: null,
    valuation_value_low: null,
    valuation_value_high: null,
    valuation_currency: null,
  },
  confidentiality: { max_level: "standard", confidential_count: 0 },
}

/** Export sections for the CSV endpoint (?section=). */
export type SteeringExportSection = "findings" | "risks" | "tasks"
