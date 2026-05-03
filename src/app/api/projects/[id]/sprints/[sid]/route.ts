import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

import {
  normalizeSprintPayload,
  sprintPatchSchema as updateSchema,
} from "../_schema"

function validateIds(projectId: string, sprintId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(sprintId).success) {
    return apiError("validation_error", "Invalid sprint id.", 400, "sid")
  }
  return null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; sid: string }> }
) {
  const { id: projectId, sid: sprintId } = await context.params
  const idErr = validateIds(projectId, sprintId)
  if (idErr) return idErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("sprints")
    .select("*")
    .eq("id", sprintId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) return apiError("internal_error", error.message, 500)
  if (!data) return apiError("not_found", "Sprint not found.", 404)
  return NextResponse.json({ sprint: data })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; sid: string }> }
) {
  const { id: projectId, sid: sprintId } = await context.params
  const idErr = validateIds(projectId, sprintId)
  if (idErr) return idErr

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Spread-Pattern: schema is the single source of truth.
  const update = normalizeSprintPayload(parsed.data)

  const { data, error } = await supabase
    .from("sprints")
    .update(update)
    .eq("id", sprintId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Sprint not found.", 404)
  return NextResponse.json({ sprint: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; sid: string }> }
) {
  const { id: projectId, sid: sprintId } = await context.params
  const idErr = validateIds(projectId, sprintId)
  if (idErr) return idErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { error } = await supabase
    .from("sprints")
    .delete()
    .eq("id", sprintId)
    .eq("project_id", projectId)
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
