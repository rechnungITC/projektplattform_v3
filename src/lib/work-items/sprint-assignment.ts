import type { WorkItemKind } from "@/types/work-item"

export const SPRINT_ASSIGNABLE_KINDS = ["story", "task", "bug"] as const satisfies readonly WorkItemKind[]

export type SprintAssignableWorkItemKind =
  (typeof SPRINT_ASSIGNABLE_KINDS)[number]

export function isSprintAssignableKind(
  kind: WorkItemKind | string
): kind is SprintAssignableWorkItemKind {
  return SPRINT_ASSIGNABLE_KINDS.includes(kind as SprintAssignableWorkItemKind)
}
