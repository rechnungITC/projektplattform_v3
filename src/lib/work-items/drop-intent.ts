import {
  WORK_ITEM_STATUSES,
  type WorkItemStatus,
} from "@/types/work-item"

export type WorkItemDropIntent =
  | { type: "status"; status: WorkItemStatus }
  | { type: "sprint"; sprintId: string }
  | { type: "sprint-item"; sprintId: string; workItemId: string }
  | { type: "sprint-backlog" }
  | { type: "parent"; parentId: string }
  | { type: "parent-none" }
  | { type: "unknown"; raw: string }

export function statusDropId(status: WorkItemStatus): string {
  return `status:${status}`
}

export function sprintDropId(sprintId: string): string {
  return `sprint:${sprintId}`
}

export function sprintItemDropId(sprintId: string, workItemId: string): string {
  return `sprint-item:${sprintId}:${workItemId}`
}

export function parentDropId(parentId: string): string {
  return `parent:${parentId}`
}

export const SPRINT_BACKLOG_DROP_ID = "backlog"
export const PARENT_NONE_DROP_ID = "parent-none"

export function parseWorkItemDropIntent(raw: string): WorkItemDropIntent {
  if (raw === SPRINT_BACKLOG_DROP_ID) return { type: "sprint-backlog" }
  if (raw === PARENT_NONE_DROP_ID) return { type: "parent-none" }

  if (raw.startsWith("status:")) {
    const status = raw.slice("status:".length)
    if (WORK_ITEM_STATUSES.includes(status as WorkItemStatus)) {
      return { type: "status", status: status as WorkItemStatus }
    }
    return { type: "unknown", raw }
  }

  if (raw.startsWith("sprint-item:")) {
    const [, sprintId, workItemId] = raw.split(":")
    if (sprintId && workItemId) {
      return { type: "sprint-item", sprintId, workItemId }
    }
    return { type: "unknown", raw }
  }

  if (raw.startsWith("sprint:")) {
    const sprintId = raw.slice("sprint:".length)
    if (sprintId) return { type: "sprint", sprintId }
    return { type: "unknown", raw }
  }

  if (raw.startsWith("parent:")) {
    const parentId = raw.slice("parent:".length)
    if (parentId) return { type: "parent", parentId }
    return { type: "unknown", raw }
  }

  return { type: "unknown", raw }
}
