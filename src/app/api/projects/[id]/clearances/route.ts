import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { grantClearanceSchema } from "./_schema"

// PROJ-100a — Need-to-Know clearances for a project.
//
// GET  /api/projects/[id]/clearances  — list clearances (managers only; the
//      table's RLS SELECT policy already restricts rows to tenant-admin /
//      project-lead, so a non-manager simply sees an empty list).
// POST /api/projects/[id]/clearances  — grant/raise a clearance. The
//      grant_confidentiality_clearance RPC enforces authority + tenant
//      membership + writes the audit row; requireProjectAccess gives a clean
//      403 before we reach the RPC.

export async function GET(
  _request: Request,
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
    .from("ma_confidentiality_clearances")
    .select("id, project_id, user_id, max_level, valid_until, granted_by, granted_at")
    .eq("project_id", projectId)
    .order("granted_at", { ascending: false })

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ clearances: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = grantClearanceSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Clean 403 before the RPC (which also enforces it at the DB layer).
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("grant_confidentiality_clearance", {
    p_project_id: projectId,
    p_user_id: parsed.data.user_id,
    p_max_level: parsed.data.max_level,
    p_valid_until: parsed.data.valid_until ?? null,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Only project leads or tenant admins can grant clearances, and the target must be a tenant member.",
        403
      )
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Project not found.", 404)
    }
    return apiError("grant_failed", error.message, 500)
  }

  return NextResponse.json({ clearance: data }, { status: 201 })
}
