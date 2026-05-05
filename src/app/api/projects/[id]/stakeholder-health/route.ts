/**
 * PROJ-35 Phase 35-γ — Stakeholder-Health-Dashboard data endpoint.
 * PROJ-43-α — Critical-Path-Detection extended to three paths.
 * PROJ-43-β — Sprint path + method-gating via PROJ-26 visibility map.
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
 * `on_critical_path` flag is server-side. A stakeholder is on the critical
 * path if ANY active path reaches a non-deleted work-item that sits in a
 * critical schedule construct (phase or sprint, depending on method):
 *
 *   Path A — Resource via stakeholder link
 *     stakeholders.id ↔ resources.source_stakeholder_id
 *     → work_item_resources → work_items → critical phase OR sprint
 *
 *   Path B — Resource via user link (Gap 1b)
 *     stakeholders.linked_user_id ↔ resources.linked_user_id
 *     → work_item_resources → work_items → critical phase OR sprint
 *
 *   Path C — Direct responsible user on work-item (Gap 1)
 *     stakeholders.linked_user_id ↔ work_items.responsible_user_id
 *     → work_items → critical phase OR sprint
 *
 * Method-gating (PROJ-43-β): `phases` paths run only when the project's
 * method allows phases (waterfall, pmi, prince2, vxt2) or method is NULL;
 * `sprints` paths run only when the project's method allows sprints
 * (scrum, safe) or method is NULL. For Kanban projects neither path
 * runs and on_critical_path is false for all stakeholders.
 *
 * All paths are project-filtered. Heuristic-Fallback (target_date
 * < end - 14d) not enabled in MVP — relies on PMs explicitly marking
 * phases/sprints. γ (computed-critical-path-marker) deferred.
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { isScheduleConstructAllowedInMethod } from "@/lib/work-items/schedule-method-visibility"
import type { ProjectMethod } from "@/types/project-method"

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
  //    `linked_user_id` is loaded server-side for Path-B/C resolution but is
  //    NOT included in the response shape (Class-3 PII per data-privacy
  //    registry — already excluded from the StakeholderHealthRow type below).
  const { data: stkData, error: stkErr } = await supabase
    .from("stakeholders")
    .select(
      "id, name, is_active, linked_user_id, attitude, conflict_potential, decision_authority, influence, impact, communication_need, preferred_channel, current_escalation_patterns, " +
        "stakeholder_personality_profiles!stakeholder_personality_profiles_stakeholder_id_fkey(agreeableness_fremd, emotional_stability_fremd)",
    )
    .eq("project_id", projectId)
    .eq("is_active", true)
  if (stkErr) return apiError("internal_error", stkErr.message, 500)

  type StakeholderRowFromSupabase = {
    id: string
    name: string
    is_active: boolean
    linked_user_id: string | null
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

  // 2a. Method-gating (PROJ-43-β): read project's method to decide which
  //     schedule-construct paths run. NULL method (project still in setup)
  //     means every construct is allowed, mirroring PROJ-26 semantics.
  const { data: methodRow, error: methodErr } = await supabase
    .from("projects")
    .select("project_method")
    .eq("id", projectId)
    .maybeSingle()
  if (methodErr) return apiError("internal_error", methodErr.message, 500)
  const projectMethod =
    (methodRow as { project_method: ProjectMethod | null } | null)
      ?.project_method ?? null
  const phasesActive = isScheduleConstructAllowedInMethod(
    "phases",
    projectMethod,
  )
  const sprintsActive = isScheduleConstructAllowedInMethod(
    "sprints",
    projectMethod,
  )

  // 2b. Critical-Path-Detection: project-filtered queries run in parallel,
  //     results unified into a single Set<stakeholder_id>. Filtering for
  //     is_deleted/is_critical happens in TS to keep the Supabase query
  //     shape stable for unit-test mocking. Inactive paths skip their
  //     queries entirely (Performance-Vorteil für reine Wasserfall- oder
  //     reine Scrum-Projekte).
  type WirPhaseRow = {
    resources: {
      source_stakeholder_id: string | null
      linked_user_id: string | null
    } | null
    work_items: {
      is_deleted: boolean
      phase_id: string | null
      phases: { is_critical: boolean } | null
    } | null
  }
  type WiPhaseRow = {
    responsible_user_id: string
    is_deleted: boolean
    phase_id: string | null
    phases: { is_critical: boolean } | null
  }
  type WirSprintRow = {
    resources: {
      source_stakeholder_id: string | null
      linked_user_id: string | null
    } | null
    work_items: {
      is_deleted: boolean
      sprint_id: string | null
      sprints: { is_critical: boolean } | null
    } | null
  }
  type WiSprintRow = {
    responsible_user_id: string
    is_deleted: boolean
    sprint_id: string | null
    sprints: { is_critical: boolean } | null
  }

  const wirPhasePromise = phasesActive
    ? supabase
        .from("work_item_resources")
        .select(
          "resources!inner(source_stakeholder_id, linked_user_id), " +
            "work_items!inner(is_deleted, phase_id, phases(is_critical))",
        )
        .eq("project_id", projectId)
    : Promise.resolve({ data: [] as WirPhaseRow[], error: null as null })
  const wiPhasePromise = phasesActive
    ? supabase
        .from("work_items")
        .select("responsible_user_id, is_deleted, phase_id, phases(is_critical)")
        .eq("project_id", projectId)
        .not("responsible_user_id", "is", null)
    : Promise.resolve({ data: [] as WiPhaseRow[], error: null as null })
  const wirSprintPromise = sprintsActive
    ? supabase
        .from("work_item_resources")
        .select(
          "resources!inner(source_stakeholder_id, linked_user_id), " +
            "work_items!inner(is_deleted, sprint_id, sprints(is_critical))",
        )
        .eq("project_id", projectId)
    : Promise.resolve({ data: [] as WirSprintRow[], error: null as null })
  const wiSprintPromise = sprintsActive
    ? supabase
        .from("work_items")
        .select(
          "responsible_user_id, is_deleted, sprint_id, sprints(is_critical)",
        )
        .eq("project_id", projectId)
        .not("responsible_user_id", "is", null)
    : Promise.resolve({ data: [] as WiSprintRow[], error: null as null })

  const [wirPhaseRes, wiPhaseRes, wirSprintRes, wiSprintRes] = await Promise.all(
    [wirPhasePromise, wiPhasePromise, wirSprintPromise, wiSprintPromise],
  )
  if (wirPhaseRes.error)
    return apiError("internal_error", wirPhaseRes.error.message, 500)
  if (wiPhaseRes.error)
    return apiError("internal_error", wiPhaseRes.error.message, 500)
  if (wirSprintRes.error)
    return apiError("internal_error", wirSprintRes.error.message, 500)
  if (wiSprintRes.error)
    return apiError("internal_error", wiSprintRes.error.message, 500)

  // Build linked_user_id → stakeholder_id[] lookup for Path B/C resolution.
  const stakeholdersByLinkedUser = new Map<string, string[]>()
  for (const s of rawStakeholders) {
    if (!s.linked_user_id) continue
    const list = stakeholdersByLinkedUser.get(s.linked_user_id) ?? []
    list.push(s.id)
    stakeholdersByLinkedUser.set(s.linked_user_id, list)
  }

  const criticalStakeholderIds = new Set<string>()

  // Phase paths — A+B (resource allocations) and C (direct responsible).
  if (phasesActive) {
    for (const row of (wirPhaseRes.data ?? []) as unknown as WirPhaseRow[]) {
      const wi = row.work_items
      const res = row.resources
      if (!wi || !res) continue
      if (wi.is_deleted) continue
      if (wi.phases?.is_critical !== true) continue

      if (res.source_stakeholder_id) {
        criticalStakeholderIds.add(res.source_stakeholder_id)
      }
      if (res.linked_user_id) {
        const matched = stakeholdersByLinkedUser.get(res.linked_user_id)
        if (matched) for (const sid of matched) criticalStakeholderIds.add(sid)
      }
    }
    for (const row of (wiPhaseRes.data ?? []) as unknown as WiPhaseRow[]) {
      if (row.is_deleted) continue
      if (row.phases?.is_critical !== true) continue
      const matched = stakeholdersByLinkedUser.get(row.responsible_user_id)
      if (matched) for (const sid of matched) criticalStakeholderIds.add(sid)
    }
  }

  // Sprint paths — A'+B' (resource allocations) and C' (direct responsible).
  if (sprintsActive) {
    for (const row of (wirSprintRes.data ?? []) as unknown as WirSprintRow[]) {
      const wi = row.work_items
      const res = row.resources
      if (!wi || !res) continue
      if (wi.is_deleted) continue
      if (wi.sprints?.is_critical !== true) continue

      if (res.source_stakeholder_id) {
        criticalStakeholderIds.add(res.source_stakeholder_id)
      }
      if (res.linked_user_id) {
        const matched = stakeholdersByLinkedUser.get(res.linked_user_id)
        if (matched) for (const sid of matched) criticalStakeholderIds.add(sid)
      }
    }
    for (const row of (wiSprintRes.data ?? []) as unknown as WiSprintRow[]) {
      if (row.is_deleted) continue
      if (row.sprints?.is_critical !== true) continue
      const matched = stakeholdersByLinkedUser.get(row.responsible_user_id)
      if (matched) for (const sid of matched) criticalStakeholderIds.add(sid)
    }
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
