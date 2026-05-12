import type { SupabaseClient } from "@supabase/supabase-js"

import { resolveBudgetSummary } from "@/lib/budget/aggregation"
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
import {
  computeStatusTrafficLight,
  CRITICAL_RISK_SCORE_THRESHOLD,
} from "@/lib/reports/status-traffic-light"
import type {
  SnapshotMilestoneRef,
  SnapshotRiskRef,
  TrafficLight,
} from "@/lib/reports/types"
import type { SupportedCurrency } from "@/types/tenant-settings"
import type { HealthState, ProjectHealthSummary } from "./types"

interface ResolveProjectHealthSummaryArgs {
  supabase: SupabaseClient
  projectId: string
  tenantId: string
  currency?: SupportedCurrency
  now?: Date
}

type StakeholderRiskRow = {
  influence: string | null
  impact: string | null
  attitude: string | null
  conflict_potential: string | null
  decision_authority: string | null
  stakeholder_personality_profiles?:
    | { agreeableness_fremd: number | null }
    | { agreeableness_fremd: number | null }[]
    | null
}

const HEALTH_LABELS: Record<TrafficLight, string> = {
  green: "Im Plan",
  yellow: "Unter Beobachtung",
  red: "Kritisch",
}

const BUCKET_ORDER: Record<TrafficLight, number> = {
  green: 1,
  yellow: 2,
  red: 3,
}

export async function resolveProjectHealthSummary({
  supabase,
  projectId,
  tenantId,
  currency = "EUR",
  now,
}: ResolveProjectHealthSummaryArgs): Promise<ProjectHealthSummary> {
  const [
    budget,
    risksRes,
    milestonesRes,
    stakeholdersRes,
    settingsRes,
    awaitingRes,
  ] = await Promise.all([
    resolveBudgetSummary({
      supabase,
      projectId,
      tenantId,
      inCurrency: currency,
    }).catch(() => null),
    supabase
      .from("risks")
      .select("id, title, probability, impact, score, status")
      .eq("project_id", projectId),
    supabase
      .from("milestones")
      .select("id, name, target_date, status, phase_id, is_deleted")
      .eq("project_id", projectId)
      .eq("is_deleted", false),
    supabase
      .from("stakeholders")
      .select(
        "id, is_active, influence, impact, attitude, conflict_potential, decision_authority, " +
          "stakeholder_personality_profiles!stakeholder_personality_profiles_stakeholder_id_fkey(agreeableness_fremd)",
      )
      .eq("project_id", projectId)
      .eq("is_active", true),
    supabase
      .from("tenant_settings")
      .select("risk_score_overrides")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    // PROJ-34-δ — pending replies. RLS already scopes to project-members;
    // we filter the soft-deleted rows and only need the due_date column
    // for the lazy-overdue compute (CIA-L5).
    supabase
      .from("stakeholder_interactions")
      .select("id, response_due_date")
      .eq("project_id", projectId)
      .eq("awaiting_response", true)
      .is("deleted_at", null),
  ])

  if (risksRes.error) throw new Error(`health risks: ${risksRes.error.message}`)
  if (milestonesRes.error) {
    throw new Error(`health milestones: ${milestonesRes.error.message}`)
  }
  if (stakeholdersRes.error) {
    throw new Error(`health stakeholders: ${stakeholdersRes.error.message}`)
  }
  if (awaitingRes.error) {
    // PROJ-34-δ — graceful degradation: a missing communications table
    // (e.g. before α migration applies on a fresh tenant) shouldn't break
    // the overall health summary. We just skip the communications signal.
  }

  const risks: SnapshotRiskRef[] = (risksRes.data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    probability: (r.probability as number) ?? 0,
    impact: (r.impact as number) ?? 0,
    score: (r.score as number) ?? 0,
    status: (r.status as SnapshotRiskRef["status"]) ?? "open",
  }))
  const milestones: SnapshotMilestoneRef[] = (milestonesRes.data ?? []).map(
    (m) => ({
      id: m.id as string,
      name: m.name as string,
      due_date: (m.target_date as string | null) ?? null,
      status: (m.status as string) ?? "planned",
      phase_id: (m.phase_id as string | null) ?? null,
    }),
  )

  const traffic = computeStatusTrafficLight({ milestones, risks, now })
  const openRisks = risks.filter((r) => r.status === "open")
  const criticalOpenRisks = openRisks.filter(
    (r) => r.score >= CRITICAL_RISK_SCORE_THRESHOLD,
  )
  const topRiskScore = openRisks.reduce((max, r) => Math.max(max, r.score), 0)

  const stakeholderSummary = summarizeStakeholderRisk(
    (stakeholdersRes.data ?? []) as unknown as StakeholderRiskRow[],
    (settingsRes.data as { risk_score_overrides?: unknown } | null)
      ?.risk_score_overrides,
  )

  const budgetSummary = budget
    ? summarizeBudget(
        budget.totals.converted_planned,
        budget.totals.converted_actual,
        budget.items.length,
        budget.missing_rates.reduce((sum, r) => sum + r.item_count, 0),
      )
    : {
        planned: 0,
        actual: 0,
        utilization_percent: null,
        item_count: 0,
        missing_rate_count: 0,
        state: "unknown" as HealthState,
      }

  const nowDate = now ?? new Date()
  const nowDateKey = nowDate.toISOString().slice(0, 10)
  const awaitingRows = (awaitingRes.data ?? []) as Array<{
    response_due_date: string | null
  }>
  const openCount = awaitingRows.length
  const overdueCount = awaitingRows.filter(
    (r) => r.response_due_date !== null && r.response_due_date < nowDateKey,
  ).length
  const communicationsSummary = {
    open_count: openCount,
    overdue_count: overdueCount,
    state: summarizeCommunications(openCount, overdueCount),
  }

  const healthLight = maxLight([
    traffic.light,
    stateToLight(budgetSummary.state),
    stateToLight(stakeholderSummary.state),
    stateToLight(communicationsSummary.state),
  ])

  return {
    currency,
    budget: budgetSummary,
    risks: {
      open_count: openRisks.length,
      critical_open_count: criticalOpenRisks.length,
      top_score: topRiskScore,
      state:
        criticalOpenRisks.length >= 2
          ? "red"
          : criticalOpenRisks.length === 1
            ? "yellow"
            : openRisks.length > 0
              ? "green"
              : "empty",
    },
    schedule: {
      overdue_milestone_count: traffic.overdue_milestone_count,
      state:
        traffic.overdue_milestone_count >= 3
          ? "red"
          : traffic.overdue_milestone_count > 0
            ? "yellow"
            : "green",
    },
    stakeholders: stakeholderSummary,
    communications: communicationsSummary,
    health: {
      light: healthLight,
      label: HEALTH_LABELS[healthLight],
      basis: [
        "Budget-Auslastung",
        "kritische offene Risiken",
        "ueberfaellige Meilensteine",
        "Stakeholder-Risk-Score",
        "ueberfaellige Antworten",
      ],
    },
  }
}

