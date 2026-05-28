/**
 * PROJ-12 — server-side auto-context collector for risk suggestions.
 *
 * Pulls a curated, Class-1/2-only slice of project state. The shape is
 * locked to `RiskAutoContext` and the SELECT statements explicitly list
 * fields — adding a Class-3 field to this collector accidentally would
 * still get caught by `classifyRiskAutoContext` at the router boundary,
 * but the first defense is right here: don't ask the DB for fields you
 * don't want to leak.
 *
 * Allowlist (per the locked design choice):
 *   projects:    name, project_type, project_method, lifecycle_status,
 *                planned_start_date, planned_end_date
 *   phases:      name, status, planned_start, planned_end
 *   milestones:  name, status, target_date
 *   work_items:  title, kind, status   (NO description — Class-3 risk)
 *   risks:       title, probability, impact   (used as negative examples)
 *
 * Stakeholders, profiles, descriptions, notes, audit data are NOT
 * included.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { NarrativeAutoContext, RiskAutoContext } from "./types"

const WORK_ITEMS_LIMIT = 30
const RISKS_LIMIT = 50

const NARRATIVE_TOP_RISKS_LIMIT = 3
const NARRATIVE_TOP_DECISIONS_LIMIT = 3
const NARRATIVE_UPCOMING_MILESTONES_LIMIT = 3

export async function collectRiskAutoContext(
  supabase: SupabaseClient,
  projectId: string
): Promise<RiskAutoContext> {
  const [project, phases, milestones, workItems, risks] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "name, project_type, project_method, lifecycle_status, planned_start_date, planned_end_date"
      )
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("phases")
      .select("name, status, planned_start, planned_end")
      .eq("project_id", projectId)
      .order("sequence_number", { ascending: true })
      .limit(20),
    supabase
      .from("milestones")
      .select("name, status, target_date")
      .eq("project_id", projectId)
      .order("target_date", { ascending: true })
      .limit(20),
    supabase
      .from("work_items")
      .select("title, kind, status")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(WORK_ITEMS_LIMIT),
    supabase
      .from("risks")
      .select("title, probability, impact")
      .eq("project_id", projectId)
      .order("score", { ascending: false })
      .limit(RISKS_LIMIT),
  ])

  if (project.error) throw new Error(`auto-context (projects): ${project.error.message}`)
  if (phases.error) throw new Error(`auto-context (phases): ${phases.error.message}`)
  if (milestones.error)
    throw new Error(`auto-context (milestones): ${milestones.error.message}`)
  if (workItems.error)
    throw new Error(`auto-context (work_items): ${workItems.error.message}`)
  if (risks.error) throw new Error(`auto-context (risks): ${risks.error.message}`)

  if (!project.data) {
    throw new Error(`auto-context: project ${projectId} not found`)
  }

  return {
    project: {
      name: project.data.name as string,
      project_type: (project.data.project_type as string | null) ?? null,
      project_method: (project.data.project_method as string | null) ?? null,
      lifecycle_status: project.data.lifecycle_status as string,
      planned_start_date:
        (project.data.planned_start_date as string | null) ?? null,
      planned_end_date:
        (project.data.planned_end_date as string | null) ?? null,
    },
    phases: (phases.data ?? []).map((p) => ({
      name: p.name as string,
      status: p.status as string,
      planned_start: (p.planned_start as string | null) ?? null,
      planned_end: (p.planned_end as string | null) ?? null,
    })),
    milestones: (milestones.data ?? []).map((m) => ({
      name: m.name as string,
      status: m.status as string,
      target_date: (m.target_date as string | null) ?? null,
    })),
    work_items: (workItems.data ?? []).map((w) => ({
      title: w.title as string,
      kind: w.kind as string,
      status: w.status as string,
    })),
    existing_risks: (risks.data ?? []).map((r) => ({
      title: r.title as string,
      probability: r.probability as number,
      impact: r.impact as number,
    })),
  }
}

// ---------------------------------------------------------------------------
// PROJ-30 — narrative auto-context collector
// ---------------------------------------------------------------------------

/**
 * Pull a curated, Class-1/2-only slice of project state for the
 * narrative-purpose router. Strict: NO `responsible_user_id`, NO
 * stakeholder joins, NO descriptions/notes/freetext-fields.
 *
 * The classifier (`classifyNarrativeAutoContext`) is the second
 * defense line: if a future change accidentally includes a Class-3
 * field here, the classifier flips to Class-3 and forces local-only
 * routing. This collector is the first line — keep the SELECT lists
 * tight.
 */
