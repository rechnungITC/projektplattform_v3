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

import type {
  CrossProjectLinkExistingLink,
  CrossProjectLinkProjectRef,
  CrossProjectLinkWorkItemRef,
  CrossProjectLinksAutoContext,
  NarrativeAutoContext,
  ProjectMethodHint,
  ProposalFromContextAutoContext,
  RiskAutoContext,
  StakeholderProposalsAutoContext,
} from "./types"

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

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.β — resource-swap context collector (Class-3, rate-bucketed)
// ---------------------------------------------------------------------------

const RESOURCE_SWAP_WORK_ITEMS_LIMIT = 20
const RESOURCE_SWAP_CANDIDATES_LIMIT = 10
const RESOURCE_SWAP_RAW_CANDIDATE_FETCH_LIMIT = 100

const SKILL_DIMENSION_LABEL: Record<string, string> = {
  domain_knowledge_fremd: "Fachwissen",
  method_competence_fremd: "Methodik",
  it_affinity_fremd: "IT-Affinität",
  negotiation_skill_fremd: "Verhandlung",
  decision_power_fremd: "Entscheidungsstärke",
}

interface SkillProfileRow {
  stakeholder_id: string
  domain_knowledge_fremd: number | null
  method_competence_fremd: number | null
  it_affinity_fremd: number | null
  negotiation_skill_fremd: number | null
  decision_power_fremd: number | null
}

function topSkillsFor(profile: SkillProfileRow | undefined): string[] {
  if (!profile) return []
  const dims: Array<{ key: keyof SkillProfileRow; v: number }> = []
  for (const k of [
    "domain_knowledge_fremd",
    "method_competence_fremd",
    "it_affinity_fremd",
    "negotiation_skill_fremd",
    "decision_power_fremd",
  ] as const) {
    const v = profile[k]
    if (typeof v === "number" && v > 0) dims.push({ key: k, v })
  }
  dims.sort((a, b) => b.v - a.v)
  return dims.slice(0, 3).map((d) => `${SKILL_DIMENSION_LABEL[d.key as string]}=${d.v}`)
}

/** Resolve effective €/day rate for a single resource (override → role → null). */
function resolveRate(
  resource: { daily_rate_override: number | null; role_key?: string | null },
  roleRateByKey: Map<string, number>,
): number | null {
  if (typeof resource.daily_rate_override === "number") {
    return resource.daily_rate_override
  }
  if (resource.role_key) {
    return roleRateByKey.get(resource.role_key) ?? null
  }
  return null
}

/** CIA-L3 — bucket €/day rate against a tenant-median into low|mid|high. */
function bucketRate(
  rateEur: number | null,
  median: number | null,
): import("./types").RateBucket | null {
  if (rateEur === null || median === null || median === 0) return null
  if (rateEur < median * 0.85) return "low"
  if (rateEur > median * 1.15) return "high"
  return "mid"
}

/** Median of a numeric array; null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

/**
 * Build the Class-3 auto-context for resource-swap suggestions.
 *
 * Pre-ranking (CIA-L6, deterministic):
 *   - work_items: status ∈ {todo, in_progress, review} AND has ≥ 1
 *     work_item_resources assignment; sort by status priority
 *     (in_progress → review → todo), then created_at desc; take top-20.
 *   - candidate_resources: `resources.is_active = true`, sort by
 *     display_name (deterministic tiebreaker); take top-10. The
 *     `candidate_pool_truncated_by` count surfaces in the UI banner
 *     ("Aus 10 von 47 Kandidaten").
 *
 * Rate presentation (CIA-L3):
 *   - `cost_clear_view=true`: `rate_eur` populated, `rate_bucket=null`.
 *   - `cost_clear_view=false`: `rate_eur=null`, `rate_bucket=low|mid|high`
 *     against the tenant-median of all visible rates. The prompt instructs
 *     the model NOT to invent €-amounts when buckets are present.
 *
 * Tenant scoping: project's tenant_id resolves all sub-queries; resources
 * and role_rates are tenant-wide (so a swap target may sit outside the
 * project membership — by design, since the PM is reviewing org-wide
 * fit). RLS additionally ensures the caller can read these rows.
 */
