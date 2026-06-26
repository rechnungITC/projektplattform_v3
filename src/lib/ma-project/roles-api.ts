/**
 * PROJ-97a — fetch wrapper for the M&A responsibility view
 * (GET /api/projects/[id]/roles).
 */

export interface RoleAssignmentStakeholder {
  id: string
  name: string
  origin: "internal" | "external"
}

export interface RoleAssignment {
  role_key: string
  label_de: string
  stakeholders: RoleAssignmentStakeholder[]
}

export interface ProjectRolesResponse {
  roles: { key: string; label_de: string }[]
  assignments: RoleAssignment[]
}

export async function fetchProjectRoles(
  projectId: string
): Promise<ProjectRolesResponse> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/roles`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      message = body.error?.message ?? message
    } catch {
      /* keep default */
    }
    throw new Error(message)
  }
  return (await res.json()) as ProjectRolesResponse
}