export async function buildNarrativeAutoContext(
  supabase: SupabaseClient,
  projectId: string,
  kind: "status_report" | "executive_summary",
): Promise<NarrativeAutoContext> {
  const nowIso = new Date().toISOString()

  const [project, phases, topRisks, topDecisions, upcomingMilestones, workItems] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "name, project_type, project_method, lifecycle_status, planned_start_date, planned_end_date",
        )
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("phases")
        .select("status")
        .eq("project_id", projectId)
        .eq("is_deleted", false),
      supabase
        .from("risks")
        .select("title, probability, impact, status")
        .eq("project_id", projectId)
        .eq("status", "open")
        .order("score", { ascending: false })
        .limit(NARRATIVE_TOP_RISKS_LIMIT),
      supabase
        .from("decisions")
        .select("title, decided_at")
        .eq("project_id", projectId)
        .order("decided_at", { ascending: false })
        .limit(NARRATIVE_TOP_DECISIONS_LIMIT),
      supabase
        .from("milestones")
        .select("name, status, target_date")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .gte("target_date", nowIso.slice(0, 10))
        .order("target_date", { ascending: true })
        .limit(NARRATIVE_UPCOMING_MILESTONES_LIMIT),
      supabase
        .from("work_items")
        .select("kind, status")
        .eq("project_id", projectId)
        .eq("is_deleted", false),
    ])

  if (project.error)
    throw new Error(`narrative auto-context (projects): ${project.error.message}`)
  if (phases.error)
    throw new Error(`narrative auto-context (phases): ${phases.error.message}`)
  if (topRisks.error)
    throw new Error(`narrative auto-context (risks): ${topRisks.error.message}`)
  if (topDecisions.error)
    throw new Error(
      `narrative auto-context (decisions): ${topDecisions.error.message}`,
    )
  if (upcomingMilestones.error)
    throw new Error(
      `narrative auto-context (milestones): ${upcomingMilestones.error.message}`,
    )
  if (workItems.error)
    throw new Error(
      `narrative auto-context (work_items): ${workItems.error.message}`,
    )

  if (!project.data) {
    throw new Error(`narrative auto-context: project ${projectId} not found`)
  }

  const phasesByStatus: Record<string, number> = {}
  for (const p of phases.data ?? []) {
    const s = (p.status as string | null) ?? "unknown"
    phasesByStatus[s] = (phasesByStatus[s] ?? 0) + 1
  }

  const byKind: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const wi of workItems.data ?? []) {
    const k = (wi.kind as string | null) ?? "unknown"
    const s = (wi.status as string | null) ?? "unknown"
    byKind[k] = (byKind[k] ?? 0) + 1
    byStatus[s] = (byStatus[s] ?? 0) + 1
  }

  return {
    kind,
    project: {
      name: project.data.name as string,
      project_type: (project.data.project_type as string | null) ?? null,
      project_method: (project.data.project_method as string | null) ?? null,
      lifecycle_status: project.data.lifecycle_status as string,
      planned_start_date:
        (project.data.planned_start_date as string | null) ?? null,
      planned_end_date:
        (project.data.planned_end_date as string | null) ?? null,
    },
    phases_summary: {
      total: phases.data?.length ?? 0,
      by_status: phasesByStatus,
    },
    top_risks: (topRisks.data ?? []).map((r) => ({
      title: r.title as string,
      score: ((r.probability as number) ?? 0) * ((r.impact as number) ?? 0),
      status: r.status as string,
    })),
    top_decisions: (topDecisions.data ?? []).map((d) => ({
      title: d.title as string,
      decided_at: d.decided_at as string,
    })),
    upcoming_milestones: (upcomingMilestones.data ?? []).map((m) => ({
      name: m.name as string,
      status: m.status as string,
      target_date: (m.target_date as string | null) ?? null,
    })),
    backlog_counts: {
      by_kind: byKind,
      by_status: byStatus,
    },
  }
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.α — trajectory-sequence context collector
// ---------------------------------------------------------------------------

const TRAJECTORY_PHASES_LIMIT = 100
const TRAJECTORY_SPRINTS_LIMIT = 100
const TRAJECTORY_MILESTONES_LIMIT = 100
const TRAJECTORY_GOALS_LIMIT = 50
const TRAJECTORY_DEPENDENCIES_LIMIT = 500

