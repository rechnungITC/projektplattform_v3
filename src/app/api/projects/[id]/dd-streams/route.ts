import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createDdStreamSchema, DD_STREAM_SELECT } from "./_schema"

// PROJ-112 — Due-Diligence streams for a project.
//
// GET  /api/projects/[id]/dd-streams  — list (project members; RLS-scoped).
// POST /api/projects/[id]/dd-streams  — activate a stream (tenant-admin or
//      project lead). Stream label/key are copied from a template by the client
//      (copy-on-create); the API just persists the instance.
//
// The DD overview's "open findings" / "open Q&A" counts are forward-compatible:
// they return `null` (NOT 0) until PROJ-113/114 land, so the UI can render "—"
// ("not yet available") rather than a misleading "0 = clean stream".

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("dd_streams")
    .select(DD_STREAM_SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200)

  if (error) return apiError("list_failed", error.message, 500)

  // Forward-compatible counts (PROJ-113/114 not built yet): null => UI shows "—".
  const streams = (data ?? []).map((s) => ({
    ...s,
    open_findings: null as number | null,
    open_questions: null as number | null,
  }))
  return NextResponse.json({ streams })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
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
  const parsed = createDdStreamSchema.safeParse(body)
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
    .from("dd_streams")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      stream_key: parsed.data.stream_key,
      label: parsed.data.label,
      stream_lead_user_id: parsed.data.stream_lead_user_id ?? null,
      planned_start: parsed.data.planned_start ?? null,
      planned_end: parsed.data.planned_end ?? null,
      scope: parsed.data.scope ?? null,
      notes: parsed.data.notes ?? null,
      confidentiality_level: parsed.data.confidentiality_level ?? "standard",
      phase_id: parsed.data.phase_id ?? null,
      sort_order: parsed.data.sort_order ?? 0,
      created_by: userId,
    })
    .select(DD_STREAM_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "This stream is already active in this project.",
        409,
        "stream_key"
      )
    }
    if (error.code === "23503") {
      return apiError("validation_error", "Unknown phase or user.", 400)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ stream: data }, { status: 201 })
}
