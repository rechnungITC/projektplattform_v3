import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../../../_lib/route-helpers"

// PROJ-12 — POST /api/ki/suggestions/[id]/accept
//
// Atomically creates the target entity (currently only `risks`) and the
// ki_provenance row that ties it back to this suggestion. Audited via
// the SECURITY DEFINER RPC `accept_ki_suggestion_risk` with reason
// `ki_acceptance`.
//
// Authorization is enforced inside the RPC — the suggestion knows its
// project, the RPC checks editor/lead/admin against that project. We
// don't hit requireProjectAccess here because we don't know the project
// id until we read the suggestion (RLS would still scope reads).

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid suggestion id.", 400, "id")
  }

  const { userId } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  // PROJ-Security — admin-client + explicit actor.
  const adminForRpc = createAdminClient()
  const { data: result, error: rpcErr } = await adminForRpc
    .rpc("accept_ki_suggestion_risk", {
      p_suggestion_id: id,
      p_actor_user_id: userId,
    })
    .single<{ success: boolean; message: string; risk_id: string | null }>()

  if (rpcErr) {
    return apiError("accept_failed", rpcErr.message, 500)
  }
  if (!result?.success) {
    if (result?.message === "suggestion_not_found") {
      return apiError("not_found", "Suggestion not found.", 404)
    }
    if (result?.message === "suggestion_not_draft") {
      return apiError(
        "conflict",
        "Suggestion is no longer pending (already accepted or rejected).",
        409
      )
    }
    if (result?.message === "wrong_purpose") {
      return apiError(
        "validation_error",
        "This endpoint only accepts risk suggestions.",
        422
      )
    }
    if (result?.message === "forbidden") {
      return apiError(
        "forbidden",
        "Editor or lead role required to accept suggestions.",
        403
      )
    }
    if (result?.message?.startsWith("invalid_payload_")) {
      return apiError(
        "validation_error",
        `Suggestion payload is invalid: ${result.message}.`,
        422
      )
    }
    return apiError("accept_failed", result?.message ?? "unknown", 500)
  }

  return NextResponse.json({ ok: true, risk_id: result.risk_id })
}
