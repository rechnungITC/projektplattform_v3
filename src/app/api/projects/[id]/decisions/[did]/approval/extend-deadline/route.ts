/**
 * PROJ-31 follow-up — POST /extend-deadline
 *
 * Allows a nominated internal approver OR a project lead to push the
 * approval deadline forward. Constraints:
 *   - status must be 'pending'
 *   - new deadline must be >= existing deadline + 1 day (forward only)
 *   - new deadline must be <= existing deadline + 90 days (sanity cap)
 *
 * Writes a `deadline_extended` audit event with both old + new values.
 * No outbox notification in this slice — could be added if PMs want one.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

const MAX_EXTENSION_DAYS = 90

const bodySchema = z.object({
  new_deadline_at: z.string().datetime({ offset: true }),
})

interface Ctx {
  params: Promise<{ id: string; did: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, did: decisionId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Any project member can extend (the UI shows the button only to
  // approvers + PM). RLS still scopes everything to tenant members.
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
    )
  }

  const { data: state, error: stateErr } = await supabase
    .from("decision_approval_state")
    .select("decision_id, status, deadline_at")
    .eq("decision_id", decisionId)
    .maybeSingle()
  if (stateErr) return apiError("internal_error", stateErr.message, 500)
  if (!state) return apiError("not_found", "Approval state not found.", 404)
  if (state.status !== "pending") {
    return apiError(
      "conflict",
      "Frist kann nur für offene Genehmigungen verlängert werden.",
      409,
    )
  }

  const newDeadline = new Date(parsed.data.new_deadline_at)
  const oldDeadline = state.deadline_at ? new Date(state.deadline_at) : null
  const minNew = oldDeadline
    ? new Date(oldDeadline.getTime() + 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000)
  if (newDeadline.getTime() < minNew.getTime()) {
    return apiError(
      "validation_error",
      "Neue Frist muss mindestens 1 Tag nach der bisherigen liegen.",
      400,
      "new_deadline_at",
    )
  }
  const maxNew = oldDeadline
    ? new Date(oldDeadline.getTime() + MAX_EXTENSION_DAYS * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + MAX_EXTENSION_DAYS * 24 * 60 * 60 * 1000)
  if (newDeadline.getTime() > maxNew.getTime()) {
    return apiError(
      "validation_error",
      `Frist darf maximal um ${MAX_EXTENSION_DAYS} Tage verlängert werden.`,
      400,
      "new_deadline_at",
    )
  }

  const { error: updErr } = await supabase
    .from("decision_approval_state")
    .update({
      deadline_at: newDeadline.toISOString(),
      // Reset reminder gate so the next cron run can re-notify if applicable.
      last_reminder_at: null,
    })
    .eq("decision_id", decisionId)
  if (updErr) return apiError("internal_error", updErr.message, 500)

  await supabase.from("decision_approval_events").insert({
    decision_id: decisionId,
    event_type: "deadline_extended",
    actor_user_id: userId,
    payload: {
      old_deadline_at: oldDeadline?.toISOString() ?? null,
      new_deadline_at: newDeadline.toISOString(),
    },
  })

  return NextResponse.json({ ok: true, deadline_at: newDeadline.toISOString() })
}
