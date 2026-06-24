import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { NDA_ASSIGNMENT_SELECT, assignNdaSchema } from "../../_schema"

// PROJ-128 — NDA <-> person/organisation assignments.
//
// GET  .../ndas/[ndaId]/assignments  — list (project members; RLS-scoped).
// POST .../ndas/[ndaId]/assignments  — assign (manager). A row with a user_id
//      confers platform access (via the NDA gate); a contact-only row is purely
//      documentary (signatory list).

export async function GET(
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

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("ma_nda_assignments")
    .select(NDA_ASSIGNMENT_SELECT)
    .eq("project_id", projectId)
    .eq("nda_id", ndaId)
    .order("created_at", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ assignments: data ?? [] })
}

export async function POST(
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

  // The NDA must exist in this project (RLS-scoped lookup → clean 404).
  const { data: nda, error: ndaError } = await supabase
    .from("ma_ndas")
    .select("id")
    .eq("id", ndaId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (ndaError) return apiError("lookup_failed", ndaError.message, 500)
  if (!nda) return apiError("not_found", "NDA not found.", 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = assignNdaSchema.safeParse(body)
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
    .from("ma_nda_assignments")
    .insert({
      tenant_id: access.project.tenant_id,
      nda_id: ndaId,
      project_id: projectId,
      user_id: parsed.data.user_id ?? null,
      contact_name: parsed.data.contact_name ?? null,
      contact_org: parsed.data.contact_org ?? null,
      created_by: userId,
    })
    .select(NDA_ASSIGNMENT_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "This user is already assigned to this NDA.",
        409,
        "user_id"
      )
    }
    if (error.code === "23503") {
      return apiError("validation_error", "Unknown user.", 400, "user_id")
    }
    return apiError("assign_failed", error.message, 500)
  }

  return NextResponse.json({ assignment: data }, { status: 201 })
}
