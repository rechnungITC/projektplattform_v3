import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { ADVISOR_SELECT, createAdvisorSchema } from "./_schema"

// PROJ-99 — external advisor profiles for a project.
//
// GET  /api/projects/[id]/advisors  — list (project members; RLS-scoped).
// POST /api/projects/[id]/advisors  — create (tenant-admin or project lead).
//
// The advisor profile marks a user as external (org + type + mandate). The
// PROJ-99/128 gate then requires an active mandate + valid NDA before any
// clearance grants access above 'standard'.

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
    .from("ma_advisor_profiles")
    .select(ADVISOR_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ advisors: data ?? [] })
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
  const parsed = createAdvisorSchema.safeParse(body)
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
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      user_id: parsed.data.user_id,
      organization: parsed.data.organization,
      advisor_type: parsed.data.advisor_type,
      mandate_start: parsed.data.mandate_start ?? null,
      mandate_end: parsed.data.mandate_end ?? null,
      mandate_status: parsed.data.mandate_status ?? "planned",
      responsible_user_id: parsed.data.responsible_user_id ?? null,
      scope: parsed.data.scope ?? null,
      notes: parsed.data.notes ?? null,
      created_by: userId,
    })
    .select(ADVISOR_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "This user already has an advisor profile in this project.",
        409,
        "user_id"
      )
    }
    if (error.code === "23503") {
      return apiError("validation_error", "Unknown user.", 400, "user_id")
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ advisor: data }, { status: 201 })
}
