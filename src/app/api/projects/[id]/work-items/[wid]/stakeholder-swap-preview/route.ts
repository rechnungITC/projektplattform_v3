/**
 * PROJ-65 ε.2 — Stakeholder-Swap-Simulation preview (transient).
 *
 *   POST /api/projects/[id]/work-items/[wid]/stakeholder-swap-preview
 *     → { candidates: SwapCandidate[], cost_clear_view: boolean }
 *
 * Pure read-only computation:
 *   1. Resolve current assignees of the work_item via
 *      `work_item_resources` → `resources` → `stakeholders`.
 *   2. List alternative stakeholders (same project, `is_active=true`,
 *      `kind='person'`) not already assigned to this work_item.
 *   3. Compute Δ-values per candidate:
 *      - cost_delta:   aggregate bucket (masked) until PROJ-65 L6 wires
 *        real `cost_clear_view` permission + PROJ-54 rate plumbing.
 *      - time_delta_days: 0 (Match-Score AI lands in ε.4).
 *      - risk_delta:  derived from stakeholder influence/impact tier
 *        relative to the current assignee.
 *      - followup_count: downstream work_items reachable via
 *        `dependencies` from this work_item.
 *   4. Class-3-masking honours `project_settings.cost_clear_view_permission`
 *      via `resolveCostClearView` — until L6 ships that helper returns
 *      `false` for everyone, so every cost_delta is aggregate.
 *
 * No DB mutation; the dialog in `stakeholder-swap-dialog.tsx` uses this
 * payload to drive the candidate cards. Plan-mutation lives in ε.3
 * (`POST /plan-mutate` per Tech Design Section E).
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  type ApiErrorBody,
} from "../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; wid: string }>
}

const UuidSchema = z.string().uuid()

const BodySchema = z
  .object({
    /** Optional: focus a specific current-assignee perspective. Unused in ε.2. */
    current_stakeholder_id: z.string().uuid().nullable().optional(),
    /** Maximum candidates to return (server-side cap is 50). */
    limit: z.number().int().positive().max(50).optional(),
  })
  .strict()

type CostDelta =
  | { kind: "exact"; amount_cents: number; currency: string }
  | {
      kind: "aggregate"
      bucket: "much-less" | "less" | "even" | "more" | "much-more"
    }
  | { kind: "none" }

type RiskDelta =
  | { kind: "named"; from: string; to: string }
  | { kind: "even" }
  | { kind: "unknown" }

interface SwapCandidate {
  stakeholder_id: string
  resource_id: string | null
  name: string
  role: string | null
  cost_delta: CostDelta
  time_delta_days: number | null
  risk_delta: RiskDelta
  followup_count: number
  deleted_at?: string | null
}

const RISK_RANK: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

const RISK_LABEL: Record<string, string> = {
  low: "niedrig",
  medium: "mittel",
  high: "hoch",
}

const DEFAULT_LIMIT = 25

