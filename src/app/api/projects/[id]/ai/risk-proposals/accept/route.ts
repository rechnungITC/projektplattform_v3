/**
 * PROJ-89 — accept a batch of proposal_risks_from_context suggestions.
 *
 *   POST /api/projects/[id]/ai/risk-proposals/accept
 *     Body: { suggestionIds: uuid[] }
 *
 * Atomic transaction via the `accept_risk_proposals_bulk` RPC: creates
 * risks (status 'open') in the PROJ-20 register, records provenance on
 * existing risks for duplicates (`risk_link`) instead of creating, writes
 * `ki_provenance`, flips suggestions to accepted. Returns the id arrays +
 * `accepted_at` the FE needs for the 30-s Undo.
 *
 * Auth: editor+ on the project; the RPC re-checks via
 * `is_project_lead` / `has_project_role(...,'editor')` /
 * `is_tenant_admin` (defense-in-depth against route-helper drift).
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

  const { data, error } = await supabase.rpc("accept_risk_proposals_bulk", {
    p_project_id: projectId,
    p_suggestion_ids: parsed.data.suggestionIds,
  })

  if (error) {
    if (error.code === "P0002") {
      return apiError("not_found", error.message, 404)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to accept on this project.", 403)
    }
    if (error.code === "22023" || error.code === "23514") {
      return apiError(
        "validation_error",
        error.message ?? "Bulk-accept validation failed.",
        400,
      )
    }
    return apiError("rpc_failed", error.message, 500)
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    return apiError("rpc_failed", "Bulk-accept returned no row.", 500)
  }

  return NextResponse.json(
    {
      accepted_suggestion_ids: row.accepted_suggestion_ids ?? [],
      created_risk_ids: row.created_risk_ids ?? [],
      linked_risk_ids: row.linked_risk_ids ?? [],
      accepted_at: row.accepted_at ?? new Date().toISOString(),
    },
    { status: 200 },
  )
}