function summarizeCommunications(
  openCount: number,
  overdueCount: number,
): HealthState {
  if (openCount === 0) return "empty"
  if (overdueCount >= 3) return "red"
  if (overdueCount > 0) return "yellow"
  return "green"
}

function summarizeBudget(
  planned: number,
  actual: number,
  itemCount: number,
  missingRateCount: number,
): ProjectHealthSummary["budget"] {
  if (itemCount === 0 || planned <= 0) {
    return {
      planned,
      actual,
      utilization_percent: null,
      item_count: itemCount,
      missing_rate_count: missingRateCount,
      state: itemCount === 0 ? "empty" : "unknown",
    }
  }
  const utilization = Math.round((actual / planned) * 1000) / 10
  return {
    planned,
    actual,
    utilization_percent: utilization,
    item_count: itemCount,
    missing_rate_count: missingRateCount,
    state:
      missingRateCount > 0 || utilization >= 100
        ? "red"
        : utilization >= 80
          ? "yellow"
          : "green",
  }
}

function summarizeStakeholderRisk(
  rows: StakeholderRiskRow[],
  overrides: unknown,
): ProjectHealthSummary["stakeholders"] {
  const config = mergeRiskScoreConfig(overrides)
  const counts: Record<RiskBucket, number> = {
    green: 0,
    yellow: 0,
    orange: 0,
    red: 0,
  }
  let maxScore = 0

  for (const row of rows) {
    const profile = Array.isArray(row.stakeholder_personality_profiles)
      ? row.stakeholder_personality_profiles[0]
      : row.stakeholder_personality_profiles
    const result = computeRiskScore(
      {
        influence: row.influence as Influence | null,
        impact: row.impact as Impact | null,
        attitude: row.attitude as Attitude | null,
        conflict_potential: row.conflict_potential as ConflictPotential | null,
        decision_authority: row.decision_authority as DecisionAuthority | null,
        agreeableness_fremd: profile?.agreeableness_fremd ?? null,
      },
      config,
    )
    counts[result.bucket]++
    maxScore = Math.max(maxScore, result.score)
  }

  return {
    active_count: rows.length,
    max_score: maxScore,
    red_count: counts.red,
    orange_count: counts.orange,
    yellow_count: counts.yellow,
    green_count: counts.green,
    state:
      rows.length === 0
        ? "empty"
        : counts.red > 0
          ? "red"
          : counts.orange > 0 || counts.yellow > 0
            ? "yellow"
            : "green",
  }
}

function stateToLight(state: HealthState): TrafficLight {
  if (state === "red") return "red"
  if (state === "yellow") return "yellow"
  return "green"
}

function maxLight(lights: TrafficLight[]): TrafficLight {
  return lights.reduce((max, light) =>
    BUCKET_ORDER[light] > BUCKET_ORDER[max] ? light : max,
  )
}
