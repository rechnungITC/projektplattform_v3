import type { ProjectContextDocumentView } from "@/types/project-context"

interface ProjectContextResponse {
  document: ProjectContextDocumentView
}

export class ProjectContextApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ProjectContextApiError"
    this.status = status
  }
}

export async function getProjectContext(
  projectId: string,
): Promise<ProjectContextDocumentView | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/project-context`,
    { method: "GET", cache: "no-store" },
  )
  if (response.status === 404) return null
  if (!response.ok) {
    let message = `Projektkontext konnte nicht geladen werden (HTTP ${response.status}).`
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      message = body.error?.message ?? message
    } catch {
      // Keep the stable fallback; an HTML/proxy error is not user-facing copy.
    }
    throw new ProjectContextApiError(message, response.status)
  }
  const body = (await response.json()) as ProjectContextResponse
  return body.document
}
