/**
 * PROJ-21 — server-side snapshot data freezer.
 *
 * Called once per snapshot create. Pulls every field the renderer
 * needs (project + tenant branding + phases + milestones + risks +
 * decisions + open-items + work-item counts + traffic-light) into a
 * single `SnapshotContent` payload that gets written verbatim into
 * `report_snapshots.content` JSONB.
 *
 * Server-only — never imported by client code (uses the SSR Supabase
 * client and produces no React output).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  computeStatusTrafficLight,
  type StatusTrafficLightResult,
} from "./status-traffic-light"
import type {
  SnapshotContent,
  SnapshotDecisionRef,
  SnapshotHeader,
  SnapshotKind,
  SnapshotMilestoneRef,
  SnapshotOpenItemRef,
  SnapshotPhaseRef,
  SnapshotRiskRef,
  WorkItemAggregate,
} from "./types"

interface AggregateInput {
  supabase: SupabaseClient
  projectId: string
  generatorUserId: string
  generatorDisplayName: string
  /** Optional KI-narrative payload — when included, embedded into
   *  `content.ki_summary`. Routing rules (Class-3 → local provider) are
   *  enforced upstream in the API route's preview/commit flow. */
  kiSummary?: SnapshotContent["ki_summary"]
  /** Free-text "Aktueller Stand" override for Executive-Summary when
   *  KI is disabled. */
  manualSummary?: string | null
  /** Override for tests; defaults to `new Date()`. */
  now?: Date
}

interface AggregateResult {
  content: SnapshotContent
  trafficLight: StatusTrafficLightResult
  /** Tenant id from the project — caller uses this for the snapshot row. */
  tenantId: string
}

/** Defensive cap so a wildly long "Aktueller Stand" does not blow the
 *  JSONB column. KI narrative has its own 1000-char cap upstream. */
const MANUAL_SUMMARY_MAX = 2000

