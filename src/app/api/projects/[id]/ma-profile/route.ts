import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { patchMaProfileSchema } from "./_schema"

// PROJ-94 — M&A strategic-foundation profile (1:1 with the project).
//
// GET   /api/projects/[id]/ma-profile  — read the profile (project members;
//       RLS + need-to-know gate already restrict the row).
// PATCH /api/projects/[id]/ma-profile  — update strategic fields (editor/lead;
//       RLS UPDATE policy + need-to-know gate enforce at the DB layer too).
//       mandate_status is excluded — it transitions via .../mandate.

const PROFILE_COLUMNS =
  "id, tenant_id, project_id, deal_side, sponsor_user_id, mandate_status, " +
  "deal_rationale, search_profile, exclusion_criteria, " +
  "investment_frame_amount, investment_frame_currency, investment_frame_note, " +
  "strategic_document_link, confidentiality_level, created_by, created_at, updated_at"

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
    .from("ma_project_profiles")
    .select(PROFILE_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle()

  if (error) return apiError("read_failed", error.message, 500)
  if (!data) return apiError("not_found", "M&A profile not found.", 404)
  return NextResponse.json({ profile: data })
}

export async function PATCH(
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

  const parsed = patchMaProfileSchema.safeParse(body)
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

  // Clean 403 before the write (RLS enforces it at the DB layer too).
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("ma_project_profiles")
    .update(parsed.data)
    .eq("project_id", projectId)
    .select(PROFILE_COLUMNS)
    .maybeSingle()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Not allowed to edit this M&A profile (need-to-know or role).",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  // RLS hid the row (need-to-know) or it doesn't exist → no row updated.
  if (!data) return apiError("not_found", "M&A profile not found.", 404)
  return NextResponse.json({ profile: data })
}
