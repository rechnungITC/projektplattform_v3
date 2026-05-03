/**
 * PROJ-35 Phase 35-γ — Stakeholder-Health-Dashboard data endpoint.
 *
 * GET /api/projects/[id]/stakeholder-health
 *   → { stakeholders[], risk_score_overrides, tenant_id }
 *
 * Returns all active stakeholders of the project with the data needed for
 * client-side risk-score, escalation-pattern, tonality and critical-path
 * computation. Score + bucket aggregates are derived in the page-client
 * via the existing risk-score Compute-Lib (no server-side compute → tenant
 * overrides are applied on every render without a round-trip).
 *
 * `on_critical_path` flag is server-side: a stakeholder is on critical
 * path if any of their assigned work-items (via resources.source_stakeholder_id
 * → work_item_resources → work_items.phase_id → phases.is_critical=true)
 * sits on a critical phase. Heuristic-Fallback (target_date < end - 14d)
 * not enabled in MVP — relies on PMs explicitly marking phases.
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

interface StakeholderHealthRow {
  id: string
  name: string
  is_active: boolean
  attitude: string | null
  conflict_potential: string | null
  decision_authority: string | null
  influence: string | null
  impact: string | null
  communication_need: string | null
  preferred_channel: string | null
  current_escalation_patterns: string[]
  agreeableness_fremd: number | null
  emotional_stability_fremd: number | null
  /** True if any assigned work-item belongs to a phase with is_critical=true. */
  on_critical_path: boolean
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const tenantId = access.project.tenant_id

  // 1. Stakeholders + their personality (Big5-fremd) — RLS-scoped to tenant.
  const { data: stkData, error: stkErr } = await supabase
    .from("stakeholders")
    .select(
      "id, name, is_active, attitude, conflict_potential, decision_authority, influence, impact, communication_need, preferred_channel, current_escalation_patterns, " +
        "stakeholder_personality_profiles!stakeholder_personality_profiles_stakeholder_id_fkey(agreeableness_fremd, emotional_stability_fremd)",
    )
    .eq("project_id", projectId)
    .eq("is_active", true)
  if (stkErr) return apiError("internal_error", stkErr.message, 500)

  type StakeholderRowFromSupabase = {
    id: string
    name: string
    is_active: boolean
    attitude: string | null
    conflict_potential: string | null
    decision_authority: string | null
    influence: string | null
    impact: string | null
    communication_need: string | null
    preferred_channel: string | null
    current_escalation_patterns: string[] | null
    stakeholder_personality_profiles?: {
      agreeableness_fremd: number | null
      emotional_stability_fremd: number | null
    } | null
  }
  const rawStakeholders = (stkData ?? []) as unknown as StakeholderRowFromSupabase[]

  // 2. Critical-Path-Detection: which stakeholder_ids are linked to work-items
  //    on phases with is_critical=true? One indexed query suffices.
  const { data: critData, error: critErr } = await supabase
    .from("resources")
    .select(
      "source_stakeholder_id, work_item_resources!inner(work_item_id, work_items!inner(phase_id, phases!inner(is_critical)))",
    )
    .not("source_stakeholder_id", "is", null)
  if (critErr) return apiError("internal_error", critErr.message, 500)

  type CritRow = {
    source_stakeholder_id: string
    work_item_resources?: Array<{
      work_item_id: string
      work_items?: {
        phase_id: string | null
        phases?: { is_critical: boolean } | null
      } | null
    }> | null
  }
  const criticalStakeholderIds = new Set<string>()
  for (const r of (critData ?? []) as unknown as CritRow[]) {
    const sId = r.source_stakeholder_id
    if (!sId) continue
    const allocations = r.work_item_resources ?? []
    const onCritical = allocations.some(
      (a) => a.work_items?.phases?.is_critical === true,
    )
    if (onCritical) criticalStakeholderIds.add(sId)
  }

  // 3. Tenant overrides (for client-side merge with TS-defaults).
  const { data: settingsData } = await supabase
    .from("tenant_settings")
    .select("risk_score_overrides")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  const riskScoreOverrides =
    (settingsData as unknown as { risk_score_overrides?: unknown } | null)
      ?.risk_score_overrides ?? {}

  // 4. Compose final response.
  const stakeholders: StakeholderHealthRow[] = rawStakeholders.map((s) => ({
    id: s.id,
    name: s.name,
    is_active: s.is_active,
    attitude: s.attitude,
    conflict_potential: s.conflict_potential,
    decision_authority: s.decision_authority,
    influence: s.influence,
    impact: s.impact,
    communication_need: s.communication_need,
    preferred_channel: s.preferred_channel,
    current_escalation_patterns: s.current_escalation_patterns ?? [],
    agreeableness_fremd:
      s.stakeholder_personality_profiles?.agreeableness_fremd ?? null,
    emotional_stability_fremd:
      s.stakeholder_personality_profiles?.emotional_stability_fremd ?? null,
    on_critical_path: criticalStakeholderIds.has(s.id),
  }))

  return NextResponse.json({
    stakeholders,
    risk_score_overrides: riskScoreOverrides,
    tenant_id: tenantId,
  })
}
