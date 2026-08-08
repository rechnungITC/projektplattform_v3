import type { Skill } from "@/types/skill"

/**
 * PROJ-78 — Skill-Projektzuordnung.
 *
 * Verknüpft einen tenant-weiten Skill (PROJ-76) mit einem Projekt.
 * Zeilen entstehen und verschwinden ausschließlich über die RPCs
 * `assign_project_skills` / `remove_project_skill` — es gibt bewusst
 * keinen UPDATE-Pfad (die Zuordnung selbst ist unveränderlich; wer die
 * Herkunft ändern will, entfernt und ordnet neu zu).
 */

export type SkillAssignmentSource =
  | "auto_method"
  | "auto_project_type"
  | "auto_cross_cutting"
  | "manual_pm"
  | "manual_admin"

export const SKILL_ASSIGNMENT_SOURCES: readonly SkillAssignmentSource[] = [
  "auto_method",
  "auto_project_type",
  "auto_cross_cutting",
  "manual_pm",
  "manual_admin",
] as const

export const SKILL_ASSIGNMENT_SOURCE_LABELS: Record<
  SkillAssignmentSource,
  string
> = {
  auto_method: "Methode",
  auto_project_type: "Projekttyp",
  auto_cross_cutting: "Übergreifend",
  manual_pm: "Manuell (PM)",
  manual_admin: "Manuell (Admin)",
}

/** True für die drei automatisch aufgelösten Herkünfte. */
export function isAutoSource(source: SkillAssignmentSource): boolean {
  return source.startsWith("auto_")
}

export interface ProjectSkill {
  id: string
  tenant_id: string
  project_id: string
  skill_id: string
  assignment_source: SkillAssignmentSource
  assigned_at: string
  assigned_by: string | null
}

/** Zuordnung samt aufgelöstem Katalog-Eintrag (Listen-Ansicht). */
export interface ProjectSkillWithSkill extends ProjectSkill {
  skill: Skill
}

/**
 * Ein aufgelöster Vorschlag — noch nicht persistiert.
 * `reason` ist die menschenlesbare Begründung (z. B. „Methode: Scrum"),
 * die im Wizard und im Abgleichs-Dialog als Herkunfts-Label erscheint.
 */
export interface ResolvedSkillCandidate {
  skill: Skill
  assignment_source: SkillAssignmentSource
  reason: string
}

export const PROJECT_SKILL_SELECT =
  "id, tenant_id, project_id, skill_id, assignment_source, assigned_at, assigned_by"