export async function POST(
  request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId, wid } = await ctx.params

  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(wid).success) {
    return apiError("validation_error", "Invalid work-item id.", 400, "wid")
  }

  let parsedBody: z.infer<typeof BodySchema> = {}
  try {
    const text = await request.text()
    if (text.trim().length > 0) {
      const raw = JSON.parse(text) as unknown
      const result = BodySchema.safeParse(raw)
      if (!result.success) {
        return apiError(
          "validation_error",
          result.error.issues[0]?.message ?? "Invalid body.",
          400,
        )
      }
      parsedBody = result.data
    }
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const tenantId = (access.project as { tenant_id: string }).tenant_id

  // Confirm the work_item belongs to the project (prevents cross-project
  // probing even when the caller is a tenant member of multiple projects).
  const wiRes = await supabase
    .from("work_items")
    .select("id, project_id, kind, title")
    .eq("id", wid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (wiRes.error) {
    return apiError("internal_error", wiRes.error.message, 500)
  }
  if (!wiRes.data) {
    return apiError("not_found", "Work item not found.", 404)
  }

  // 1. Current assignees of the work_item.
  const currentRes = await supabase
    .from("work_item_resources")
    .select("resource_id")
    .eq("tenant_id", tenantId)
    .eq("work_item_id", wid)
  if (currentRes.error) {
    return apiError("internal_error", currentRes.error.message, 500)
  }
  const currentResourceIds = (currentRes.data ?? []).map(
    (r: { resource_id: string }) => r.resource_id,
  )
  let currentStakeholderIds: string[] = []
  let currentInfluence: string | null = null
  let currentImpact: string | null = null
  if (currentResourceIds.length > 0) {
    const currentResourcesRes = await supabase
      .from("resources")
      .select("source_stakeholder_id")
      .eq("tenant_id", tenantId)
      .in("id", currentResourceIds)
    if (currentResourcesRes.error) {
      return apiError("internal_error", currentResourcesRes.error.message, 500)
    }
    currentStakeholderIds = (currentResourcesRes.data ?? [])
      .map((r: { source_stakeholder_id: string | null }) => r.source_stakeholder_id)
      .filter((v: string | null): v is string => v != null)
    if (currentStakeholderIds.length > 0) {
      const currentStakeholdersRes = await supabase
        .from("stakeholders")
        .select("id, influence, impact")
        .eq("tenant_id", tenantId)
        .in("id", currentStakeholderIds)
      if (currentStakeholdersRes.error) {
        return apiError(
          "internal_error",
          currentStakeholdersRes.error.message,
          500,
        )
      }
      const stakeholders = (currentStakeholdersRes.data ?? []) as Array<{
        id: string
        influence: string | null
        impact: string | null
      }>
      // Take the highest tier as the "incumbent" baseline for risk-Δ.
      currentInfluence = stakeholders
        .map((s) => s.influence)
        .sort((a, b) => (RISK_RANK[b ?? "low"] ?? 0) - (RISK_RANK[a ?? "low"] ?? 0))[0] ?? null
      currentImpact = stakeholders
        .map((s) => s.impact)
        .sort((a, b) => (RISK_RANK[b ?? "low"] ?? 0) - (RISK_RANK[a ?? "low"] ?? 0))[0] ?? null
    }
  }

  // 2. Alternative person-stakeholders in this project, excluding current.
  const limit = parsedBody.limit ?? DEFAULT_LIMIT
  const candidateQuery = supabase
    .from("stakeholders")
    .select("id, name, role_key, kind, influence, impact, is_active")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .eq("kind", "person")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(limit + currentStakeholderIds.length + 10)
  const candidatesRes = await candidateQuery
  if (candidatesRes.error) {
    return apiError("internal_error", candidatesRes.error.message, 500)
  }
  const allCandidates = (candidatesRes.data ?? []) as Array<{
    id: string
    name: string
    role_key: string | null
    kind: string | null
    influence: string | null
    impact: string | null
    is_active: boolean
  }>
  const excludedIds = new Set(currentStakeholderIds)
  const filtered = allCandidates
    .filter((c) => !excludedIds.has(c.id))
    .slice(0, limit)

  // 3. Resource link per candidate (for downstream / role display).
  const candidateIds = filtered.map((c) => c.id)
  const candidateResourcesById = new Map<string, { id: string }>()
  if (candidateIds.length > 0) {
    const candidateResourcesRes = await supabase
      .from("resources")
      .select("id, source_stakeholder_id")
      .eq("tenant_id", tenantId)
      .in("source_stakeholder_id", candidateIds)
    if (candidateResourcesRes.error) {
      return apiError("internal_error", candidateResourcesRes.error.message, 500)
    }
    for (const r of (candidateResourcesRes.data ?? []) as Array<{
      id: string
      source_stakeholder_id: string | null
    }>) {
      if (r.source_stakeholder_id) {
        candidateResourcesById.set(r.source_stakeholder_id, { id: r.id })
      }
    }
  }

  // 4. Downstream followup count via polymorphic dependencies. We count
  //    distinct work_items reachable from this work_item via outgoing
  //    `depends_on` edges (one hop is sufficient for the preview pill).
  const dependenciesRes = await supabase
    .from("dependencies")
    .select("to_id, to_type")
    .eq("tenant_id", tenantId)
    .eq("from_type", "work_package")
    .eq("from_id", wid)
  // PROJ-9 R2 has both `work_package` (waterfall) and `todo` (work_items)
  // as polymorphic kinds — count edges from either to make the heuristic
  // useful for both methods. Errors are non-fatal: we degrade to 0.
  const dependenciesRes2 = await supabase
    .from("dependencies")
    .select("to_id, to_type")
    .eq("tenant_id", tenantId)
    .eq("from_type", "todo")
    .eq("from_id", wid)
  const followupSet = new Set<string>()
  if (!dependenciesRes.error) {
    for (const d of (dependenciesRes.data ?? []) as Array<{
      to_id: string
      to_type: string
    }>) {
      followupSet.add(`${d.to_type}:${d.to_id}`)
    }
  }
  if (!dependenciesRes2.error) {
    for (const d of (dependenciesRes2.data ?? []) as Array<{
      to_id: string
      to_type: string
    }>) {
      followupSet.add(`${d.to_type}:${d.to_id}`)
    }
  }
  const followupCount = followupSet.size

  // 5. Cost-clear-view permission (Class-3). Hardcoded false until L6
  //    plumbs `project_settings.cost_clear_view_permission`. The flag is
  //    surfaced in the response so the FE can disable the "Kosten-Δ"
  //    sort option without a second roundtrip.
  const costClearView = false

  // 6. Build SwapCandidate[] with masked aggregate deltas.
  const candidates: SwapCandidate[] = filtered.map((c) => {
    const followupForCandidate = followupCount

    // Risk-Δ: compare candidate's max(influence,impact) tier to the
    // incumbent's max. Same tier → "even". Higher → risk gets worse.
    const candidateTier = Math.max(
      RISK_RANK[c.influence ?? "low"] ?? 0,
      RISK_RANK[c.impact ?? "low"] ?? 0,
    )
    const incumbentTier = Math.max(
      RISK_RANK[currentInfluence ?? "low"] ?? 0,
      RISK_RANK[currentImpact ?? "low"] ?? 0,
    )
    let riskDelta: RiskDelta
    if (currentInfluence == null && currentImpact == null) {
      riskDelta = { kind: "unknown" }
    } else if (candidateTier === incumbentTier) {
      riskDelta = { kind: "even" }
    } else {
      const from =
        RISK_LABEL[
          Object.keys(RISK_RANK).find((k) => RISK_RANK[k] === incumbentTier) ??
            "medium"
        ]
      const to =
        RISK_LABEL[
          Object.keys(RISK_RANK).find((k) => RISK_RANK[k] === candidateTier) ??
            "medium"
        ]
      riskDelta = { kind: "named", from, to }
    }

    // Cost-Δ: aggregate bucket only in ε.2 (no plaintext rate data).
    // Tier difference is a proxy: higher tier → "more", lower → "less".
    let bucket: "much-less" | "less" | "even" | "more" | "much-more"
    const diff = candidateTier - incumbentTier
    if (diff <= -2) bucket = "much-less"
    else if (diff === -1) bucket = "less"
    else if (diff === 0) bucket = "even"
    else if (diff === 1) bucket = "more"
    else bucket = "much-more"

    return {
      stakeholder_id: c.id,
      resource_id: candidateResourcesById.get(c.id)?.id ?? null,
      name: c.name,
      role: c.role_key,
      cost_delta: { kind: "aggregate", bucket },
      time_delta_days: 0,
      risk_delta: riskDelta,
      followup_count: followupForCandidate,
    }
  })

  return Response.json({ candidates, cost_clear_view: costClearView })
}
