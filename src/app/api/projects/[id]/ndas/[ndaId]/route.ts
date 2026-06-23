import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { NDA_SELECT, updateNdaSchema } from "../_schema"

// PROJ-128 — update / delete a single NDA (manager-gated). Status transitions
// (draft→valid→expired/revoked) and expiry-date edits are captured by the
// UPDATE audit trigger on ma_ndas — the security-relevant events.

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; ndaId: string }> }
) {
  const { id: projectId, ndaId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(ndaId).success
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
  const parsed = updateNdaSchema.safeParse(body)
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
    .from("ma_ndas")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", ndaId)
    .eq("project_id", projectId)
    .select(NDA_SELECT)
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) return apiError("not_found", "NDA not found.", 404)
  return NextResponse.json({ nda: data })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; ndaId: string }> }
) {
  const { id: projectId, ndaId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(ndaId).success
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
    .from("ma_ndas")
    .delete()
    .eq("id", ndaId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle()

  if (error) return apiError("delete_failed", error.message, 500)
  if (!data) return apiError("not_found", "NDA not found.", 404)
  return NextResponse.json({ deleted: true, id: data.id })
}
