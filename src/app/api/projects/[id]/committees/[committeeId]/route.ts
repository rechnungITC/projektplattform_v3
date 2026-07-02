import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { updateCommitteeSchema } from "../_schema"

// PROJ-98 — single committee.
//
// PATCH  /api/projects/[id]/committees/[committeeId] — update via update_committee RPC.
// DELETE /api/projects/[id]/committees/[committeeId] — delete via delete_committee RPC.
// Manager + need-to-know enforced server-side.

type Ctx = { params: Promise<{ id: string; committeeId: string }> }

async function guard(context: Ctx) {
  const { id: projectId, committeeId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(committeeId).success
  ) {
    return { error: apiError("validation_error", "Invalid id.", 400) }
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return { error: access.error }
  return { supabase, committeeId }
}

function mapRpcError(error: { code?: string; message: string }) {
  if (error.code === "42501") {
    return apiError("forbidden", "Not authorized for this committee.", 403)
  }
  if (error.code === "P0002") {
    return apiError("not_found", "Committee not found.", 404)
  }
  if (error.code?.startsWith("23") || error.code === "22023") {
    return apiError("validation_error", error.message, 400)
  }
  return apiError("mutation_failed", error.message, 500)
}

export async function PATCH(request: Request, context: Ctx) {
  const g = await guard(context)
  if ("error" in g) return g.error
  const { supabase, committeeId } = g

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateCommitteeSchema.safeParse(body)
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

  const { data, error } = await supabase.rpc("update_committee", {
    p_committee_id: committeeId,
    p_name: d.name,
    p_purpose: d.purpose ?? null,
    p_cadence: d.cadence ?? null,
    p_decision_scope: d.decision_scope ?? null,
    p_value_threshold_eur: d.value_threshold_eur ?? null,
    p_value_threshold_currency: d.value_threshold_currency ?? null,
    p_escalation_scope: d.escalation_scope ?? null,
    p_confidentiality_level: d.confidentiality_level ?? null,
  })
  if (error) return mapRpcError(error)
  return NextResponse.json({ committee: data })
}

export async function DELETE(_request: Request, context: Ctx) {
  const g = await guard(context)
  if ("error" in g) return g.error
  const { supabase, committeeId } = g

  const { error } = await supabase.rpc("delete_committee", {
    p_committee_id: committeeId,
  })
  if (error) return mapRpcError(error)
  return NextResponse.json({ ok: true })
}
