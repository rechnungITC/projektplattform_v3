/**
 * PROJ-88 — undo a stakeholder-proposals bulk-accept (30-second window).
 *
 *   POST /api/projects/[id]/ai/stakeholder-proposals/undo
 *     Body: { suggestionIds: uuid[] }
 *
 * Via the `accept_stakeholder_proposals_undo` RPC: deletes ONLY the
 * stakeholders this accept created (+ their bridged resources), never
 * pre-existing `stakeholder_link` targets; cleans `ki_provenance`
 * (H-2 lesson) and resets suggestions to draft through the controlled
 * immutability bypass. Same-actor + 30-s window enforced in the RPC.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

const postBodySchema = z.object({
  suggestionIds: z.array(z.string().uuid()).min(1).max(30),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = postBodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "ai_proposals",
    { intent: "write" },
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase.rpc(
    "accept_stakeholder_proposals_undo",
    {
      p_project_id: projectId,
      p_suggestion_ids: parsed.data.suggestionIds,
    },
  )

  if (error) {
    if (error.code === "P0002") {
      return apiError("not_found", error.message, 404)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to undo on this project.", 403)
    }
    if (error.code === "22023") {
      return apiError(
        "validation_error",
        error.message ?? "Undo validation failed.",
        400,
      )
    }
    return apiError("rpc_failed", error.message, 500)
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return apiError("rpc_failed", "Undo returned no row.", 500)
  }

  return NextResponse.json(
    {
      reverted_suggestion_ids: row.reverted_suggestion_ids ?? [],
      reverted_stakeholder_ids: row.reverted_stakeholder_ids ?? [],
      reverted_resource_ids: row.reverted_resource_ids ?? [],
    },
    { status: 200 },
  )
}
