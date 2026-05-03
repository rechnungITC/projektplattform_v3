/**
 * PROJ-35 Phase 35-γ — Stakeholder Risk-Score Trend.
 *
 * GET /api/projects/[id]/stakeholders/[sid]/risk-trend?days=90
 *   → { points: [{ at, score, bucket }], current: { score, bucket } }
 *
 * Reconstructs a historical Risk-Score timeline by merging two audit
 * sources:
 *   - `audit_log_entries` (PROJ-10) — qualitative field changes (attitude,
 *     influence, impact, conflict_potential, decision_authority)
 *   - `stakeholder_profile_audit_events` (PROJ-33-γ) — Big5-fremd changes
 *
 * Strategy: walk events in chronological order, replay state per change,
 * compute Risk-Score at each event-timestamp using the *current* tenant
 * config (not historical config — see PROJ-35.next "Historical Replay").
 *
 * Range param `days` ∈ {30, 90, 365}. Default 90.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { computeRiskScore } from "@/lib/risk-score/compute"
import type {
  Attitude,
  ConflictPotential,
  DecisionAuthority,
  Impact,
  Influence,
  RiskBucket,
} from "@/lib/risk-score/defaults"
import { mergeRiskScoreConfig } from "@/lib/risk-score/merge-overrides"

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

const ALLOWED_DAYS = [30, 90, 365] as const
type AllowedDays = (typeof ALLOWED_DAYS)[number]

interface TrendPoint {
  at: string
  score: number
  bucket: RiskBucket
}

const QUALITATIVE_FIELDS = new Set([
  "attitude",
  "influence",
  "impact",
  "conflict_potential",
  "decision_authority",
])

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const url = new URL(request.url)
  const daysRaw = url.searchParams.get("days")
  const days: AllowedDays = ALLOWED_DAYS.includes(
    Number(daysRaw) as AllowedDays,
  )
    ? (Number(daysRaw) as AllowedDays)
    : 90

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const tenantId = access.project.tenant_id

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // 1. Current state of the stakeholder + Big5-fremd (the "now" anchor).
  const [stkRes, perRes] = await Promise.all([
    supabase
      .from("stakeholders")
      .select(
        "id, attitude, conflict_potential, decision_authority, influence, impact",
      )
      .eq("id", sid)
      .maybeSingle(),
    supabase
      .from("stakeholder_personality_profiles")
      .select("agreeableness_fremd")
      .eq("stakeholder_id", sid)
      .maybeSingle(),
  ])
  if (stkRes.error) return apiError("internal_error", stkRes.error.message, 500)
  if (perRes.error) return apiError("internal_error", perRes.error.message, 500)

  type StakeholderRow = {
    id: string
    attitude: string | null
    conflict_potential: string | null
    decision_authority: string | null
    influence: string | null
    impact: string | null
  }
  type PersonalityRow = { agreeableness_fremd: number | null }

  const stk = stkRes.data as unknown as StakeholderRow | null
  const per = perRes.data as unknown as PersonalityRow | null
  if (!stk) return apiError("not_found", "Stakeholder not found.", 404)

  // 2. Tenant overrides → effective config.
  const { data: settingsData } = await supabase
    .from("tenant_settings")
    .select("risk_score_overrides")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  const config = mergeRiskScoreConfig(
    (settingsData as unknown as { risk_score_overrides?: unknown } | null)
      ?.risk_score_overrides ?? {},
  )

  // 3. Pull qualitative-field changes from audit_log_entries.
  const { data: qualEvents, error: qualErr } = await supabase
    .from("audit_log_entries")
    .select("changed_at, field_name, old_value, new_value")
    .eq("entity_type", "stakeholders")
    .eq("entity_id", sid)
    .gte("changed_at", since)
    .order("changed_at", { ascending: true })
  if (qualErr) return apiError("internal_error", qualErr.message, 500)

  // 4. Pull Big5-fremd changes from stakeholder_profile_audit_events.
  const { data: profileEvents, error: profileErr } = await supabase
    .from("stakeholder_profile_audit_events")
    .select("created_at, profile_kind, event_type, payload")
    .eq("stakeholder_id", sid)
    .gte("created_at", since)
    .in("event_type", ["fremd_updated", "self_assessed_via_token"])
    .eq("profile_kind", "personality")
    .order("created_at", { ascending: true })
  if (profileErr)
    return apiError("internal_error", profileErr.message, 500)

  // 5. Walk events chronologically, replay state, compute score per event.
  // We start from the OLDEST known state (oldest old_value) and walk forward.
  type QualEvent = {
    changed_at: string
    field_name: string
    old_value: unknown
    new_value: unknown
  }
  type ProfEvent = {
    created_at: string
    profile_kind: string
    event_type: string
    payload: { before?: { agreeableness_fremd?: number | null } | null; after?: { agreeableness_fremd?: number | null } | null } | null
  }

  const qe = (qualEvents ?? []) as unknown as QualEvent[]
  const pe = (profileEvents ?? []) as unknown as ProfEvent[]

  // Initialize state to the oldest known old_value per field; if not present
  // in the event-window, fall back to the current value.
  let attitude: Attitude | null = (stk.attitude ?? null) as Attitude | null
  let influence: Influence | null = (stk.influence ?? null) as Influence | null
  let impact: Impact | null = (stk.impact ?? null) as Impact | null
  let conflict: ConflictPotential | null =
    (stk.conflict_potential ?? null) as ConflictPotential | null
  let authority: DecisionAuthority | null =
    (stk.decision_authority ?? null) as DecisionAuthority | null
  let agreeableness: number | null = per?.agreeableness_fremd ?? null

  // Walk backwards through qualEvents to set initial state to "before-first"
  // for each tracked field.
  const seen = new Set<string>()
  for (let i = qe.length - 1; i >= 0; i--) {
    const ev = qe[i]!
    if (!QUALITATIVE_FIELDS.has(ev.field_name) || seen.has(ev.field_name))
      continue
    seen.add(ev.field_name)
    const initialVal = ev.old_value as string | null
    if (ev.field_name === "attitude") attitude = initialVal as Attitude | null
    else if (ev.field_name === "influence")
      influence = initialVal as Influence | null
    else if (ev.field_name === "impact") impact = initialVal as Impact | null
    else if (ev.field_name === "conflict_potential")
      conflict = initialVal as ConflictPotential | null
    else if (ev.field_name === "decision_authority")
      authority = initialVal as DecisionAuthority | null
  }
  // Initial Big5: walk pe backwards to find first "before"-state.
  for (let i = pe.length - 1; i >= 0; i--) {
    const ev = pe[i]!
    const before = ev.payload?.before
    if (before && "agreeableness_fremd" in before) {
      agreeableness = before.agreeableness_fremd ?? null
      break
    }
  }

  // Merge events into one timeline sorted ASC.
  const timeline: Array<
    | { at: string; kind: "qual"; field: string; new_value: unknown }
    | { at: string; kind: "big5"; new_agreeableness: number | null }
  > = [
    ...qe
      .filter((e) => QUALITATIVE_FIELDS.has(e.field_name))
      .map((e) => ({
        at: e.changed_at,
        kind: "qual" as const,
        field: e.field_name,
        new_value: e.new_value,
      })),
    ...pe
      .filter((e) => e.payload?.after && "agreeableness_fremd" in (e.payload?.after ?? {}))
      .map((e) => ({
        at: e.created_at,
        kind: "big5" as const,
        new_agreeableness: e.payload?.after?.agreeableness_fremd ?? null,
      })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  const points: TrendPoint[] = []

  // Snapshot at "since" (start of window) — use initial state.
  const snapshot = (at: string) => {
    const r = computeRiskScore(
      {
        influence,
        impact,
        attitude,
        conflict_potential: conflict,
        decision_authority: authority,
        agreeableness_fremd: agreeableness,
      },
      config,
    )
    points.push({ at, score: r.score, bucket: r.bucket })
  }

  snapshot(since)

  for (const ev of timeline) {
    if (ev.kind === "qual") {
      const v = ev.new_value as string | null
      if (ev.field === "attitude") attitude = v as Attitude | null
      else if (ev.field === "influence") influence = v as Influence | null
      else if (ev.field === "impact") impact = v as Impact | null
      else if (ev.field === "conflict_potential")
        conflict = v as ConflictPotential | null
      else if (ev.field === "decision_authority")
        authority = v as DecisionAuthority | null
    } else if (ev.kind === "big5") {
      agreeableness = ev.new_agreeableness
    }
    snapshot(ev.at)
  }

  // Final point = "now" anchor (current state).
  attitude = (stk.attitude ?? null) as Attitude | null
  influence = (stk.influence ?? null) as Influence | null
  impact = (stk.impact ?? null) as Impact | null
  conflict = (stk.conflict_potential ?? null) as ConflictPotential | null
  authority = (stk.decision_authority ?? null) as DecisionAuthority | null
  agreeableness = per?.agreeableness_fremd ?? null
  const nowR = computeRiskScore(
    {
      influence,
      impact,
      attitude,
      conflict_potential: conflict,
      decision_authority: authority,
      agreeableness_fremd: agreeableness,
    },
    config,
  )
  points.push({
    at: new Date().toISOString(),
    score: nowR.score,
    bucket: nowR.bucket,
  })

  return NextResponse.json({
    days,
    points,
    current: { score: nowR.score, bucket: nowR.bucket },
  })
}
