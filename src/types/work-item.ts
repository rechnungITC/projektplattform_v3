/**
 * Work Item types for PROJ-9 (Work Item Metamodel + Sprints + Dependencies).
 * The metamodel mirrors the V2 ADRs `work-item-metamodel.md` and
 * `method-object-mapping.md` — see Tech Design § C, § D in the spec.
 *
 * The frontend registries (kind visibility per method, allowed parents)
 * are duplicated in the backend (Tech Design § E "defense in depth").
 * When adding a kind here, the SQL function `validate_work_item_parent`
 * must be updated in the same migration.
 */

import type { ProjectMethod } from "@/types/project-method"

export type WorkItemKind =
  | "epic"
  | "feature"
  | "story"
  | "task"
  | "subtask"
  | "bug"
  | "work_package"

export const WORK_ITEM_KINDS: readonly WorkItemKind[] = [
  "epic",
  "feature",
  "story",
  "task",
  "subtask",
  "bug",
  "work_package",
] as const

export const WORK_ITEM_KIND_LABELS: Record<WorkItemKind, string> = {
  epic: "Epic",
  feature: "Feature",
  story: "Story",
  task: "Task",
  subtask: "Subtask",
  bug: "Bug",
  work_package: "Arbeitspaket",
}

export type WorkItemStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled"

export const WORK_ITEM_STATUSES: readonly WorkItemStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const

export const WORK_ITEM_STATUS_LABELS: Record<WorkItemStatus, string> = {
  todo: "Offen",
  in_progress: "In Arbeit",
  blocked: "Blockiert",
  done: "Erledigt",
  cancelled: "Abgebrochen",
}

export type WorkItemPriority = "low" | "medium" | "high" | "critical"

export const WORK_ITEM_PRIORITIES: readonly WorkItemPriority[] = [
  "low",
  "medium",
  "high",
  "critical",
] as const

export const WORK_ITEM_PRIORITY_LABELS: Record<WorkItemPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
}

/**
 * Method visibility per kind. Bug is in every method by spec
 * (cross-method bugs — V2 EP-07-ST-04).
 */
export const WORK_ITEM_METHOD_VISIBILITY: Record<
  WorkItemKind,
  ProjectMethod[]
> = {
  epic: ["scrum", "safe", "general"],
  feature: ["safe", "general"],
  story: ["scrum", "kanban", "safe", "general"],
  task: ["scrum", "kanban", "safe", "waterfall", "pmi", "general"],
  subtask: ["scrum", "safe", "general"],
  bug: ["scrum", "kanban", "safe", "waterfall", "pmi", "general"],
  work_package: ["waterfall", "pmi", "general"],
}

/**
 * Allowed parent kinds per child kind (Tech Design § D).
 * `null` means the kind may be top-level. `subtask` requires a `task` parent.
 * `bug` may attach to any other kind or stand alone.
 */
export const ALLOWED_PARENT_KINDS: Record<
  WorkItemKind,
  (WorkItemKind | null)[]
> = {
  epic: [null],
  feature: ["epic", null],
  story: ["epic", "feature", null],
  task: ["story", null],
  subtask: ["task"],
  bug: [
    "epic",
    "feature",
    "story",
    "task",
    "subtask",
    "work_package",
    null,
  ],
  work_package: [null],
}

export interface WorkItem {
  id: string
  tenant_id: string
  project_id: string
  kind: WorkItemKind
  parent_id: string | null
  phase_id: string | null
  milestone_id: string | null
  sprint_id: string | null
  title: string
  description: string | null
  status: WorkItemStatus
  priority: WorkItemPriority
  responsible_user_id: string | null
  attributes: Record<string, unknown>
  position: number | null
  created_from_proposal_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  is_deleted: boolean
}

export interface WorkItemWithProfile extends WorkItem {
  responsible_display_name: string | null
  responsible_email: string | null
}

/** Minimal parent reference for breadcrumb / chain rendering. */
export interface WorkItemParentRef {
  id: string
  kind: WorkItemKind
  title: string
  parent_id: string | null
}

/**
 * True when the candidate kind is allowed under the given parent kind.
 * Pass `null` for parent to check "top-level allowed".
 */
export function isAllowedParent(
  childKind: WorkItemKind,
  parentKind: WorkItemKind | null
): boolean {
  return ALLOWED_PARENT_KINDS[childKind].includes(parentKind)
}

/**
 * True when a kind is creatable in the given project method.
 */
export function isKindVisibleInMethod(
  kind: WorkItemKind,
  method: ProjectMethod
): boolean {
  return WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)
}
