/**
 * PROJ-34-ε.δ — Trigger AI coaching-recommendation generation.
 *
 *   POST /api/projects/[id]/stakeholders/[sid]/coaching-trigger
 *     → { run, recommendations: CoachingRecommendationRow[] }
 *
 * Aggregates the 5 locked sources (Q1 Profile / Q2 Last-N-Interactions /
 * Q3 PROJ-35 Risk-Score / Q4 PROJ-35 Tonality-Lookup / Q5 Response-Stats),
 * invokes the γ-Router with Purpose `coaching` (Class-3 hard-fixed), and
 * atomically:
 *   1. Soft-deletes existing `draft` rows for this stakeholder (re-trigger
 *      overwrite — locked 2026-05-13).
 *   2. Inserts N new draft rows (one per recommendation).
 *
 * On `external_blocked` no rows are written; the frontend renders the
 * persistent banner instead. AI-provenance + cited fields are persisted
 * verbatim from the router's output.
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import { invokeCoachingGeneration } from "@/lib/ai/router"
import type { CoachingAutoContext } from "@/lib/ai/types"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  type ApiErrorBody,
} from "../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

const UuidSchema = z.string().uuid()

const RECOMMENDATION_COLUMNS =
  "id, tenant_id, project_id, stakeholder_id, recommendation_kind, recommendation_text, modified_text, review_state, cited_interaction_ids, cited_profile_fields, provider, model_id, confidence, ki_run_id, prompt_context_meta, created_by, created_at, updated_at"

// Q2 window — locked 2026-05-13: last 10 interactions OR last 30 days,
// whichever is smaller (smaller in count terms).
const INTERACTION_WINDOW_LIMIT = 10
const INTERACTION_WINDOW_DAYS = 30

export async function POST(
  _request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId, sid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error
  const tenantId = (access.project as { tenant_id: string }).tenant_id

  // Q1 — load stakeholder with qualitative profile fields.
  const stakeholderRes = await supabase
    .from("stakeholders")
    .select(
      "id, name, reasoning, attitude, management_level, decision_authority, communication_need, preferred_channel, big5_openness, big5_conscientiousness, big5_extraversion, big5_agreeableness, big5_neuroticism, skill_negotiation, skill_communication, skill_technical, skill_leadership, skill_strategic",
    )
    .eq("id", sid)
    .maybeSingle()
  if (stakeholderRes.error) {
    return apiError("internal_error", stakeholderRes.error.message, 500)
  }
  if (!stakeholderRes.data) {
    return apiError("not_found", "Stakeholder not found.", 404)
  }
  const sh = stakeholderRes.data as Record<string, unknown>

  // Q2 — last N interactions for THIS stakeholder. RLS filters tenant.
  const since = new Date(Date.now() - INTERACTION_WINDOW_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
  const interactionsRes = await supabase
    .from("stakeholder_interactions")
    .select(
      "id, channel, direction, interaction_date, summary, stakeholder_interaction_participants!inner(stakeholder_id, participant_sentiment, participant_cooperation_signal)",
    )
    .eq("project_id", projectId)
    .eq("stakeholder_interaction_participants.stakeholder_id", sid)
    .is("deleted_at", null)
    .gte("interaction_date", since)
    .order("interaction_date", { ascending: false })
    .limit(INTERACTION_WINDOW_LIMIT)
  if (interactionsRes.error) {
    return apiError("internal_error", interactionsRes.error.message, 500)
  }

  type InteractionRow = {
    id: string
    channel: string
    direction: string
    interaction_date: string
    summary: string
    stakeholder_interaction_participants: Array<{
      stakeholder_id: string
      participant_sentiment: number | null
      participant_cooperation_signal: number | null
    }>
  }
  const recentInteractions = (interactionsRes.data ?? []).map((row) => {
    const r = row as InteractionRow
    const participant = r.stakeholder_interaction_participants.find(
      (p) => p.stakeholder_id === sid,
    )
    return {
      interaction_id: r.id,
      channel: r.channel,
      direction: r.direction,
      interaction_date: r.interaction_date,
      summary: r.summary,
      participant_sentiment: participant?.participant_sentiment ?? null,
      participant_cooperation_signal:
        participant?.participant_cooperation_signal ?? null,
    }
  })

  // Q3 + Q4 — PROJ-35 risk + tonality. RPC contract documented in PROJ-35.
  // Both calls are read-only and tolerate missing data (project may not
  // yet have a PROJ-35 risk row); fail-soft to null.
  let riskScore: number | null = null
  let escalationPattern: number | null = null
  let criticalPath: boolean | null = null
  let tonalityHint: string | null = null
  try {
    const riskRpc = await supabase.rpc("stakeholder_risk_snapshot", {
      p_project_id: projectId,
      p_stakeholder_id: sid,
    })
    if (!riskRpc.error && riskRpc.data) {
      const snap = riskRpc.data as Record<string, unknown>
      riskScore = (snap.risk_score as number | null) ?? null
      escalationPattern = (snap.escalation_pattern as number | null) ?? null
      criticalPath = (snap.critical_path as boolean | null) ?? null
    }
  } catch {
    // PROJ-35 RPC may not exist in some environments — fail-soft.
  }
  try {
    const tonalityRpc = await supabase.rpc("stakeholder_tonality_hint", {
      p_stakeholder_id: sid,
    })
    if (!tonalityRpc.error && tonalityRpc.data) {
      tonalityHint = String(tonalityRpc.data)
    }
  } catch {
    // Same fail-soft for missing RPC.
  }

  // Q5 — response stats. Lazy aggregation on awaiting + response_received.
  let awaitingCount = 0
  let avgLatencyHours: number | null = null
  let hasOverdue = false
  const awaitingRes = await supabase
    .from("stakeholder_interactions")
    .select(
      "interaction_date, awaiting_response, response_due_date, response_received_date",
    )
    .eq("project_id", projectId)
    .in(
      "id",
      // Sub-select via the bridge — limit to interactions involving sid.
      (
        await supabase
          .from("stakeholder_interaction_participants")
          .select("interaction_id")
          .eq("stakeholder_id", sid)
          .limit(500)
      ).data?.map((r) => (r as { interaction_id: string }).interaction_id) ?? [],
    )
    .is("deleted_at", null)
  if (!awaitingRes.error && awaitingRes.data) {
    const today = new Date().toISOString().slice(0, 10)
    let latencySumHours = 0
    let latencyCount = 0
    for (const row of awaitingRes.data) {
      const r = row as {
        interaction_date: string
        awaiting_response: boolean
        response_due_date: string | null
        response_received_date: string | null
      }
      if (r.awaiting_response) {
        awaitingCount++
        if (r.response_due_date && r.response_due_date < today) hasOverdue = true
      }
      if (r.response_received_date && r.interaction_date) {
        const start = new Date(r.interaction_date).getTime()
        const end = new Date(r.response_received_date).getTime()
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          latencySumHours += (end - start) / 3_600_000
          latencyCount++
        }
      }
    }
    if (latencyCount > 0) {
      avgLatencyHours = latencySumHours / latencyCount
    }
  }

  const profile: CoachingAutoContext["profile"] = {}
  const big5: NonNullable<CoachingAutoContext["profile"]["big5"]> = {}
  for (const dim of [
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
  ] as const) {
    const v = sh[`big5_${dim}`]
    if (typeof v === "number") big5[dim] = v
  }
  if (Object.keys(big5).length > 0) profile.big5 = big5

  const skills: NonNullable<CoachingAutoContext["profile"]["skills"]> = {}
  for (const skill of [
    "negotiation",
    "communication",
    "technical",
    "leadership",
    "strategic",
  ]) {
    const v = sh[`skill_${skill}`]
    if (typeof v === "number") skills[skill] = v
  }
  if (Object.keys(skills).length > 0) profile.skills = skills

  if (typeof sh.reasoning === "string") profile.reasoning = sh.reasoning
  if (typeof sh.attitude === "string") profile.attitude = sh.attitude
  if (typeof sh.management_level === "string")
    profile.management_level = sh.management_level
  if (typeof sh.decision_authority === "string")
    profile.decision_authority = sh.decision_authority
  if (typeof sh.communication_need === "string")
    profile.communication_need = sh.communication_need
  if (typeof sh.preferred_channel === "string")
    profile.preferred_channel = sh.preferred_channel

  const context: CoachingAutoContext = {
    stakeholder_id: sid,
    stakeholder_name: String(sh.name ?? "Stakeholder"),
    profile,
    recent_interactions: recentInteractions,
    risk: {
      score: riskScore,
      escalation_pattern: escalationPattern,
      critical_path: criticalPath,
    },
    tonality_hint: tonalityHint,
    response_stats: {
      awaiting_count: awaitingCount,
      avg_response_latency_hours: avgLatencyHours,
      has_overdue: hasOverdue,
    },
  }

  const result = await invokeCoachingGeneration({
    supabase,
    tenantId,
    projectId,
    actorUserId: userId,
    context,
  })

  // Soft-delete existing drafts (re-trigger overwrite — locked 2026-05-13).
  const softDelete = await supabase
    .from("stakeholder_coaching_recommendations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("stakeholder_id", sid)
    .eq("review_state", "draft")
    .is("deleted_at", null)
    .select("id")
  if (softDelete.error) {
    return apiError("internal_error", softDelete.error.message, 500)
  }

  if (result.external_blocked || result.recommendations.length === 0) {
    return Response.json({
      run: {
        provider: result.provider,
        model: result.model_id,
        status: result.status,
        tonality_hint: result.tonality_hint,
      },
      recommendations: [],
    })
  }

  const rowsToInsert = result.recommendations.map((r) => ({
    tenant_id: tenantId,
    project_id: projectId,
    stakeholder_id: sid,
    recommendation_kind: r.kind,
    recommendation_text: r.text,
    review_state: "draft",
    cited_interaction_ids: r.cited_interaction_ids,
    cited_profile_fields: r.cited_profile_fields,
    provider: result.provider,
    model_id: result.model_id,
    confidence: r.confidence,
    ki_run_id: result.run_id,
    prompt_context_meta: {
      tonality_hint: result.tonality_hint,
      risk_score_snapshot: riskScore,
      interaction_count_used: recentInteractions.length,
    },
    created_by: userId,
  }))

  const insertRes = await supabase
    .from("stakeholder_coaching_recommendations")
    .insert(rowsToInsert)
    .select(RECOMMENDATION_COLUMNS)
  if (insertRes.error) {
    return apiError("internal_error", insertRes.error.message, 500)
  }

  return Response.json({
    run: {
      provider: result.provider,
      model: result.model_id,
      status: result.status,
      tonality_hint: result.tonality_hint,
    },
    recommendations: insertRes.data ?? [],
  })
}
