import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"
import {
  buildReleaseSummary,
  type ReleaseRow,
  type ReleaseSummaryMilestone,
  type ReleaseSummaryPhase,
  type ReleaseSummarySprint,
  type ReleaseSummaryWorkItem,
} from "@/lib/project-releases/release-summary"

import { requireReleaseProject, validateUuid } from "../../_helpers"

function validateIds(projectId: string, releaseId: string) {
  return (
    validateUuid(projectId, "id", "project id") ??
    validateUuid(releaseId, "rid", "release id")
  )
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/releases/[rid]/summary
// -----------------------------------------------------------------------------
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; rid: string }> }
) {
  const { id: projectId, rid: releaseId } = await context.params
  const idError = validateIds(projectId, releaseId)
  if (idError) return idError

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const projectResult = await requireReleaseProject(
    supabase,
    projectId,
    userId,
    "view"
  )
  if (projectResult.error) return projectResult.error

  const { data: release, error: releaseError } = await supabase
    .from("releases")
    .select(
      "id, tenant_id, project_id, name, description, start_date, end_date, status, target_milestone_id, created_by, created_at, updated_at"
    )
    .eq("id", releaseId)
    .eq("project_id", projectId)
    .maybeSingle()

  if (releaseError) {
    return apiError("internal_error", releaseError.message, 500)
  }
  if (!release) return apiError("not_found", "Release not found.", 404)

  const [workItemsRes, sprintsRes, phasesRes, milestonesRes] =
    await Promise.all([
      supabase
        .from("work_items")
        .select(
          "id, kind, parent_id, phase_id, milestone_id, sprint_id, release_id, title, status, priority, attributes, planned_start, planned_end"
        )
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .in("kind", ["story", "task", "bug"])
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(501),
      supabase
        .from("sprints")
        .select("id, name, state, start_date, end_date")
        .eq("project_id", projectId)
        .order("start_date", { ascending: true, nullsFirst: false })
        .limit(100),
      supabase
        .from("phases")
        .select("id, name, planned_start, planned_end, status")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .order("sequence_number", { ascending: true })
        .limit(200),
      supabase
        .from("milestones")
        .select("id, name, target_date, status, phase_id")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .order("target_date", { ascending: true, nullsFirst: false })
        .limit(200),
    ])

  if (workItemsRes.error) {
    return apiError("list_failed", workItemsRes.error.message, 500)
  }
  if (sprintsRes.error) {
    return apiError("list_failed", sprintsRes.error.message, 500)
  }
  if (phasesRes.error) {
    return apiError("list_failed", phasesRes.error.message, 500)
  }
  if (milestonesRes.error) {
    return apiError("list_failed", milestonesRes.error.message, 500)
  }

  const workItems = ((workItemsRes.data ?? []) as ReleaseSummaryWorkItem[]).slice(
    0,
    500
  )
  const summary = buildReleaseSummary({
    release: release as ReleaseRow,
    workItems,
    sprints: (sprintsRes.data ?? []) as ReleaseSummarySprint[],
    phases: (phasesRes.data ?? []) as ReleaseSummaryPhase[],
    milestones: (milestonesRes.data ?? []) as ReleaseSummaryMilestone[],
  })

  return NextResponse.json({
    summary,
    truncated: (workItemsRes.data?.length ?? 0) > 500,
  })
}
