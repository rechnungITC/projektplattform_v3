/**
 * PROJ-33 Phase 33-γ + PROJ-35 Phase 35-β — GET combined profile bundle.
 *
 * GET /api/projects/[id]/stakeholders/[sid]/profile
 *   → { bundle: { skill, personality, events, latest_invite,
 *                 stakeholder_qualitative, escalation_patterns,
 *                 risk_score_overrides } }
 *
 * PROJ-35-β Erweiterung: liefert die Risiko-relevanten Felder aus
 * `stakeholders` (qualitative Bewertung + current_escalation_patterns
 * Snapshot) sowie die tenant-spezifischen Multiplikator-Overrides für
 * den Risk-Score-Compute im Frontend. Macht einen separaten Round-Trip
 * für die Konfiguration unnötig.
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

  // Fetch in parallel — RLS handles tenant scoping. Stakeholder + tenant
  // selects added in 35-β to feed the Risk-Banner/Pattern-Banner UI.
  const [
    skillRes,
    personalityRes,
    eventsRes,
    inviteRes,
    stakeholderRes,
  ] = await Promise.all([
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
    supabase
      .from("stakeholder_self_assessment_invites")
      .select("id, status, magic_link_expires_at, submitted_at, created_at")
      .eq("stakeholder_id", sid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stakeholders")
      .select(
        "id, tenant_id, attitude, conflict_potential, decision_authority, influence, impact, communication_need, preferred_channel, current_escalation_patterns",
      )
      .eq("id", sid)
      .maybeSingle(),
  ])

  if (skillRes.error)
    return apiError("internal_error", skillRes.error.message, 500)
  if (personalityRes.error)
    return apiError("internal_error", personalityRes.error.message, 500)
  if (eventsRes.error)
    return apiError("internal_error", eventsRes.error.message, 500)
  if (inviteRes.error)
    return apiError("internal_error", inviteRes.error.message, 500)
  if (stakeholderRes.error)
    return apiError("internal_error", stakeholderRes.error.message, 500)

  type StakeholderRow = {
    id: string
    tenant_id: string
    attitude: string | null
    conflict_potential: string | null
    decision_authority: string | null
    influence: string | null
    impact: string | null
    communication_need: string | null
    preferred_channel: string | null
    current_escalation_patterns: string[] | null
  }
  const stakeholder = stakeholderRes.data as unknown as StakeholderRow | null

  // Resolve tenant overrides only when we have a tenant_id (always true if
  // stakeholder exists). Defaults are applied client-side via mergeFormPreview.
  let riskScoreOverrides: unknown = {}
  if (stakeholder?.tenant_id) {
    const { data: settingsData } = await supabase
      .from("tenant_settings")
      .select("risk_score_overrides")
      .eq("tenant_id", stakeholder.tenant_id)
      .maybeSingle()
    if (settingsData) {
      const row = settingsData as unknown as {
        risk_score_overrides: unknown
      }
      riskScoreOverrides = row.risk_score_overrides ?? {}
    }
  }

  return NextResponse.json({
    bundle: {
      skill: skillRes.data ?? null,
      personality: personalityRes.data ?? null,
      events: eventsRes.data ?? [],
      latest_invite: inviteRes.data ?? null,
      stakeholder_qualitative: stakeholder
        ? {
            attitude: stakeholder.attitude,
            conflict_potential: stakeholder.conflict_potential,
            decision_authority: stakeholder.decision_authority,
            influence: stakeholder.influence,
            impact: stakeholder.impact,
            communication_need: stakeholder.communication_need,
            preferred_channel: stakeholder.preferred_channel,
          }
        : null,
      escalation_patterns: stakeholder?.current_escalation_patterns ?? [],
      risk_score_overrides: riskScoreOverrides,
    },
  })
}
