import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createFindingSchema, FINDING_SELECT } from "./_schema"

// PROJ-114 — DD-Findings per project.
//
// GET  /api/projects/[id]/dd-findings[?streamId=]  — list (project members; RLS
//      + need-to-know gate scope rows).
// POST /api/projects/[id]/dd-findings              — create via create_dd_finding
//      RPC (manager + need-to-know enforced server-side; deal_breaker escalates).

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

  const streamId = new URL(request.url).searchParams.get("streamId")
  const base = supabase
    .from("dd_findings")
    .select(FINDING_SELECT)
    .eq("project_id", projectId)
  const filtered =
    streamId && z.string().uuid().safeParse(streamId).success
      ? base.eq("dd_stream_id", streamId)
      : base

  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ findings: data ?? [] })
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
  const parsed = createFindingSchema.safeParse(body)
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

  const { data, error } = await supabase.rpc("create_dd_finding", {
    p_dd_stream_id: d.dd_stream_id,
    p_title: d.title,
    p_description: d.description ?? null,
    p_severity: d.severity ?? "mittel",
    p_economic_impact_eur: d.economic_impact_eur ?? null,
    p_probability: d.probability ?? null,
    p_recommended_treatment: d.recommended_treatment ?? null,
    p_linked_risk_id: d.linked_risk_id ?? null,
    p_confidentiality_level: d.confidentiality_level ?? null,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to create this finding.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "DD stream not found.", 404)
    }
    if (error.code?.startsWith("23") || error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ finding: data }, { status: 201 })
}
