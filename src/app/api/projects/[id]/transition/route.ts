import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"
import { LIFECYCLE_STATUSES } from "@/types/project"

import { apiError, getAuthenticatedUserId } from "../../../_lib/route-helpers"

// -----------------------------------------------------------------------------
// Schema
// -----------------------------------------------------------------------------

const transitionSchema = z.object({
  to_status: z.enum(LIFECYCLE_STATUSES as unknown as [string, ...string[]]),
  comment: z.string().max(2000).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

// -----------------------------------------------------------------------------
// POST /api/projects/[id]/transition
// -----------------------------------------------------------------------------
//
// Calls the SECURITY DEFINER function `transition_project_status` which:
//   * Verifies caller is admin or member of the project's tenant
//   * Validates the transition against the allowed-edge state machine
//   * Atomically updates lifecycle_status + writes a project_lifecycle_events row
//
// Error code mapping:
//   23514 (check_violation)        -> 422   invalid transition
//   42501 (insufficient_privilege) -> 403   not admin/member
//   02000 (no_data)                -> 404   project not found
//   22023 (invalid_parameter)      -> 422   soft-deleted project, etc.

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params

  const idCheck = z.string().uuid().safeParse(projectId)
  if (!idCheck.success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = transitionSchema.safeParse(body)
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

  // PROJ-Security — switch to admin-client; RPC enforces authz against
  // p_actor_user_id (no longer relies on auth.uid()). EXECUTE will be
  // revoked from `authenticated` once all callers are migrated.
  const adminClient = createAdminClient()
  const { data, error } = await adminClient.rpc("transition_project_status", {
    p_project_id: projectId,
    p_to_status: parsed.data.to_status,
    p_comment: parsed.data.comment ?? null,
    p_actor_user_id: userId,
  })

  if (error) {
    switch (error.code) {
      case "23514":
        return apiError("invalid_transition", error.message, 422)
      case "42501":
        return apiError("forbidden", error.message || "Insufficient role.", 403)
      case "02000":
        return apiError("not_found", "Project not found.", 404)
      case "22023":
        return apiError("invalid_parameter", error.message, 422)
      default:
        return apiError("transition_failed", error.message, 500)
    }
  }

  return NextResponse.json(data, { status: 200 })
}
