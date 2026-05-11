/**
 * PROJ-21 — shared types for report snapshots (Status-Report and
 * Executive-Summary). The snapshot is immutable; `content` freezes
 * everything the renderer needs at create-time so re-renders or data
 * changes never alter an existing snapshot.
 *
 * The runtime data fed into status-traffic-light + the body components
 * lives in `SnapshotContent`. Keep this in sync with the backend
 * aggregator (`lib/reports/aggregate-snapshot-data.ts`).
 */

import type { DataClass } from "@/types/tenant-settings"

export type SnapshotKind = "status_report" | "executive_summary"

export const SNAPSHOT_KINDS: readonly SnapshotKind[] = [
  "status_report",
  "executive_summary",
] as const

export const SNAPSHOT_KIND_LABELS: Record<SnapshotKind, string> = {
  status_report: "Status-Report",
  executive_summary: "Executive-Summary",
}

export type TrafficLight = "green" | "yellow" | "red"

export const TRAFFIC_LIGHT_LABELS: Record<TrafficLight, string> = {
  green: "Im Plan",
  yellow: "Unter Beobachtung",
  red: "Kritisch",
}

export type PdfStatus = "pending" | "available" | "failed"

/** Data subset of a `risks` row needed by the traffic-light + body. */
export interface SnapshotRiskRef {
  id: string
  title: string
  probability: number
  impact: number
  score: number
  status: "open" | "mitigated" | "accepted" | "closed"
}

/** Data subset of a `decisions` row needed by the body. */
export interface SnapshotDecisionRef {
  id: string
  title: string
  decision_text: string
  decided_at: string
  is_revised: boolean
}

/** Data subset of a `phases` row needed by the body. */
export interface SnapshotPhaseRef {
  id: string
  name: string
  planned_start: string | null
  planned_end: string | null
  status: string
}

/** Data subset of a `milestones` row needed by the body. */
export interface SnapshotMilestoneRef {
  id: string
  name: string
  /** Mirrors `milestones.target_date` (date column, ISO string). */
  due_date: string | null
  status: string
  phase_id: string | null
}

/** Data subset of an `open_items` row needed by the body. The
 *  `open_items` schema has no due-date; "overdue" here means the
 *  item has been open longest without conversion. The aggregator
 *  surfaces `created_at` as `due_date` so existing renderers stay
 *  unchanged; the body label "fällig …" reads as "offen seit …". */
export interface SnapshotOpenItemRef {
  id: string
  title: string
  due_date: string | null
}

/** Counts derived from `work_items`. */
export type WorkItemAggregate = Record<string, number>

/** Header metadata frozen into the snapshot at create-time. */
export interface SnapshotHeader {
  project_id: string
  project_name: string
  project_method: string | null
  sponsor_name: string | null
  lead_name: string | null
  tenant_id: string
  tenant_name: string
  tenant_logo_url: string | null
  tenant_accent_color: string | null
}

/** Full content payload — frozen; lives in `report_snapshots.content` JSONB. */
export interface SnapshotContent {
  header: SnapshotHeader
  traffic_light: TrafficLight
  phases: SnapshotPhaseRef[]
  /** Next ≤ 5 upcoming milestones, sorted by `due_date` ascending. */
  upcoming_milestones: SnapshotMilestoneRef[]
  /** Top ≤ 5 open risks, sorted by `score` desc. */
  top_risks: SnapshotRiskRef[]
  /** Top ≤ 5 latest decisions, sorted by `decided_at` desc. */
  top_decisions: SnapshotDecisionRef[]
  /** Up to 3 most overdue open items. */
  overdue_open_items: SnapshotOpenItemRef[]
  open_items_total: number
  work_item_counts: {
    /** Aggregated by `kind`, e.g. {"story": 12, "task": 34, …}. */
    by_kind: WorkItemAggregate
    /** Aggregated by `status`, e.g. {"todo": 7, "done": 19, …}. */
    by_status: WorkItemAggregate
  }
  ki_summary: {
    text: string
    classification: DataClass
    provider: string
  } | null
  /** Free-text "Aktueller Stand" when the user typed it manually
   *  (Executive-Summary fallback when KI is disabled). */
  manual_summary: string | null
  generated_by_name: string
  generated_at: string
  /**
   * PROJ-56-ε — readiness snapshot at the moment the report was
   * generated. Frozen with the report so the printed PDF reflects
   * the state the project was in. Optional because pre-PROJ-56
   * snapshots don't have it; the renderer falls back to "—".
   */
  readiness?: {
    state: "not_ready" | "ready_with_gaps" | "ready"
    open_blockers: number
    open_warnings: number
    satisfied: number
  }
}

/** A snapshot row as returned by the API list endpoint. */
export interface ReportSnapshot {
  id: string
  tenant_id: string
  project_id: string
  kind: SnapshotKind
  version: number
  generated_by: string
  generated_at: string
  content: SnapshotContent
  pdf_storage_key: string | null
  pdf_status: PdfStatus
  ki_summary_classification: DataClass | null
  ki_provider: string | null
}

/** Compact list-view shape — body component uses the full `content`. */
export interface SnapshotListItem {
  id: string
  kind: SnapshotKind
  version: number
  generated_at: string
  generated_by_name: string
  has_ki_summary: boolean
  pdf_status: PdfStatus
}

/** Request body for `POST /api/projects/[id]/snapshots`. */
export interface CreateSnapshotRequest {
  kind: SnapshotKind
  /** When set, the server expects `ki_summary_text` and includes it
   *  in `content.ki_summary` (after Class-3 routing in PROJ-12). */
  ki_summary_text?: string
  /** Free-text "Aktueller Stand" — Exec-Summary only. */
  manual_summary?: string
}

/** Request body for `POST /api/projects/[id]/snapshots/preview-ki`. */
export interface PreviewKiRequest {
  kind: SnapshotKind
}

/** Response body for `POST /api/projects/[id]/snapshots/preview-ki`. */
export interface PreviewKiResponse {
  text: string
  classification: DataClass
  provider: string
}
