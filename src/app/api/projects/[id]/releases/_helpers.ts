import { z } from "zod"

import {
  apiError,
  requireProjectAccess,
  type ProjectAction,
} from "@/app/api/_lib/route-helpers"
import type { createClient } from "@/lib/supabase/server"
import type { ProjectMethod } from "@/types/project-method"

export const RELEASE_METHODS: readonly ProjectMethod[] = ["scrum", "safe"]

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface ReleaseProject {
  id: string
  tenant_id: string
  project_method: ProjectMethod | null
}

type ProjectResult =
  | { project: ReleaseProject; error?: never }
  | { project?: never; error: Response }

export function validateUuid(value: string, field: string, label: string) {
  if (z.string().uuid().safeParse(value).success) return null
  return apiError("validation_error", `Invalid ${label}.`, 400, field)
}

export function isReleaseMethodAllowed(
  method: ProjectMethod | null | undefined
): boolean {
  if (method == null) return true
  return RELEASE_METHODS.includes(method)
}

export function releaseMethodRejectionMessage(method: ProjectMethod): string {
  return `Releases sind in einem ${method.toUpperCase()}-Projekt nicht erlaubt. Nutze ein Scrum- oder SAFe-Projekt fuer Jira-like Release-Planung.`
}

export async function requireReleaseProject(
  supabase: SupabaseServerClient,
  projectId: string,
  userId: string,
  action: ProjectAction
): Promise<ProjectResult> {
  const access = await requireProjectAccess(supabase, projectId, userId, action)
  if (access.error) return { error: access.error }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, tenant_id, project_method")
    .eq("id", projectId)
    .eq("is_deleted", false)
    .maybeSingle()

  if (error) return { error: apiError("internal_error", error.message, 500) }
  if (!project) {
    return { error: apiError("not_found", "Project not found.", 404) }
  }

  const method =
    (project as { project_method?: ProjectMethod | null }).project_method ??
    null
  if (method !== null && !isReleaseMethodAllowed(method)) {
    return {
      error: apiError(
        "release_not_allowed_in_method",
        releaseMethodRejectionMessage(method),
        422,
        "project_method"
      ),
    }
  }

  return {
    project: {
      id: project.id,
      tenant_id: project.tenant_id,
      project_method: method,
    },
  }
}

export async function validateTargetMilestone(
  supabase: SupabaseServerClient,
  projectId: string,
  targetMilestoneId: string | null | undefined
): Promise<Response | null> {
  if (!targetMilestoneId) return null
  const { data, error } = await supabase
    .from("milestones")
    .select("id, project_id, is_deleted")
    .eq("id", targetMilestoneId)
    .maybeSingle()

  if (error) return apiError("internal_error", error.message, 500)
  if (!data || data.is_deleted) {
    return apiError(
      "invalid_target_milestone",
      "Target milestone not found.",
      422,
      "target_milestone_id"
    )
  }
  if (data.project_id !== projectId) {
    return apiError(
      "invalid_target_milestone",
      "Target milestone is not in this project.",
      422,
      "target_milestone_id"
    )
  }
  return null
}
