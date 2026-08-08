import {
  PROJECT_METHOD_LABELS,
  type ProjectMethod,
} from "@/types/project-method"
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/types/project"
import type {
  ResolvedSkillCandidate,
  SkillAssignmentSource,
} from "@/types/project-skill"
import type { Skill } from "@/types/skill"

/**
 * PROJ-78 — Auto-Auflösung passender Skills für ein Projekt.
 *
 * Reine Funktion (keine DB, kein Netz) → vollständig unit-testbar.
 * Der Aufrufer übergibt den bereits RLS-gefilterten Katalog; ein
 * normaler PM sieht über `skills_select_member` ohnehin nur aktive
 * Skills, wir filtern `is_active` hier zusätzlich defensiv.
 *
 * Tag-Semantik (PROJ-76-Vokabular, `src/app/api/skills/_schema.ts`):
 *   **leeres Tag-Array = „gilt für alle"**. Ein Methoden-Skill ohne
 *   `method_tags` passt also auf jede Methode. Das weicht bewusst von
 *   der wörtlichen Spec-Formulierung („method_tags contains method") ab,
 *   die den Leer-Fall nie treffen würde und damit das dokumentierte
 *   Katalog-Vokabular gebrochen hätte.
 *
 * Priorität bei Mehrfach-Treffern: method → project_type → cross_cutting.
 * Der erste Treffer gewinnt und bestimmt die Herkunft (Spec-Edge-Case
 * „Same skill auto-assigned via two routes").
 */

/** Ein leeres Tag-Array bedeutet „gilt für alle" (PROJ-76-Vokabular). */
function tagMatches(tags: string[], value: string | null): boolean {
  if (tags.length === 0) return true
  if (value == null) return false
  return tags.includes(value)
}

export interface ResolveSkillsInput {
  skills: readonly Skill[]
  method: ProjectMethod | null
  projectType: ProjectType | null
}

export function resolveSkillsForProject({
  skills,
  method,
  projectType,
}: ResolveSkillsInput): ResolvedSkillCandidate[] {
  const seen = new Set<string>()
  const out: ResolvedSkillCandidate[] = []

  const push = (
    skill: Skill,
    assignment_source: SkillAssignmentSource,
    reason: string
  ) => {
    if (seen.has(skill.id)) return
    seen.add(skill.id)
    out.push({ skill, assignment_source, reason })
  }

  const active = skills.filter((s) => s.is_active)

  // 1) Methode — höchste Priorität.
  for (const skill of active) {
    if (skill.category !== "method") continue
    if (!tagMatches(skill.method_tags, method)) continue
    push(
      skill,
      "auto_method",
      method
        ? `Methode: ${PROJECT_METHOD_LABELS[method]}`
        : "Methode: gilt für alle"
    )
  }

  // 2) Projekttyp.
  for (const skill of active) {
    if (skill.category !== "project_type") continue
    if (!tagMatches(skill.project_type_tags, projectType)) continue
    push(
      skill,
      "auto_project_type",
      projectType
        ? `Projekttyp: ${PROJECT_TYPE_LABELS[projectType]}`
        : "Projekttyp: gilt für alle"
    )
  }

  // 3) Querschnitt — gilt immer, unabhängig von Methode und Typ.
  for (const skill of active) {
    if (skill.category !== "cross_cutting") continue
    push(skill, "auto_cross_cutting", "Übergreifend")
  }

  return out
}

/**
 * Additiver Abgleich: nur Kandidaten, die dem Projekt noch NICHT
 * zugeordnet sind. Entfernt bewusst nie etwas — siehe Tech Design D1.
 */
export function resolveNewCandidates(
  input: ResolveSkillsInput,
  assignedSkillIds: readonly string[]
): ResolvedSkillCandidate[] {
  const assigned = new Set(assignedSkillIds)
  return resolveSkillsForProject(input).filter((c) => !assigned.has(c.skill.id))
}
