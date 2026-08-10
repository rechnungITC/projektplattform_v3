import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { mapCommEntryRpcError } from "../route"

// PROJ-118 — mark an approved communication entry as sent
// (mark_communication_sent RPC): approved → sent (documentary; manager).
// Sets actual_date if not already set.
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

  const { data, error } = await supabase.rpc("mark_communication_sent", {
    p_entry_id: entryId,
  })

  // PROJ-119 AC4 — the embargo block carries its own SQLSTATE so it can be
  // told apart from every other check violation without string matching. The
  // RPC cannot log it itself (its own RAISE would roll the row back), so the
  // attempt is recorded here, in a separate transaction.
  if (error?.code === "EM001") {
    await supabase.rpc("log_communication_access", {
      p_entry_id: entryId,
      p_action: "embargo_blocked",
      p_outcome: "denied",
    })
    return apiError("embargo_active", error.message, 422)
  }

  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ entry: data })
}
