import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { ADVISOR_SELECT, updateAdvisorSchema } from "../_schema"

// PROJ-99 — update / delete a single advisor profile (manager-gated).
// PATCH covers mandate-status transitions (planned/active/expired/blocked);
// the change is captured by the UPDATE audit trigger on ma_advisor_profiles.

async function resolve(
  context: { params: Promise<{ id: string; advisorId: string }> }
) {
  const { id: projectId, advisorId } = await context.params
  return { projectId, advisorId }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; advisorId: string }> }
) {
  const { projectId, advisorId } = await resolve(context)
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(advisorId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateAdvisorSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase
    .from("ma_advisor_profiles")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", advisorId)
    .eq("project_id", projectId)
    .select(ADVISOR_SELECT)
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) return apiError("not_found", "Advisor profile not found.", 404)
  return NextResponse.json({ advisor: data })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; advisorId: string }> }
) {
  const { projectId, advisorId } = await resolve(context)
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(advisorId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("ma_advisor_profiles")
    .delete()
    .eq("id", advisorId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle()

  if (error) return apiError("delete_failed", error.message, 500)
  if (!data) return apiError("not_found", "Advisor profile not found.", 404)
  return NextResponse.json({ deleted: true, id: data.id })
}