export async function collectResourceSwapContext(
  supabase: SupabaseClient,
  projectId: string,
  args: { costClearView: boolean },
): Promise<import("./types").ResourceSwapAutoContext> {
  // 1. Tenant lookup.
  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectError) throw new Error(`projects: ${projectError.message}`)
  if (!projectRow) throw new Error("Project not found.")
  const tenantId = (projectRow as { tenant_id: string }).tenant_id

  // 2. Pre-rank work-items (status ∈ active set, with assignments).
  const ACTIVE_STATUSES = ["in_progress", "review", "todo"] as const
  const { data: workItemRows, error: workItemError } = await supabase
    .from("work_items")
    .select("id, title, kind, status, created_at")
    .eq("project_id", projectId)
    .in("status", [...ACTIVE_STATUSES])
    .order("created_at", { ascending: false })
    .limit(RESOURCE_SWAP_WORK_ITEMS_LIMIT * 2)
  if (workItemError) throw new Error(`work_items: ${workItemError.message}`)
  const workItems = (workItemRows ?? []) as Array<{
    id: string
    title: string
    kind: string
    status: string
    created_at: string
  }>

  // 3. Fetch all work_item_resources for these work_items.
  const workItemIds = workItems.map((w) => w.id)
  const { data: assignmentRows } =
    workItemIds.length === 0
      ? { data: [] as Array<{ work_item_id: string; resource_id: string }> }
      : await supabase
          .from("work_item_resources")
          .select("work_item_id, resource_id")
          .in("work_item_id", workItemIds)
  const assignmentsByWorkItem = new Map<string, string[]>()
  for (const a of (assignmentRows ?? []) as Array<{
    work_item_id: string
    resource_id: string
  }>) {
    const list = assignmentsByWorkItem.get(a.work_item_id) ?? []
    list.push(a.resource_id)
    assignmentsByWorkItem.set(a.work_item_id, list)
  }

  // Drop work-items without assignments — nothing to swap.
  const eligibleWorkItems = workItems
    .filter((w) => (assignmentsByWorkItem.get(w.id)?.length ?? 0) > 0)
    .sort((a, b) => {
      // status priority: in_progress (0) → review (1) → todo (2).
      const order = (s: string) =>
        s === "in_progress" ? 0 : s === "review" ? 1 : 2
      const d = order(a.status) - order(b.status)
      if (d !== 0) return d
      return a.created_at < b.created_at ? 1 : -1
    })
    .slice(0, RESOURCE_SWAP_WORK_ITEMS_LIMIT)

  // 4. Resource pool — tenant-wide active resources.
  const { data: resourceRows, error: resourceError } = await supabase
    .from("resources")
    .select(
      "id, display_name, kind, is_active, daily_rate_override, source_stakeholder_id",
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("display_name", { ascending: true })
    .limit(RESOURCE_SWAP_RAW_CANDIDATE_FETCH_LIMIT)
  if (resourceError) throw new Error(`resources: ${resourceError.message}`)
  const allResources = (resourceRows ?? []) as Array<{
    id: string
    display_name: string
    kind: string
    is_active: boolean
    daily_rate_override: number | null
    source_stakeholder_id: string | null
  }>

  // 5. role_rates for rate resolution. The `resources` row doesn't carry
  //    `role_key` directly — it lives on the linked stakeholder. We fetch
  //    stakeholders for the linked-stakeholder set.
  const stakeholderIds = Array.from(
    new Set(
      allResources
        .map((r) => r.source_stakeholder_id)
        .filter((id): id is string => id !== null),
    ),
  )
  const { data: stakeholderRows } =
    stakeholderIds.length === 0
      ? {
          data: [] as Array<{
            id: string
            name: string
            role_key: string | null
          }>,
        }
      : await supabase
          .from("stakeholders")
          .select("id, name, role_key")
          .in("id", stakeholderIds)
  const stakeholderById = new Map(
    ((stakeholderRows ?? []) as Array<{
      id: string
      name: string
      role_key: string | null
    }>).map((s) => [s.id, s]),
  )

  // 5b. Skill profiles for these stakeholders (PROJ-33-c).
  const { data: skillRows } =
    stakeholderIds.length === 0
      ? { data: [] as SkillProfileRow[] }
      : await supabase
          .from("stakeholder_skill_profiles")
          .select(
            "stakeholder_id, domain_knowledge_fremd, method_competence_fremd, it_affinity_fremd, negotiation_skill_fremd, decision_power_fremd",
          )
          .in("stakeholder_id", stakeholderIds)
  const skillByStakeholder = new Map(
    (skillRows ?? []).map((s) => [s.stakeholder_id, s]),
  )

  // 6. role_rates for the union of role_keys we'll resolve.
  const roleKeys = Array.from(
    new Set(
      Array.from(stakeholderById.values())
        .map((s) => s.role_key)
        .filter((k): k is string => k !== null && k !== ""),
    ),
  )
  const { data: rateRows } =
    roleKeys.length === 0
      ? { data: [] as Array<{ role_key: string; daily_rate: number | null }> }
      : await supabase
          .from("role_rates")
          .select("role_key, daily_rate, valid_from")
          .eq("tenant_id", tenantId)
          .in("role_key", roleKeys)
          .order("valid_from", { ascending: false })
  // Latest valid_from wins for each role_key.
  const roleRateByKey = new Map<string, number>()
  for (const r of (rateRows ?? []) as Array<{
    role_key: string
    daily_rate: number | null
  }>) {
    if (!roleRateByKey.has(r.role_key) && typeof r.daily_rate === "number") {
      roleRateByKey.set(r.role_key, r.daily_rate)
    }
  }

  // 7. Compute tenant-median (only relevant for non-cost-clear-view path).
  const visibleRates: number[] = []
  for (const r of allResources) {
    const s = r.source_stakeholder_id
      ? stakeholderById.get(r.source_stakeholder_id) ?? null
      : null
    const rate = resolveRate(
      { daily_rate_override: r.daily_rate_override, role_key: s?.role_key ?? null },
      roleRateByKey,
    )
    if (rate !== null) visibleRates.push(rate)
  }
  const tenantMedian = median(visibleRates)

  // Helper to materialise a resource ref under either rate-presentation regime.
  const toRef = (
    r: (typeof allResources)[number],
  ): import("./types").ResourceSwapResourceRef => {
    const stakeholder = r.source_stakeholder_id
      ? stakeholderById.get(r.source_stakeholder_id) ?? null
      : null
    const rate = resolveRate(
      {
        daily_rate_override: r.daily_rate_override,
        role_key: stakeholder?.role_key ?? null,
      },
      roleRateByKey,
    )
    const skills = stakeholder
      ? topSkillsFor(skillByStakeholder.get(stakeholder.id))
      : []
    return {
      resource_id: r.id,
      display_name: r.display_name,
      role_key: stakeholder?.role_key ?? null,
      is_active: r.is_active,
      rate_eur: args.costClearView ? rate : null,
      rate_bucket: args.costClearView ? null : bucketRate(rate, tenantMedian),
      stakeholder_name: stakeholder?.name ?? null,
      skills,
    }
  }

  // 8. Candidate pool — top-10 of allResources.
  const candidateResources = allResources
    .slice(0, RESOURCE_SWAP_CANDIDATES_LIMIT)
    .map(toRef)
  const candidatePoolTruncatedBy = Math.max(
    0,
    allResources.length - candidateResources.length,
  )

  // 9. Materialise work-items with their assignees.
  const resourceById = new Map(allResources.map((r) => [r.id, r]))
  const contextWorkItems: import("./types").ResourceSwapWorkItem[] =
    eligibleWorkItems.map((w) => ({
      work_item_id: w.id,
      title: w.title,
      kind: w.kind,
      status: w.status,
      current_assignees: (assignmentsByWorkItem.get(w.id) ?? [])
        .map((rid) => resourceById.get(rid))
        .filter(
          (r): r is (typeof allResources)[number] =>
            r !== undefined && r.is_active,
        )
        .map(toRef),
    }))

  return {
    cost_clear_view: args.costClearView,
    work_items: contextWorkItems,
    candidate_resources: candidateResources,
    candidate_pool_truncated_by: candidatePoolTruncatedBy,
  }
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.γ — cross-project-links context collector
// ---------------------------------------------------------------------------

const CROSS_PROJECT_LINKS_PER_PROJECT_LIMIT = 30
const CROSS_PROJECT_LINKS_RELATED_PROJECTS_LIMIT = 12
const CROSS_PROJECT_LINKS_EXISTING_LINKS_LIMIT = 200

/**
 * Build the Class-2 auto-context for cross-project-link suggestions.
 *
 * Candidate-universe scope:
 *   - source project (the one the user opened the drawer in)
 *   - parent project (via `projects.parent_project_id`) if any
 *   - direct children (projects pointing at source via parent_project_id)
 *   - siblings (projects that share the same parent — only when source has
 *     a parent; otherwise omitted to avoid pulling the entire tenant
 *     portfolio)
 *
 * Allowlist (Class-1/2 only; defense-in-depth at `classify.ts`):
 *   projects:        project_id, name, project_type, project_method,
 *                    lifecycle_status (+ derived `relation`)
 *   work_items:      work_item_id, project_id, title, kind, status
 *                    (is_deleted=false)
 *   work_item_links: from_work_item_id, to_work_item_id, to_project_id,
 *                    link_type, approval_state
 *
 * Stakeholders, descriptions, freetext, audit columns are NOT included.
 *
 * RLS does the heavy lifting: the caller only sees projects they're a
 * member of. The set of `related_projects` we surface here is therefore
 * an intersection of "structurally related via parent_project_id" and
 * "RLS-visible to the caller" — we never leak project IDs the caller
 * has no view-access to.
 */
export async function collectCrossProjectLinksContext(
  supabase: SupabaseClient,
  projectId: string,
): Promise<CrossProjectLinksAutoContext> {
  const sourceRes = await supabase
    .from("projects")
    .select(
      "id, name, project_type, project_method, lifecycle_status, parent_project_id",
    )
    .eq("id", projectId)
    .maybeSingle()
  if (sourceRes.error)
    throw new Error(`projects (source): ${sourceRes.error.message}`)
  if (!sourceRes.data) throw new Error("Project not found.")

  const source = sourceRes.data as {
    id: string
    name: string
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
    parent_project_id: string | null
  }

  // Pull parent + children + siblings via parent_project_id. Two queries
  // because Supabase doesn't compose OR over different equality columns
  // cleanly when one side is null.
  const [parentRes, childrenRes, siblingsRes] = await Promise.all([
    source.parent_project_id
      ? supabase
          .from("projects")
          .select("id, name, project_type, project_method, lifecycle_status")
          .eq("id", source.parent_project_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("projects")
      .select("id, name, project_type, project_method, lifecycle_status")
      .eq("parent_project_id", projectId)
      .limit(CROSS_PROJECT_LINKS_RELATED_PROJECTS_LIMIT),
    source.parent_project_id
      ? supabase
          .from("projects")
          .select("id, name, project_type, project_method, lifecycle_status")
          .eq("parent_project_id", source.parent_project_id)
          .neq("id", projectId)
          .limit(CROSS_PROJECT_LINKS_RELATED_PROJECTS_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (parentRes.error)
    throw new Error(`projects (parent): ${parentRes.error.message}`)
  if (childrenRes.error)
    throw new Error(`projects (children): ${childrenRes.error.message}`)
  if (siblingsRes.error)
    throw new Error(`projects (siblings): ${siblingsRes.error.message}`)

  type ProjectRow = {
    id: string
    name: string
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
  }

  const sourceRef: CrossProjectLinkProjectRef = {
    project_id: source.id,
    name: source.name,
    project_type: source.project_type,
    project_method: source.project_method,
    lifecycle_status: source.lifecycle_status,
    relation: "self",
  }

  const relatedRefs: CrossProjectLinkProjectRef[] = []
  if (parentRes.data) {
    const p = parentRes.data as ProjectRow
    relatedRefs.push({
      project_id: p.id,
      name: p.name,
      project_type: p.project_type,
      project_method: p.project_method,
      lifecycle_status: p.lifecycle_status,
      relation: "parent",
    })
  }
  for (const c of (childrenRes.data ?? []) as ProjectRow[]) {
    relatedRefs.push({
      project_id: c.id,
      name: c.name,
      project_type: c.project_type,
      project_method: c.project_method,
      lifecycle_status: c.lifecycle_status,
      relation: "child",
    })
  }
  for (const s of (siblingsRes.data ?? []) as ProjectRow[]) {
    relatedRefs.push({
      project_id: s.id,
      name: s.name,
      project_type: s.project_type,
      project_method: s.project_method,
      lifecycle_status: s.lifecycle_status,
      relation: "sibling",
    })
  }

  const relatedIds = relatedRefs.map((r) => r.project_id)

  // Pull work-items for source + related projects in two queries (one
  // each so the limits apply per-side rather than as one global cap).
  const [sourceWorkItemsRes, relatedWorkItemsRes] = await Promise.all([
    supabase
      .from("work_items")
      .select("id, project_id, title, kind, status")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(CROSS_PROJECT_LINKS_PER_PROJECT_LIMIT),
    relatedIds.length > 0
      ? supabase
          .from("work_items")
          .select("id, project_id, title, kind, status")
          .in("project_id", relatedIds)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(
            CROSS_PROJECT_LINKS_PER_PROJECT_LIMIT * relatedIds.length,
          )
      : Promise.resolve({ data: [], error: null }),
  ])

  if (sourceWorkItemsRes.error)
    throw new Error(
      `work_items (source): ${sourceWorkItemsRes.error.message}`,
    )
  if (relatedWorkItemsRes.error)
    throw new Error(
      `work_items (related): ${relatedWorkItemsRes.error.message}`,
    )

  type WorkItemRow = {
    id: string
    project_id: string
    title: string
    kind: string
    status: string
  }

  const sourceWorkItems: CrossProjectLinkWorkItemRef[] = (
    (sourceWorkItemsRes.data ?? []) as WorkItemRow[]
  ).map((w) => ({
    work_item_id: w.id,
    project_id: w.project_id,
    title: w.title,
    kind: w.kind,
    status: w.status,
  }))
  const relatedWorkItems: CrossProjectLinkWorkItemRef[] = (
    (relatedWorkItemsRes.data ?? []) as WorkItemRow[]
  ).map((w) => ({
    work_item_id: w.id,
    project_id: w.project_id,
    title: w.title,
    kind: w.kind,
    status: w.status,
  }))

  // Existing links between any of the in-scope work-items — prompt uses
  // them to avoid duplicate suggestions. Scope-filter on the from-side
  // because every link has a from_work_item_id; we keep rows whose to
  // side lands inside the in-scope set OR points at an in-scope project
  // (whole-project `delivers`-links).
  let existingLinks: CrossProjectLinkExistingLink[] = []
  const sourceItemIds = new Set(sourceWorkItems.map((w) => w.work_item_id))
  const relatedItemIds = new Set(relatedWorkItems.map((w) => w.work_item_id))
  const inScopeItemIds = new Set<string>([...sourceItemIds, ...relatedItemIds])
  const inScopeProjectIds = new Set<string>([
    projectId,
    ...relatedIds,
  ])

  if (inScopeItemIds.size > 0) {
    const idsArr = Array.from(inScopeItemIds)
    const linksRes = await supabase
      .from("work_item_links")
      .select(
        "from_work_item_id, to_work_item_id, to_project_id, link_type, approval_state",
      )
      .in("from_work_item_id", idsArr)
      .neq("approval_state", "rejected")
      .limit(CROSS_PROJECT_LINKS_EXISTING_LINKS_LIMIT)
    if (linksRes.error)
      throw new Error(`work_item_links: ${linksRes.error.message}`)
    type LinkRow = {
      from_work_item_id: string
      to_work_item_id: string | null
      to_project_id: string
      link_type: string
      approval_state: string
    }
    existingLinks = ((linksRes.data ?? []) as LinkRow[]).filter((l) => {
      // Keep if to-side is inside the in-scope sets (item or whole-project).
      if (l.to_work_item_id) return inScopeItemIds.has(l.to_work_item_id)
      return inScopeProjectIds.has(l.to_project_id)
    })
  }

  return {
    source_project: sourceRef,
    related_projects: relatedRefs,
    source_work_items: sourceWorkItems,
    related_work_items: relatedWorkItems,
    existing_links: existingLinks,
  }
}

// ---------------------------------------------------------------------------
// PROJ-70-α — proposal_from_context context collector
// ---------------------------------------------------------------------------

/**
 * Normalise `projects.project_method` to one of the supported method-hint
 * tokens. Unknown / NULL methods fall through to `"unspecified"` so the
 * prompt gets a stable shape even when the project hasn't picked a method
 * yet.
 */
function normaliseMethodHint(raw: string | null): ProjectMethodHint {
  if (!raw) return "unspecified"
  const m = raw.toLowerCase()
  if (m.includes("wasserfall") || m.includes("waterfall")) return "waterfall"
  if (m.includes("scrum") || m === "agile") return "scrum"
  if (m.includes("kanban")) return "kanban"
  if (m.includes("hybrid")) return "hybrid"
  return "unspecified"
}

/**
 * Build the auto-context for a proposal-from-context AI run.
 *
 * Reads ONE `context_sources` row (RLS-bounded; the caller's RLS context
 * decides whether the row is visible) + the source project's `project_method`
 * for method-hint passing.
 *
 * Allowlist (Class-1/2 by default; heuristic in `classify.ts` may upgrade
 * the whole run to Class-3 when personal-data markers are detected in the
 * content excerpt):
 *   projects:        project_id, name, project_type, project_method,
 *                    lifecycle_status
 *   context_sources: context_source_id, kind, title, privacy_class,
 *                    content_excerpt, language
 *
 * `source_metadata` is intentionally NOT included — it's a free-shape
 * JSONB that often carries Class-3 markers (email addresses, attendee
 * names) and the model doesn't need it for backlog generation.
 */
export async function collectProposalFromContextAutoContext(
  supabase: SupabaseClient,
  projectId: string,
  contextSourceId: string,
): Promise<ProposalFromContextAutoContext> {
  const [projectRes, contextSourceRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, description, project_type, project_method, lifecycle_status",
      )
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("context_sources")
      .select(
        "id, kind, title, privacy_class, content_excerpt, language, project_id",
      )
      .eq("id", contextSourceId)
      .maybeSingle(),
  ])

  if (projectRes.error)
    throw new Error(`projects: ${projectRes.error.message}`)
  if (contextSourceRes.error)
    throw new Error(`context_sources: ${contextSourceRes.error.message}`)
  if (!projectRes.data) throw new Error("Project not found.")
  if (!contextSourceRes.data) throw new Error("Context source not found.")

  const project = projectRes.data as {
    id: string
    name: string
    description: string | null
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
  }
  const cs = contextSourceRes.data as {
    id: string
    kind: string
    title: string
    privacy_class: number
    content_excerpt: string | null
    language: string | null
    project_id: string | null
  }

  // Scope-check: the context_source MUST belong to this project OR be
  // tenant-wide (project_id IS NULL). Defense-in-depth over RLS; if RLS
  // gave the caller a row from another project, we still reject here.
  if (cs.project_id != null && cs.project_id !== projectId) {
    throw new Error("Context source belongs to a different project.")
  }

  const privacyClass = (cs.privacy_class as 1 | 2 | 3) ?? 3

  return {
    source_project: {
      project_id: project.id,
      name: project.name,
      // PROJ-91 — the wizard "Vorhaben"; grounds the backlog generation so
      // the model can judge each item's relevance to the project goal.
      description: project.description,
      project_type: project.project_type,
      project_method: project.project_method,
      lifecycle_status: project.lifecycle_status,
    },
    context_source: {
      context_source_id: cs.id,
      kind: cs.kind,
      title: cs.title,
      privacy_class: privacyClass,
      content_excerpt: cs.content_excerpt ?? "",
      language: cs.language,
    },
    method_hint: normaliseMethodHint(project.project_method),
  }
}

/**
 * PROJ-88 — auto-context for stakeholder proposals from a kickoff source.
 *
 * Mirrors `collectProposalFromContextAutoContext` (same project + context
 * source reads + project-scope guard) and additionally loads the project's
 * existing stakeholders (id, name, kind, role_key) so the model can propose
 * `duplicate_of_stakeholder_id` instead of duplicate creates (L4).
 *
 * The classification of this purpose does NOT depend on this shape —
 * `classifyStakeholderProposalsAutoContext` pins Class-3 unconditionally.
 */
export async function collectStakeholderProposalsAutoContext(
  supabase: SupabaseClient,
  projectId: string,
  contextSourceId: string,
): Promise<StakeholderProposalsAutoContext> {
  const [projectRes, contextSourceRes, stakeholdersRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, description, project_type, project_method, lifecycle_status",
      )
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("context_sources")
      .select(
        "id, kind, title, privacy_class, content_excerpt, language, project_id",
      )
      .eq("id", contextSourceId)
      .maybeSingle(),
    supabase
      .from("stakeholders")
      .select("id, name, kind, role_key")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(100),
  ])

  if (projectRes.error) throw new Error(`projects: ${projectRes.error.message}`)
  if (contextSourceRes.error)
    throw new Error(`context_sources: ${contextSourceRes.error.message}`)
  if (stakeholdersRes.error)
    throw new Error(`stakeholders: ${stakeholdersRes.error.message}`)
  if (!projectRes.data) throw new Error("Project not found.")
  if (!contextSourceRes.data) throw new Error("Context source not found.")

  const project = projectRes.data as {
    id: string
    name: string
    description: string | null
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
  }
  const cs = contextSourceRes.data as {
    id: string
    kind: string
    title: string
    privacy_class: number
    content_excerpt: string | null
    language: string | null
    project_id: string | null
  }

  // Scope-check mirror of collectProposalFromContextAutoContext: the
  // context_source MUST belong to this project OR be tenant-wide.
  if (cs.project_id != null && cs.project_id !== projectId) {
    throw new Error("Context source belongs to a different project.")
  }

  return {
    source_project: {
      project_id: project.id,
      name: project.name,
      // PROJ-91 track invariant (AC-88.9): relevance yardstick only.
      description: project.description,
      project_type: project.project_type,
      project_method: project.project_method,
      lifecycle_status: project.lifecycle_status,
    },
    context_source: {
      context_source_id: cs.id,
      kind: cs.kind,
      title: cs.title,
      privacy_class: (cs.privacy_class as 1 | 2 | 3) ?? 3,
      content_excerpt: cs.content_excerpt ?? "",
      language: cs.language,
    },
    existing_stakeholders: (
      (stakeholdersRes.data ?? []) as Array<{
        id: string
        name: string
        kind: "person" | "organization"
        role_key: string | null
      }>
    ).map((s) => ({
      stakeholder_id: s.id,
      name: s.name,
      kind: s.kind,
      role_key: s.role_key,
    })),
  }
}
