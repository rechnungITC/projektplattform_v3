/**
 * PROJ-33 Phase 33-γ — GET combined profile bundle.
 *
 * GET /api/projects/[id]/stakeholders/[sid]/profile
 *   → { bundle: { skill, personality, events } }
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // Fetch all 3 in parallel — RLS handles tenant scoping.
  const [skillRes, personalityRes, eventsRes] = await Promise.all([
    supabase
      .from("stakeholder_skill_profiles")
      .select("*")
      .eq("stakeholder_id", sid)
      .maybeSingle(),
    supabase
      .from("stakeholder_personality_profiles")
      .select("*")
      .eq("stakeholder_id", sid)
      .maybeSingle(),
    supabase
      .from("stakeholder_profile_audit_events")
      .select(
        "id, tenant_id, stakeholder_id, profile_kind, event_type, actor_kind, actor_user_id, actor_stakeholder_id, payload, created_at",
      )
      .eq("stakeholder_id", sid)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  if (skillRes.error)
    return apiError("internal_error", skillRes.error.message, 500)
  if (personalityRes.error)
    return apiError("internal_error", personalityRes.error.message, 500)
  if (eventsRes.error)
    return apiError("internal_error", eventsRes.error.message, 500)

  return NextResponse.json({
    bundle: {
      skill: skillRes.data ?? null,
      personality: personalityRes.data ?? null,
      events: eventsRes.data ?? [],
    },
  })
}
