/**
 * PROJ-70-β — undo a recent bulk-accept of proposal_from_context suggestions.
 *
 *   POST /api/projects/[id]/ai/proposal-from-context/undo
 *     Body: { suggestionIds: uuid[] }
 *
 * Reverses the latest bulk-accept within a 30-second window. The RPC
 * enforces:
 *   - same actor that accepted (anti-griefing)
 *   - `accepted_at > now() - 30 s` on EVERY row in the batch
 *   - controlled bypass of the `enforce_ki_suggestion_immutability`
 *     trigger via session GUC
 *
 * Auth: editor+ on the project, plus actor-identity check inside the
 * RPC. Returns the reverted suggestion + work_item ids.
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
  suggestionIds: z.array(z.string().uuid()).min(1).max(50),
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
    "accept_proposal_from_context_undo",
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
      // Window expired or non-eligible suggestions in the batch.
      return apiError("undo_window_expired", error.message, 409)
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
      reverted_work_item_ids: row.reverted_work_item_ids ?? [],
    },
    { status: 200 },
  )
}
