import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"

import {
  normalizeReleasePayload,
  releaseCreateSchema as createSchema,
} from "./_schema"
import {
  requireReleaseProject,
  validateTargetMilestone,
  validateUuid,
} from "./_helpers"

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/releases -- list project releases
// -----------------------------------------------------------------------------
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  const idError = validateUuid(projectId, "id", "project id")
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

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const includeArchived = url.searchParams.get("include_archived") === "true"

  let query = supabase
    .from("releases")
    .select("*")
    .eq("project_id", projectId)
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100)

  if (status) {
    if (!["planned", "active", "released", "archived"].includes(status)) {
      return apiError("validation_error", "Invalid status.", 400, "status")
    }
    query = query.eq("status", status)
  } else if (!includeArchived) {
    query = query.neq("status", "archived")
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ releases: data ?? [] })
}

// -----------------------------------------------------------------------------
// POST /api/projects/[id]/releases -- create project release
// -----------------------------------------------------------------------------
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  const idError = validateUuid(projectId, "id", "project id")
  if (idError) return idError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(
      "validation_error",
      issue?.message ?? "Invalid body.",
      400,
      issue?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const projectResult = await requireReleaseProject(
    supabase,
    projectId,
    userId,
    "edit"
  )
  if (projectResult.error) return projectResult.error

  const milestoneError = await validateTargetMilestone(
    supabase,
    projectId,
    parsed.data.target_milestone_id
  )
  if (milestoneError) return milestoneError

  const insertPayload = {
    ...normalizeReleasePayload(parsed.data),
    tenant_id: projectResult.project.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data, error } = await supabase
    .from("releases")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    if (error.code === "23503") {
      return apiError("invalid_reference", error.message, 422)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed.", 403)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ release: data }, { status: 201 })
}
