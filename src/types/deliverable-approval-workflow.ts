// PROJ-105 — Freigabe-Workflow für Deliverables (M&A Epic D), Sub-Slice α.
// Parallel approval schema mirroring the PROJ-100c four-eyes primitives (NOT the
// generalized PROJ-31 decision engine). Sequential, one approver per stage.

export const DELIVERABLE_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
] as const
export type DeliverableApprovalStatus =
  (typeof DELIVERABLE_APPROVAL_STATUSES)[number]

export const DELIVERABLE_APPROVAL_STATUS_LABELS: Record<
  DeliverableApprovalStatus,
  string
> = {
  pending: "Läuft",
  approved: "Freigegeben",
  rejected: "Zurückgewiesen",
  withdrawn: "Zurückgezogen",
}

export type DeliverableApprovalStageResponse = "approve" | "reject"

export type DeliverableApprovalEventType =
  | "submitted"
  | "approver_responded"
  | "approved"
  | "rejected"
  | "withdrawn"

export interface DeliverableApprovalStage {
  id: string
  tenant_id: string
  approval_id: string
  stage_order: number
  approver_stakeholder_id: string
  response: DeliverableApprovalStageResponse | null
  responded_at: string | null
  comment: string | null
  created_at: string
}

export interface DeliverableApprovalEvent {
  id: string
  tenant_id: string
  approval_id: string
  stage_id: string | null
  event_type: DeliverableApprovalEventType
  actor_user_id: string | null
  comment: string | null
  created_at: string
}

export interface DeliverableApproval {
  id: string
  tenant_id: string
  project_id: string
  deliverable_id: string
  status: DeliverableApprovalStatus
  current_stage_order: number
  submitted_by: string
  submitted_at: string
  decided_at: string | null
  created_at: string
  updated_at: string
  stages?: DeliverableApprovalStage[]
  events?: DeliverableApprovalEvent[]
}

/** A pending stage where the current user is the active approver (My Work surface). */
export interface PendingDeliverableApprovalSummary {
  approval_id: string
  stage_id: string
  stage_order: number
  deliverable_id: string
  deliverable_name: string
  project_id: string
  project_name: string
  submitted_at: string
}
