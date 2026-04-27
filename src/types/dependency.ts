/**
 * Dependency types for PROJ-9 — predecessor/successor edges between
 * work items (Tech Design § C). Four standard Gantt edge types.
 */

export type DependencyType = "FS" | "SS" | "FF" | "SF"

export const DEPENDENCY_TYPES: readonly DependencyType[] = [
  "FS",
  "SS",
  "FF",
  "SF",
] as const

export const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  FS: "Finish-to-Start (Standard)",
  SS: "Start-to-Start",
  FF: "Finish-to-Finish",
  SF: "Start-to-Finish",
}

export interface Dependency {
  id: string
  tenant_id: string
  project_id: string
  predecessor_id: string
  successor_id: string
  type: DependencyType
  lag_days: number
  created_by: string
  created_at: string
}
