import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { mapCommEntryRpcError } from "../route"

// PROJ-118 — submit a communication entry for approval
// (submit_communication_entry RPC): draft/rejected → pending_approval.
// Responsible person or manager only; an approver must be assigned.
export async function POST(
  _request: Request,
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

  const { data, error } = await supabase.rpc("submit_communication_entry", {
    p_entry_id: entryId,
  })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ entry: data })
}