/**
 * Build the Class-2 auto-context for trajectory-sequence suggestions.
 *
 * Allowlist (Class-1/2 only; defense-in-depth at `classify.ts`):
 *   projects:      name, project_type, project_method, lifecycle_status,
 *                  planned_start_date, planned_end_date
 *   phases:        id, name, status, planned_start, planned_end,
 *                  sequence_number   (filtered to is_deleted=false)
 *   sprints:       id, name, state, start_date, end_date
 *   milestones:    id, name, status, target_date   (is_deleted=false)
 *   project_goals: id, title, target_date, status  (deleted_at IS NULL)
 *   dependencies:  from_type, from_id, to_type, to_id, constraint_type
 *                  — scoped to from-ids that live in THIS project
 *
 * No stakeholders, no personal data, no descriptions or freetext that
 * could carry Class-3 information. Dependencies are filtered to the
 * project's phase/sprint/milestone ids so we don't leak cross-project
 * graph structure into the prompt.
 */
export async function collectTrajectorySequenceContext(
  supabase: SupabaseClient,
  projectId: string,
): Promise<import("./types").TrajectorySequenceAutoContext> {
  const [projectRes, phasesRes, sprintsRes, milestonesRes, goalsRes] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "name, project_type, project_method, lifecycle_status, planned_start_date, planned_end_date",
        )
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("phases")
        .select(
          "id, name, status, planned_start, planned_end, sequence_number",
        )
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .order("sequence_number", { ascending: true, nullsFirst: false })
        .limit(TRAJECTORY_PHASES_LIMIT),
      supabase
        .from("sprints")
        .select("id, name, state, start_date, end_date")
        .eq("project_id", projectId)
        .order("start_date", { ascending: true, nullsFirst: false })
        .limit(TRAJECTORY_SPRINTS_LIMIT),
      supabase
        .from("milestones")
        .select("id, name, status, target_date")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .order("target_date", { ascending: true, nullsFirst: false })
        .limit(TRAJECTORY_MILESTONES_LIMIT),
      supabase
        .from("project_goals")
        .select("id, title, target_date, status")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .limit(TRAJECTORY_GOALS_LIMIT),
    ])

  if (projectRes.error) throw new Error(`projects: ${projectRes.error.message}`)
  if (phasesRes.error) throw new Error(`phases: ${phasesRes.error.message}`)
  if (sprintsRes.error) throw new Error(`sprints: ${sprintsRes.error.message}`)
  if (milestonesRes.error)
    throw new Error(`milestones: ${milestonesRes.error.message}`)
  if (goalsRes.error) throw new Error(`project_goals: ${goalsRes.error.message}`)
  if (!projectRes.data) throw new Error("Project not found.")

  const phases = (phasesRes.data ?? []) as Array<{
    id: string
    name: string
    status: string
    planned_start: string | null
    planned_end: string | null
    sequence_number: number | null
  }>
  const sprints = (sprintsRes.data ?? []) as Array<{
    id: string
    name: string
    state: string
    start_date: string | null
    end_date: string | null
  }>
  const milestones = (milestonesRes.data ?? []) as Array<{
    id: string
    name: string
    status: string
    target_date: string | null
  }>
  const goals = (goalsRes.data ?? []) as Array<{
    id: string
    title: string
    target_date: string | null
    status: string | null
  }>

  // Dependencies are polymorphic and have no project_id. Scope them to
  // ids that exist in THIS project so we don't leak cross-project graph.
  const inScopeIds = new Set<string>([
    ...phases.map((p) => p.id),
    ...sprints.map((s) => s.id),
    ...milestones.map((m) => m.id),
  ])
  let dependencies: Array<{
    from_type: string
    from_id: string
    to_type: string
    to_id: string
    constraint_type: string
  }> = []
  if (inScopeIds.size > 0) {
    const idsArr = Array.from(inScopeIds)
    const depsRes = await supabase
      .from("dependencies")
      .select("from_type, from_id, to_type, to_id, constraint_type")
      .in("from_id", idsArr)
      .limit(TRAJECTORY_DEPENDENCIES_LIMIT)
    if (depsRes.error)
      throw new Error(`dependencies: ${depsRes.error.message}`)
    // Defense-in-depth: drop any row whose to_id leaves the project scope.
    dependencies = (depsRes.data ?? []).filter((d) =>
      inScopeIds.has((d as { to_id: string }).to_id),
    ) as typeof dependencies
  }

  const project = projectRes.data as {
    name: string
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
    planned_start_date: string | null
    planned_end_date: string | null
  }

  return {
    project,
    phases,
    sprints,
    milestones,
    dependencies,
    goals,
  }
}
