/**
 * PROJ-10 — audit log types.
 *
 * Audit rows are written by a Postgres trigger on UPDATE of the 5 tracked
 * entities. Users only ever read them (via /api/audit/...).
 */

export type AuditEntityType =
  | "stakeholders"
  | "work_items"
  | "phases"
  | "milestones"
  | "projects"

export const AUDIT_ENTITY_TYPES: readonly AuditEntityType[] = [
  "stakeholders",
  "work_items",
  "phases",
  "milestones",
  "projects",
] as const

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  stakeholders: "Stakeholder",
  work_items: "Work Item",
  phases: "Phase",
  milestones: "Meilenstein",
  projects: "Projekt",
}

export interface AuditLogEntry {
  id: string
  tenant_id: string
  entity_type: AuditEntityType
  entity_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  actor_user_id: string | null
  changed_at: string
  change_reason: string | null
}
