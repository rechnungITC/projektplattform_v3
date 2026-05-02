/**
 * PROJ-33 Phase 33-γ — PUT personality (Big5/OCEAN) profile.
 *
 * PUT /api/projects/[id]/stakeholders/[sid]/profile/personality
 *   Body: { openness_fremd, conscientiousness_fremd, extraversion_fremd,
 *           agreeableness_fremd, emotional_stability_fremd } (0-100 or null)
 *
 * Mirrors skill route. UPSERT + audit-event with actor_kind='user'.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../../_lib/route-helpers"

const intDim = z.number().int().min(0).max(100).nullable().optional()

const personalitySchema = z.object({
  openness_fremd: intDim,
  conscientiousness_fremd: intDim,
  extraversion_fremd: intDim,
  agreeableness_fremd: intDim,
  emotional_stability_fremd: intDim,
})

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = personalitySchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", parsed.error.issues[0]?.message ?? "Invalid", 400)
  }

  const { data: stakeholder, error: stkErr } = await supabase
    .from("stakeholders")
    .select("tenant_id, project_id")
    .eq("id", sid)
    .maybeSingle()
  if (stkErr) return apiError("internal_error", stkErr.message, 500)
  if (!stakeholder || stakeholder.project_id !== projectId) {
    return apiError("not_found", "Stakeholder not found.", 404)
  }

  const { data: oldRow } = await supabase
    .from("stakeholder_personality_profiles")
    .select("*")
    .eq("stakeholder_id", sid)
    .maybeSingle()

  const now = new Date().toISOString()
  const { error: upErr } = await supabase
    .from("stakeholder_personality_profiles")
    .upsert(
      {
        stakeholder_id: sid,
        tenant_id: stakeholder.tenant_id,
        ...parsed.data,
        fremd_assessed_by: userId,
        fremd_assessed_at: now,
      },
      { onConflict: "stakeholder_id" },
    )
  if (upErr) return apiError("update_failed", upErr.message, 500)

  const { error: evtErr } = await supabase
    .from("stakeholder_profile_audit_events")
    .insert({
      tenant_id: stakeholder.tenant_id,
      stakeholder_id: sid,
      profile_kind: "personality",
      event_type: "fremd_updated",
      actor_kind: "user",
      actor_user_id: userId,
      payload: { before: oldRow ?? null, after: parsed.data },
    })
  if (evtErr) {
    console.error("[PROJ-33-γ] audit insert failed:", evtErr.message)
  }

  return NextResponse.json({ ok: true })
}
