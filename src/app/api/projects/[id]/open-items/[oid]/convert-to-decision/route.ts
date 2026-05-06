import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-20 — POST /api/projects/[id]/open-items/[oid]/convert-to-decision
// Body: { decision_text, rationale?, decider_stakeholder_id?, context_phase_id?, context_risk_id? }
// Atomic conversion via the SECURITY DEFINER RPC `convert_open_item_to_decision`.

interface Ctx {
  params: Promise<{ id: string; oid: string }>
}

const bodySchema = z.object({
  decision_text: z.string().trim().min(1).max(10000),
  rationale: z.string().max(10000).optional().nullable(),
  decider_stakeholder_id: z.string().uuid().optional().nullable(),
  context_phase_id: z.string().uuid().optional().nullable(),
  context_risk_id: z.string().uuid().optional().nullable(),
})

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid open item id.", 400, "oid")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = bodySchema.safeParse(body)
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
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const data = parsed.data
  // PROJ-Security — admin-client + explicit actor.
  const adminForRpc = createAdminClient()
  const { data: result, error: rpcErr } = await adminForRpc
    .rpc("convert_open_item_to_decision", {
      p_open_item_id: oid,
      p_decision_text: data.decision_text.trim(),
      p_rationale: data.rationale?.trim() || null,
      p_decider_stakeholder: data.decider_stakeholder_id ?? null,
      p_context_phase_id: data.context_phase_id ?? null,
      p_context_risk_id: data.context_risk_id ?? null,
      p_actor_user_id: userId,
    })
    .single<{ success: boolean; message: string; decision_id: string | null }>()

  if (rpcErr) {
    return apiError("convert_failed", rpcErr.message, 500)
  }
  if (!result?.success) {
    if (result?.message === "open_item_not_found") {
      return apiError("not_found", "Open item not found.", 404)
    }
    if (result?.message === "already_converted") {
      return apiError("conflict", "Open item already converted.", 409)
    }
    if (result?.message === "forbidden") {
      return apiError(
        "forbidden",
        "Editor or lead role required to convert.",
        403
      )
    }
    return apiError("convert_failed", result?.message ?? "unknown", 422)
  }

  return NextResponse.json({
    ok: true,
    decision_id: result.decision_id,
  })
}
