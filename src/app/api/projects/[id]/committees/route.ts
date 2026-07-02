import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { COMMITTEE_SELECT, createCommitteeSchema } from "./_schema"

// PROJ-98 — Committees per project (governance bodies).
//
// GET  /api/projects/[id]/committees — list committees + members (project
//      members; RLS + need-to-know gate scope rows).
// POST /api/projects/[id]/committees — create via create_committee RPC
//      (manager + need-to-know enforced server-side).

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
    .from("committees")
    .select(COMMITTEE_SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500)
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ committees: data ?? [] })
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

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createCommitteeSchema.safeParse(body)
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

  const { data, error } = await supabase.rpc("create_committee", {
    p_project_id: projectId,
    p_name: d.name,
    p_purpose: d.purpose ?? null,
    p_cadence: d.cadence ?? null,
    p_decision_scope: d.decision_scope ?? null,
    p_value_threshold_eur: d.value_threshold_eur ?? null,
    p_value_threshold_currency: d.value_threshold_currency ?? null,
    p_escalation_scope: d.escalation_scope ?? null,
    p_confidentiality_level: d.confidentiality_level ?? "standard",
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to create this committee.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Project not found.", 404)
    }
    if (error.code?.startsWith("23") || error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ committee: data }, { status: 201 })
}
