import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { respondApprovalSchema } from "../../_schema"
import { mapCommEntryRpcError } from "../route"

// PROJ-118 — respond to a pending communication approval
// (respond_communication_approval RPC): pending_approval → approved/rejected.
// SoD enforced server-side (caller = assigned approver, approver ≠ responsible).
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id: projectId, entryId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(entryId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
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
  const parsed = respondApprovalSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("respond_communication_approval", {
    p_entry_id: entryId,
    p_approved: parsed.data.approved,
    p_reason: parsed.data.reason ?? null,
  })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ entry: data })
}
