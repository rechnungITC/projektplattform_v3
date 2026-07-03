// PROJ-102 — Workstreams (M&A Epic C). A per-project steering unit that groups
// work_items + risks (via nullable FKs) and can span one or more phases (M:N).

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export const WORKSTREAM_RAG_STATUSES = ["green", "amber", "red"] as const
export type WorkstreamRagStatus = (typeof WORKSTREAM_RAG_STATUSES)[number]

export const WORKSTREAM_RAG_LABELS: Record<WorkstreamRagStatus, string> = {
  green: "Grün",
  amber: "Gelb",
  red: "Rot",
}

export interface Workstream {
  id: string
  tenant_id: string
  project_id: string
  workstream_key: string
  label: string
  goal: string | null
  lead_user_id: string | null
  rag_status: WorkstreamRagStatus
  scope: string | null
  notes: string | null
  confidentiality_level: MaConfidentialityLevel
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Per-workstream aggregate from the workstream_dashboard RPC. */
export interface WorkstreamDashboardRow {
  workstream_id: string
  tasks_total: number
  tasks_done: number
  open_risks: number
  /** PROJ-104 — real deliverable count (was null placeholder pre-PROJ-104). */
  deliverables_total: number | null
  /** PROJ-104 — deliverables past due & not approved/suspended (Deliverable-Ampel). */
  deliverables_overdue?: number | null
}
