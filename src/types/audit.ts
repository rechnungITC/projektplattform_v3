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
  | "risks"
  | "decisions"
  | "open_items"
  | "ma_project_profiles"
  | "ma_advisor_profiles"
  | "ma_ndas"
  | "skills"
  | "skill_versions"
  | "skill_examples"
  | "skill_knowledge_links"

export const AUDIT_ENTITY_TYPES: readonly AuditEntityType[] = [
  "stakeholders",
  "work_items",
  "phases",
  "milestones",
  "projects",
  "risks",
  "decisions",
  "open_items",
  "ma_project_profiles",
  "ma_advisor_profiles",
  "ma_ndas",
  "skills",
  "skill_versions",
  "skill_examples",
  "skill_knowledge_links",
] as const

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  stakeholders: "Stakeholder",
  work_items: "Work Item",
  phases: "Phase",
  milestones: "Meilenstein",
  projects: "Projekt",
  risks: "Risiko",
  decisions: "Entscheidung",
  open_items: "Offener Punkt",
  ma_project_profiles: "M&A-Grundlage",
  ma_advisor_profiles: "Berater-Profil",
  ma_ndas: "NDA",
  skills: "Skill",
  skill_versions: "Skill-Version",
  skill_examples: "Skill-Beispiel",
  skill_knowledge_links: "Skill-Wissensquelle",
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
