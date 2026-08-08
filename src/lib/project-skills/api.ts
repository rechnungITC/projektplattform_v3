import type {
  ProjectSkillWithSkill,
  ResolvedSkillCandidate,
  SkillAssignmentSource,
} from "@/types/project-skill"

// PROJ-78 — Client-Wrapper für die Projekt-Skill-Routen.

export class ProjectSkillsApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ProjectSkillsApiError"
    this.status = status
  }
}

async function parseError(res: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    message = body.message ?? body.error ?? fallback
  } catch {
    // Body war kein JSON — Fallback-Text behalten.
  }
  throw new ProjectSkillsApiError(message, res.status)
}

export async function listProjectSkills(
  projectId: string
): Promise<ProjectSkillWithSkill[]> {
  const res = await fetch(`/api/projects/${projectId}/skills`)
  if (!res.ok) await parseError(res, "Skills konnten nicht geladen werden.")
  const body = (await res.json()) as { project_skills: ProjectSkillWithSkill[] }
  return body.project_skills ?? []
}

export interface SkillAssignmentInput {
  skill_id: string
  assignment_source: SkillAssignmentSource
}

export async function assignProjectSkills(
  projectId: string,
  assignments: SkillAssignmentInput[]
): Promise<{ assigned: number; skipped: number }> {
  const res = await fetch(`/api/projects/${projectId}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignments }),
  })
  if (!res.ok) await parseError(res, "Skills konnten nicht zugeordnet werden.")
  return (await res.json()) as { assigned: number; skipped: number }
}

export async function removeProjectSkill(
  projectId: string,
  skillId: string
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/skills/${skillId}`, {
    method: "DELETE",
  })
  if (!res.ok) await parseError(res, "Skill konnte nicht entfernt werden.")
}

/** Additive Vorschläge für den „Skills abgleichen"-Dialog. */
export async function resolveProjectSkillCandidates(
  projectId: string
): Promise<ResolvedSkillCandidate[]> {
  const res = await fetch(`/api/projects/${projectId}/skills/resolve`)
  if (!res.ok) await parseError(res, "Abgleich fehlgeschlagen.")
  const body = (await res.json()) as { candidates: ResolvedSkillCandidate[] }
  return body.candidates ?? []
}
