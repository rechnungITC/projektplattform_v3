/**
 * PROJ-132 — Operatives Reporting (VIEW-class, read-only).
 *
 * Shape of the SECURITY-INVOKER RPC `operative_report(project)`. Bundles four
 * operative sections (tasks_overdue C1 / findings_by_severity G3 / qa_by_stream
 * G2 / deliverables_status D1) plus a weekly-steering pre-read (H1). Everything
 * that reaches the client is already need-to-know-filtered for the caller.
 */

import type {
  FindingSeverity,
  FindingStatus,
  FindingTreatment,
} from "@/lib/ma-project/dd-findings-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type { DeliverableStatus } from "@/types/deliverable"
import type { WorkItemKind, WorkItemStatus } from "@/types/work-item"

export interface OperativeTaskRow {
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

export interface OperativeTaskSummary {
  open_total: number
  overdue_total: number
  due_today_total: number
  due_this_week_total: number
  blocked_total: number
}

export interface OperativeFindingStreamAgg {
  dd_stream_id: string
  stream_label: string | null
  open_total: number
  sev_niedrig: number
  sev_mittel: number
  sev_hoch: number
  sev_deal_breaker: number
  eur_sum: number
  null_eur_count: number
}

export interface OperativeFindingRow {
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

export interface OperativeQaRow {
  dd_stream_id: string
  stream_label: string | null
  qa_open: number
  qa_answered: number
}

export interface OperativeDeliverableRow {
  id: string
  name: string
  status: DeliverableStatus
  due_date: string | null
  responsible_user_id: string | null
  phase_id: string | null
  phase_name: string | null
  workstream_id: string | null
  workstream_label: string | null
  confidentiality_level: MaConfidentialityLevel
  is_overdue: boolean
}

export interface OperativeDeliverableSummary {
  total: number
  planned: number
  in_progress: number
  in_review: number
  approved: number
  suspended: number
  overdue_total: number
  not_approved_total: number
}

export interface OperativePreRead {
  overdue_tasks: number
  open_deal_breaker_findings: number
  open_qa: number
  deliverables_not_approved: number
}

export interface OperativeReport {
  tasks_overdue: {
    tasks: OperativeTaskRow[]
    summary: OperativeTaskSummary
  }
  findings_by_severity: {
    streams: OperativeFindingStreamAgg[]
    findings: OperativeFindingRow[]
  }
  qa_by_stream: OperativeQaRow[]
  deliverables_status: {
    deliverables: OperativeDeliverableRow[]
    summary: OperativeDeliverableSummary
  }
  pre_read: OperativePreRead
}

export const EMPTY_OPERATIVE_REPORT: OperativeReport = {
  tasks_overdue: {
    tasks: [],
    summary: {
      open_total: 0,
      overdue_total: 0,
      due_today_total: 0,
      due_this_week_total: 0,
      blocked_total: 0,
    },
  },
  findings_by_severity: { streams: [], findings: [] },
  qa_by_stream: [],
  deliverables_status: {
    deliverables: [],
    summary: {
      total: 0,
      planned: 0,
      in_progress: 0,
      in_review: 0,
      approved: 0,
      suspended: 0,
      overdue_total: 0,
      not_approved_total: 0,
    },
  },
  pre_read: {
    overdue_tasks: 0,
    open_deal_breaker_findings: 0,
    open_qa: 0,
    deliverables_not_approved: 0,
  },
}

/** Export sections for the CSV endpoint (?section=). */
export type OperativeExportSection = "tasks" | "findings" | "qa" | "deliverables"
