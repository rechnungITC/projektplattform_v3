import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { updateFindingSchema } from "../_schema"

// PROJ-114 — update a DD-Finding via update_dd_finding RPC (manager +
// need-to-know; a transition INTO deal_breaker escalates to Deal Lead + Sponsor).
// PATCH /api/projects/[id]/dd-findings/[findingId]

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; findingId: string }> }
) {
  const { id: projectId, findingId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(findingId).success) {
    return apiError("validation_error", "Invalid finding id.", 400, "findingId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateFindingSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("update_dd_finding", {
    p_finding_id: findingId,
    p_title: d.title ?? null,
    p_description: d.description ?? null,
    p_severity: d.severity ?? null,
    p_economic_impact_eur: d.economic_impact_eur ?? null,
    p_clear_eur: d.clear_eur ?? false,
    p_probability: d.probability ?? null,
    p_recommended_treatment: d.recommended_treatment ?? null,
    p_status: d.status ?? null,
    p_linked_risk_id: d.linked_risk_id ?? null,
    p_responsible_user_id: d.responsible_user_id ?? null,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to update this finding.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Finding not found.", 404)
    }
    if (error.code?.startsWith("23") || error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("update_failed", error.message, 500)
  }

  return NextResponse.json({ finding: data })
}
