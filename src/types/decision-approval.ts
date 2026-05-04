/**
 * PROJ-31 — types for the Approval-Gates workflow.
 *
 * Approval state lives in `decision_approval_state` (1:1 with decisions),
 * not as columns on `decisions` itself — the V2-rooted immutability trigger
 * on `decisions` rejects every UPDATE, so approval status MUST stay out.
 */

export type ApprovalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: "Entwurf",
  pending: "In Genehmigung",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  withdrawn: "Zurückgezogen",
}

export type ApproverResponse = "approve" | "reject" | null

export const APPROVER_RESPONSE_LABELS: Record<
  Exclude<ApproverResponse, null> | "pending",
  string
> = {
  approve: "Zugestimmt",
  reject: "Abgelehnt",
  pending: "Offen",
}

export type ApprovalEventType =
  | "submitted_for_approval"
  | "approver_responded"
  | "approver_requested_info"
  | "approver_withdrawn"
  | "quorum_reached"
  | "quorum_unreachable"
  | "withdrawn"
  | "revised"
  | "token_renewed"

export interface DecisionApprovalState {
  decision_id: string
  tenant_id: string
  status: ApprovalStatus
  quorum_required: number | null
  submitted_at: string | null
  decided_at: string | null
}

export interface DecisionApprover {
  id: string
  decision_id: string
  stakeholder_id: string
  /** Display-only — backend gives us the joined stakeholder name. */
  stakeholder_name?: string
  /** Display-only — true when stakeholders.linked_user_id is set. */
  is_internal?: boolean
  magic_link_expires_at: string | null
  response: ApproverResponse
  responded_at: string | null
  comment: string | null
  /** PROJ-31 follow-up — most recent info-request comment (overwritten). */
  request_info_comment?: string | null
  /** PROJ-31 follow-up — timestamp of the most recent info-request. */
  request_info_at?: string | null
  /** Display-only — linked Plattform-User UUID (when stakeholder is internal). */
  linked_user_id?: string | null
}

export interface DecisionApprovalEvent {
  id: string
  decision_id: string
  event_type: ApprovalEventType
  /** One of actor_user_id / actor_stakeholder_id is set. */
  actor_user_id: string | null
  actor_stakeholder_id: string | null
  /** Display-only — joined name of whoever acted. */
  actor_label?: string
  payload: Record<string, unknown> | null
  created_at: string
}

/**
 * Aggregated payload returned by the GET decision-detail endpoint when
 * approval is in play. Keeps the wire format stable.
 */
export interface DecisionApprovalBundle {
  state: DecisionApprovalState
  approvers: DecisionApprover[]
  events: DecisionApprovalEvent[]
}

/**
 * Returned by GET /api/dashboard/approvals — one row per pending Approver
 * entry tied to the logged-in user (via stakeholders.linked_user_id).
 */
export interface PendingApprovalSummary {
  decision_id: string
  decision_title: string
  project_id: string
  project_name: string
  approver_id: string
  magic_link_expires_at: string | null
  submitted_at: string | null
}

/**
 * Public payload returned by GET /api/approve/[token].
 * Title + body are gated by token validation — server-side check enforces
 * HMAC + tenant_id + expiry + decision-status + is_revised.
 */
export interface ApprovalTokenPayload {
  decision: {
    id: string
    title: string
    decision_text: string
    rationale: string | null
    decided_at: string
  }
  approver: {
    id: string
    stakeholder_name: string
  }
  state: {
    status: ApprovalStatus
    quorum_required: number
    quorum_received_approvals: number
    quorum_received_rejections: number
  }
  alreadyResponded: boolean
  /** Set when the token is past expiry; UI shows a "renew via PM" hint. */
  expired: boolean
}