export async function aggregateSnapshotData(
  input: AggregateInput,
  kind: SnapshotKind,
): Promise<AggregateResult> {
  const now = input.now ?? new Date()
  const supabase = input.supabase

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select(
      "id, tenant_id, name, project_method, responsible_user_id, type_specific_data",
    )
    .eq("id", input.projectId)
    .maybeSingle()
  if (projectErr || !project) {
    throw new Error(
      `aggregate: project lookup failed (${projectErr?.message ?? "not found"})`,
    )
  }

  const tenantId = project.tenant_id as string

  // Tenant + branding (frozen at snapshot time).
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, branding")
    .eq("id", tenantId)
    .maybeSingle<{
      id: string
      name: string
      branding: { logo_url?: string | null; accent_color?: string | null } | null
    }>()

  // Phases — sorted by sequence_number, only non-deleted.
  const { data: phasesRaw } = await supabase
    .from("phases")
    .select(
      "id, name, planned_start, planned_end, status, sequence_number, is_deleted",
    )
    .eq("project_id", input.projectId)
    .eq("is_deleted", false)
    .order("sequence_number", { ascending: true })
  const phases: SnapshotPhaseRef[] = (phasesRaw ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    planned_start: (p.planned_start as string | null) ?? null,
    planned_end: (p.planned_end as string | null) ?? null,
    status: p.status as string,
  }))

  // Milestones — full list (we still need to count overdue across ALL
  // active milestones for the traffic-light, even if we only display
  // the next 5 upcoming).
  const { data: milestonesRaw } = await supabase
    .from("milestones")
    .select(
      "id, name, target_date, status, phase_id, is_deleted",
    )
    .eq("project_id", input.projectId)
    .eq("is_deleted", false)
  const allMilestones: SnapshotMilestoneRef[] = (milestonesRaw ?? []).map(
    (m) => ({
      id: m.id as string,
      name: m.name as string,
      due_date: (m.target_date as string | null) ?? null,
      status: (m.status as string) ?? "planned",
      phase_id: (m.phase_id as string | null) ?? null,
    }),
  )
  const upcomingMilestones = [...allMilestones]
    .filter((m) => m.due_date != null)
    .sort((a, b) => {
      const at = a.due_date ? Date.parse(a.due_date) : 0
      const bt = b.due_date ? Date.parse(b.due_date) : 0
      return at - bt
    })
    .slice(0, 5)

  // Risks — pull all open + recent so the traffic-light count is right.
  const { data: risksRaw } = await supabase
    .from("risks")
    .select(
      "id, title, probability, impact, score, status",
    )
    .eq("project_id", input.projectId)
  const allRisks: SnapshotRiskRef[] = (risksRaw ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    probability: (r.probability as number) ?? 0,
    impact: (r.impact as number) ?? 0,
    score: (r.score as number) ?? 0,
    status: (r.status as SnapshotRiskRef["status"]) ?? "open",
  }))
  const topRisks = [...allRisks]
    .filter((r) => r.status === "open")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  // Decisions — latest 5 by decided_at, not-deleted, with revised flag.
  const { data: decisionsRaw } = await supabase
    .from("decisions")
    .select(
      "id, title, decision_text, decided_at, is_revised",
    )
    .eq("project_id", input.projectId)
    .order("decided_at", { ascending: false })
    .limit(5)
  const topDecisions: SnapshotDecisionRef[] = (decisionsRaw ?? []).map((d) => ({
    id: d.id as string,
    title: d.title as string,
    decision_text: d.decision_text as string,
    decided_at: d.decided_at as string,
    is_revised: Boolean(d.is_revised),
  }))

  // Open items — total count (status != closed) + 3 oldest unresolved
  // (the table has no due-date column; "overdue" here means oldest
  // open by created_at).
  const { count: openItemsTotal } = await supabase
    .from("open_items")
    .select("id", { count: "exact", head: true })
    .eq("project_id", input.projectId)
    .neq("status", "closed")
  const { data: overdueRaw } = await supabase
    .from("open_items")
    .select("id, title, created_at, status, converted_to_entity_id")
    .eq("project_id", input.projectId)
    .neq("status", "closed")
    .is("converted_to_entity_id", null)
    .order("created_at", { ascending: true })
    .limit(3)
  const overdueOpenItems: SnapshotOpenItemRef[] = (overdueRaw ?? []).map(
    (oi) => ({
      id: oi.id as string,
      title: oi.title as string,
      due_date: (oi.created_at as string | null) ?? null,
    }),
  )

  // Work-item aggregates (count by kind + status), excluding deleted.
  const { data: workItemsRaw } = await supabase
    .from("work_items")
    .select("id, kind, status, is_deleted")
    .eq("project_id", input.projectId)
    .eq("is_deleted", false)
  const byKind: WorkItemAggregate = {}
  const byStatus: WorkItemAggregate = {}
  for (const wi of workItemsRaw ?? []) {
    const k = (wi.kind as string) ?? "unknown"
    const s = (wi.status as string) ?? "unknown"
    byKind[k] = (byKind[k] ?? 0) + 1
    byStatus[s] = (byStatus[s] ?? 0) + 1
  }

  // Lead + sponsor names — derive from project.responsible_user_id.
  // profiles.id is the PK (= auth.users.id); there is no profiles.user_id column.
  let leadName: string | null = null
  if (project.responsible_user_id) {
    const { data: leadProfile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", project.responsible_user_id as string)
      .maybeSingle<{ display_name: string | null; email: string | null }>()
    leadName = leadProfile?.display_name ?? leadProfile?.email ?? null
  }
  const sponsorName =
    (project.type_specific_data as { sponsor_name?: string } | null)
      ?.sponsor_name ?? null

  const trafficLight = computeStatusTrafficLight({
    milestones: allMilestones,
    risks: allRisks,
    now,
  })

  const header: SnapshotHeader = {
    project_id: project.id as string,
    project_name: project.name as string,
    project_method: (project.project_method as string | null) ?? null,
    sponsor_name: sponsorName,
    lead_name: leadName,
    tenant_id: tenantId,
    tenant_name: tenant?.name ?? "Tenant",
    tenant_logo_url: tenant?.branding?.logo_url ?? null,
    tenant_accent_color: tenant?.branding?.accent_color ?? null,
  }

  const manualSummary =
    typeof input.manualSummary === "string" && input.manualSummary.trim()
      ? input.manualSummary.trim().slice(0, MANUAL_SUMMARY_MAX)
      : null

  // PROJ-56-ε — freeze the readiness snapshot so the report
  // reflects the project's setup-state at the moment of capture.
  // Failures here are swallowed: the report still renders without
  // the readiness section if the aggregator hiccups.
  let readiness: SnapshotContent["readiness"]
  try {
    const { resolveProjectReadiness } = await import(
      "@/lib/project-readiness/aggregate"
    )
    const snap = await resolveProjectReadiness({
      supabase,
      projectId: input.projectId,
      tenantId,
      now,
    })
    readiness = {
      state: snap.state,
      open_blockers: snap.counts.open_blockers,
      open_warnings: snap.counts.open_warnings,
      satisfied: snap.counts.satisfied,
    }
  } catch {
    readiness = undefined
  }

  const content: SnapshotContent = {
    header,
    traffic_light: trafficLight.light,
    phases,
    upcoming_milestones: upcomingMilestones,
    top_risks: topRisks,
    top_decisions: topDecisions,
    overdue_open_items: overdueOpenItems,
    open_items_total: openItemsTotal ?? 0,
    work_item_counts: { by_kind: byKind, by_status: byStatus },
    ki_summary: input.kiSummary ?? null,
    manual_summary: manualSummary,
    generated_by_name: input.generatorDisplayName,
    generated_at: now.toISOString(),
    readiness,
  }
  // Suppress unused warning for `kind` — reserved for future
  // kind-specific aggregation (e.g. shorter lists for Executive-
  // Summary). V1 freezes the same dataset for both kinds and the
  // body components slice as needed.
  void kind

  return { content, trafficLight, tenantId }
}
