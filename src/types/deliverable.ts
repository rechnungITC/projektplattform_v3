// PROJ-104 — Deliverables (M&A Epic D). A per-project catalog object anchored to
// a phase and/or workstream, with a status lifecycle, responsible person, RACI,
// and external document links.

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export const DELIVERABLE_STATUSES = [
  "planned",
  "in_progress",
  "in_review",
  "approved",
  "suspended",
] as const
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number]

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  planned: "Geplant",
  in_progress: "In Arbeit",
  in_review: "In Review",
  approved: "Freigegeben",
  suspended: "Ausgesetzt",
}

/**
 * Status transitions PROJ-104 may perform. `approved` is set by the PROJ-105
 * approval workflow, not here — it is a known terminal value but not reachable
 * via transition_deliverable_status.
 */
export const DELIVERABLE_ALLOWED_TRANSITIONS: Record<
  DeliverableStatus,
  DeliverableStatus[]
> = {
  planned: ["in_progress", "suspended"],
  in_progress: ["in_review", "planned", "suspended"],
  in_review: ["in_progress", "suspended"],
  suspended: ["planned"],
  approved: [], // PROJ-105 owns further transitions
}

export interface Deliverable {
  id: string
  tenant_id: string
  project_id: string
  name: string
  description: string | null
  phase_id: string | null
  workstream_id: string | null
  responsible_user_id: string | null
  due_date: string | null
  status: DeliverableStatus
  confidentiality_level: MaConfidentialityLevel
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DeliverableDocument {
  id: string
  tenant_id: string
  deliverable_id: string
  title: string
  url: string
  tag_keys: string[]
  created_by: string | null
  created_at: string
  // PROJ-106 — version chain (core immutable-supersede)
  version_no: number
  supersedes_document_id: string | null
  is_current: boolean
  version_comment: string | null
  approved_in_event_id: string | null
}
