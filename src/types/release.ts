import type {
  WorkItemKind,
  WorkItemPriority,
  WorkItemStatus,
} from "@/types/work-item"

export type ProjectReleaseStatus =
  | "planned"
  | "active"
  | "released"
  | "archived"

export const PROJECT_RELEASE_STATUS_LABELS: Record<
  ProjectReleaseStatus,
  string
> = {
  planned: "Geplant",
  active: "Aktiv",
  released: "Released",
  archived: "Archiviert",
}

export interface ProjectRelease {
  id: string
  tenant_id: string
  project_id: string
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
  status: ProjectReleaseStatus
  target_milestone_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type ReleaseDateSource =
  | "work_item"
  | "sprint"
  | "parent_story"
  | "unscheduled"

export const RELEASE_DATE_SOURCE_LABELS: Record<ReleaseDateSource, string> = {
  work_item: "Work Item",
  sprint: "Sprint",
  parent_story: "Parent Story",
  unscheduled: "Nicht geplant",
}

export interface ReleaseTimelineItem {
  id: string
  kind: WorkItemKind
  parent_id: string | null
  phase_id: string | null
  milestone_id: string | null
  sprint_id: string | null
  release_id: string | null
  title: string
  status: WorkItemStatus
  priority: WorkItemPriority
  planned_start?: string | null
  planned_end?: string | null
  timeline_start: string | null
  timeline_end: string | null
  date_source: ReleaseDateSource
  parent_story_id: string | null
  outside_release_window: boolean
  overdue: boolean
  blocked: boolean
  critical: boolean
}

export interface ReleaseSprintContribution {
  sprint_id: string
  name: string
  state: string
  start_date: string | null
  end_date: string | null
  item_count: number
  done_count: number
  blocked_count: number
}

export interface ReleaseHealthSummary {
  total_items: number
  done_items: number
  blocked_items: number
  critical_items: number
  outside_window_items: number
  overdue_items: number
  unscheduled_items: number
  contributing_sprints: number
}

export interface ReleaseSummaryPhase {
  id: string
  name: string
  planned_start: string | null
  planned_end: string | null
  status?: string | null
}

export interface ReleaseSummaryMilestone {
  id: string
  name: string
  target_date: string | null
  status?: string | null
  phase_id?: string | null
}

export interface ProjectReleaseSummary {
  release: ProjectRelease
  health: ReleaseHealthSummary
  items: ReleaseTimelineItem[]
  sprint_contributions: ReleaseSprintContribution[]
  phases: ReleaseSummaryPhase[]
  milestones: ReleaseSummaryMilestone[]
}

export interface ProjectReleaseSummaryResponse {
  summary: ProjectReleaseSummary
  truncated: boolean
}

export interface ReleaseAssignableWorkItem {
  id: string
  kind: WorkItemKind
  parent_id: string | null
  sprint_id: string | null
  release_id: string | null
  title: string
  status: WorkItemStatus
  priority: WorkItemPriority
  planned_start?: string | null
  planned_end?: string | null
  is_deleted?: boolean
}

export interface ReleaseWritePayload {
  name: string
  description?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: ProjectReleaseStatus
  target_milestone_id?: string | null
}
