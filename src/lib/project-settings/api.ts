/**
 * PROJ-65 ε.3e (F-64) — fetch wrappers around /api/projects/[id]/settings.
 */

export interface ProjectPlanMutateSettings {
  snap_to_week: boolean
  enabled: boolean
}

export interface ProjectSettingsResponse {
  plan_mutate: ProjectPlanMutateSettings
  tenant_plan_mutate_enabled: boolean
  permissions: {
    can_toggle_snap: boolean
    can_toggle_enabled: boolean
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/settings`

export async function getProjectSettings(
  projectId: string,
): Promise<ProjectSettingsResponse> {
  const response = await fetch(base(projectId), {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as ProjectSettingsResponse
}

export async function updateProjectSettings(
  projectId: string,
  patch: { snap_to_week?: boolean; enabled?: boolean },
): Promise<void> {
  const response = await fetch(base(projectId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error(await safeError(response))
}
