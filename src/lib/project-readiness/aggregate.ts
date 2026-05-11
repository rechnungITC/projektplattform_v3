/**
 * PROJ-56 — Project Readiness aggregator.
 *
 * Pulls minimal counts per readiness category in parallel and
 * applies pure rules to produce a {@link ProjectReadinessSnapshot}.
 * Mirrors the design of PROJ-64's dashboard aggregator: section-
 * level error tolerance, no per-record fan-out, no expensive
 * recompute.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { getProjectSectionHref } from "@/lib/method-templates/routing"
import { resolveProjectParticipantLinks } from "@/lib/participant-links/aggregate"
import { isModuleActive } from "@/lib/tenant-settings/modules"
import type { LifecycleStatus } from "@/types/project"
import type { ProjectMethod } from "@/types/project-method"
import type { TenantSettings } from "@/types/tenant-settings"

import type {
  ProjectReadinessSnapshot,
  ReadinessItem,
  ReadinessNextAction,
  ReadinessSeverity,
  ReadinessState,
} from "./types"

interface ResolveReadinessArgs {
  supabase: SupabaseClient
  projectId: string
  tenantId: string
  /** Optional override for "now" — tests pass a fixed timestamp. */
  now?: Date
}

interface ProjectRow {
  id: string
  name: string
  description: string | null
  project_method: ProjectMethod | null
  lifecycle_status: LifecycleStatus
  planned_start_date: string | null
  planned_end_date: string | null
  responsible_user_id: string | null
}

/**
 * Returns the readiness snapshot, never throws. Failed inner
 * queries fall back to "open" items so the dashboard never shows
 * a misleading green state.
 */
export async function resolveProjectReadiness(
  args: ResolveReadinessArgs,
): Promise<ProjectReadinessSnapshot> {
  const now = args.now ?? new Date()

  const [
    projectRes,
    settingsRes,
    membersCount,
    phasesCount,
    sprintsCount,
    stakeholdersCount,
    stakeholdersAssessedCount,
    risksCount,
    budgetItemsCount,
    snapshotsCount,
  ] = await Promise.all([
    args.supabase
      .from("projects")
      .select(
        "id, name, description, project_method, lifecycle_status, planned_start_date, planned_end_date, responsible_user_id",
      )
      .eq("id", args.projectId)
      .maybeSingle(),
    args.supabase
      .from("tenant_settings")
      .select(
        "active_modules, privacy_defaults, ai_provider_config, retention_overrides, budget_settings, output_rendering_settings, cost_settings, risk_score_overrides",
      )
      .eq("tenant_id", args.tenantId)
      .maybeSingle(),
    countTable(args.supabase, "project_memberships", "project_id", args.projectId),
    countTable(args.supabase, "phases", "project_id", args.projectId, {
      extraEq: { col: "is_deleted", value: false },
    }),
    countTable(args.supabase, "sprints", "project_id", args.projectId),
    countActiveStakeholders(args.supabase, args.projectId),
    countAssessedStakeholders(args.supabase, args.projectId),
    countTable(args.supabase, "risks", "project_id", args.projectId),
    countTable(args.supabase, "budget_items", "project_id", args.projectId, {
      extraEq: { col: "is_active", value: true },
    }),
    countTable(args.supabase, "report_snapshots", "project_id", args.projectId),
  ])

  const project = (projectRes.data ?? null) as ProjectRow | null
  const settings = (settingsRes.data ?? null) as TenantSettings | null

  const items: ReadinessItem[] = []

  if (!project) {
    // Project couldn't be loaded (RLS, deleted, etc.) — return a
    // single blocker. Callers shouldn't reach this path because
    // the route resolves the project first.
    return {
      project_id: args.projectId,
      generated_at: now.toISOString(),
      state: "not_ready",
      items: [
        {
          key: "project_goal",
          status: "open",
          severity: "blocker",
          label: "Projekt nicht zugänglich",
          explanation:
            "Das Projekt konnte nicht geladen werden. Prüfen Sie Zugriffsrechte und versuchen Sie es erneut.",
          target_url: `/projects/${args.projectId}`,
        },
      ],
      next_actions: [],
      counts: {
        open_blockers: 1,
        open_warnings: 0,
        satisfied: 0,
        not_applicable: 0,
      },
    }
  }

  const method = project.project_method
  const href = (section: string) =>
    getProjectSectionHref(args.projectId, section, method)

  // --- 1. Projektziel / Beschreibung ---
  items.push({
    key: "project_goal",
    status: (project.description ?? "").trim().length > 0 ? "satisfied" : "open",
    severity: "warning",
    label: "Projektziel / Beschreibung",
    explanation:
      (project.description ?? "").trim().length > 0
        ? "Projektziel vorhanden."
        : "Tragen Sie eine Projektbeschreibung ein, damit alle Beteiligten den Kontext verstehen.",
    target_url: href("settings"),
  })

  // --- 2. Projektmethode ---
  items.push({
    key: "project_method",
    status: method ? "satisfied" : "open",
    severity: "blocker",
    label: "Projektmethode festgelegt",
    explanation: method
      ? `Methode: ${method}.`
      : "Wählen Sie eine Methode (Scrum, Waterfall, …), damit Sidebar, Backlog und Reports korrekt strukturiert werden.",
    target_url: href("settings"),
  })

  // --- 3. Geplante Termine ---
  items.push({
    key: "planned_dates",
    status:
      project.planned_start_date && project.planned_end_date ? "satisfied" : "open",
    severity: "warning",
    label: "Geplanter Start- und Endtermin",
    explanation:
      project.planned_start_date && project.planned_end_date
        ? `Geplant ${formatDate(project.planned_start_date)} – ${formatDate(project.planned_end_date)}.`
        : "Setzen Sie Start- und Endtermin, damit Health, Reports und Gantt funktionieren.",
    target_url: href("settings"),
  })

  // --- 4. Schedule-Einheiten (Phasen ODER Sprints, je Methode) ---
  items.push(scheduleReadinessItem(method, phasesCount, sprintsCount, href))

  // --- 5. Projektleitung ---
  items.push({
    key: "responsible_user",
    status: project.responsible_user_id ? "satisfied" : "open",
    severity: "blocker",
    label: "Projektleitung / verantwortliche Person",
    explanation: project.responsible_user_id
      ? "Verantwortliche Person ist gesetzt."
      : "Tragen Sie eine verantwortliche Person ein, damit Eskalationen einen Ansprechpartner haben.",
    target_url: href("members"),
  })

  // --- 6. Mindestens ein Projektmitglied (zusätzlich zum Lead) ---
  items.push({
    key: "team_members",
    status: membersCount > 0 ? "satisfied" : "open",
    severity: "warning",
    label: "Projektmitglieder erfasst",
    explanation:
      membersCount > 0
        ? `${membersCount} Mitglied${membersCount === 1 ? "" : "er"} im Projekt.`
        : "Fügen Sie Projektmitglieder hinzu, damit Zugriffe und Zuweisungen funktionieren.",
    target_url: href("members"),
  })

  // --- 7. Stakeholder erfasst ---
  items.push({
    key: "stakeholders_captured",
    status: stakeholdersCount > 0 ? "satisfied" : "open",
    severity: "warning",
    label: "Stakeholder erfasst",
    explanation:
      stakeholdersCount > 0
        ? `${stakeholdersCount} aktive Stakeholder.`
        : "Erfassen Sie Stakeholder, damit Kommunikation und Approvals zugeordnet werden können.",
    target_url: href("stakeholder"),
  })

  // --- 8. Stakeholder bewertet (Einfluss/Impact) ---
  items.push({
    key: "stakeholders_assessed",
    status:
      stakeholdersCount === 0
        ? "not_applicable"
        : stakeholdersAssessedCount > 0
          ? "satisfied"
          : "open",
    severity: "info",
    label: "Stakeholder nach Einfluss/Impact bewertet",
    explanation:
      stakeholdersCount === 0
        ? "Erst nach Stakeholder-Erfassung relevant."
        : stakeholdersAssessedCount > 0
          ? `${stakeholdersAssessedCount} Stakeholder mit Einfluss/Impact bewertet.`
          : "Ergänzen Sie Einfluss und Impact, damit der Stakeholder-Health-Score eine Aussage liefert.",
    target_url: href("stakeholder-health"),
  })

  // --- 9. Budget geplant (modulgated) ---
  const budgetActive = settings ? isModuleActive(settings, "budget") : true
  items.push({
    key: "budget_planned",
    status: !budgetActive
      ? "not_applicable"
      : budgetItemsCount > 0
        ? "satisfied"
        : "open",
    severity: "warning",
    label: "Budget geplant",
    explanation: !budgetActive
      ? "Budgetmodul für diesen Tenant deaktiviert."
      : budgetItemsCount > 0
        ? `${budgetItemsCount} Budget-Positionen aktiv.`
        : "Tragen Sie Budget-Positionen ein, damit der Health-Score eine Budget-Aussage hat.",
    target_url: href("budget"),
  })

  // --- 10. Risiken erfasst ---
  const risksActive = settings ? isModuleActive(settings, "risks") : true
  items.push({
    key: "risks_captured",
    status: !risksActive
      ? "not_applicable"
      : risksCount > 0
        ? "satisfied"
        : "open",
    severity: "info",
    label: "Risiken erfasst",
    explanation: !risksActive
      ? "Risiko-Modul für diesen Tenant deaktiviert."
      : risksCount > 0
        ? `${risksCount} Risiken im Register.`
        : "Erfassen Sie Risiken oder bestätigen Sie explizit, dass keine bekannt sind, damit das Risikoprofil nicht stillschweigend grün bleibt.",
    target_url: href("risks"),
  })

  // --- 11. Reporting (modulgated) ---
  const reportsActive = settings ? isModuleActive(settings, "output_rendering") : true
  items.push({
    key: "report_snapshot_created",
    status: !reportsActive
      ? "not_applicable"
      : snapshotsCount > 0
        ? "satisfied"
        : "open",
    severity: "info",
    label: "Mindestens ein Status-Report erzeugt",
    explanation: !reportsActive
      ? "Reporting-Modul für diesen Tenant deaktiviert."
      : snapshotsCount > 0
        ? `${snapshotsCount} Snapshot${snapshotsCount === 1 ? "" : "s"} erzeugt.`
        : "Erzeugen Sie einen Status-Report oder eine Executive-Summary, damit Steering-Kommunikation funktioniert.",
    target_url: href("overview"),
  })

  // --- 12. Participant links (PROJ-57-ε integration) ---
  // Reuses the participant-links aggregator: warnings >= 1
  // indicate unresolved tenant↔stakeholder↔resource gaps that
  // shake confidence in cost rollups and stakeholder routing.
  let participantWarnings = 0
  try {
    const links = await resolveProjectParticipantLinks({
      supabase: args.supabase,
      projectId: args.projectId,
      tenantId: args.tenantId,
      now,
    })
    participantWarnings = links.counts.with_warnings
  } catch {
    // Soft-fail: treat as 0 warnings, but mark the item as
    // unknown rather than satisfied.
    participantWarnings = -1
  }
  items.push({
    key: "participant_links_clean",
    status:
      participantWarnings === -1
        ? "open"
        : participantWarnings === 0
          ? "satisfied"
          : "open",
    severity: "info",
    label: "Verknüpfungen sauber",
    explanation:
      participantWarnings === -1
        ? "Beteiligten-Verknüpfungen konnten nicht ausgewertet werden."
        : participantWarnings === 0
          ? "Keine offenen Verknüpfungs-Warnungen zwischen Tenant / Projekt / Stakeholder / Resource."
          : `${participantWarnings} Personen mit fehlenden Verknüpfungen (Stakeholder ohne Mitgliedschaft, Resource ohne Stakeholder etc.).`,
    target_url: href("members"),
  })

  // --- Derive aggregate state + next actions ---
  const openBlockers = items.filter(
    (i) => i.status === "open" && i.severity === "blocker",
  ).length
  const openWarnings = items.filter(
    (i) => i.status === "open" && i.severity === "warning",
  ).length
  const openInfos = items.filter(
    (i) => i.status === "open" && i.severity === "info",
  ).length
  const satisfied = items.filter((i) => i.status === "satisfied").length
  const notApplicable = items.filter((i) => i.status === "not_applicable").length

  const state: ReadinessState =
    openBlockers > 0
      ? "not_ready"
      : openWarnings > 0 || openInfos > 0
        ? "ready_with_gaps"
        : "ready"

  // Top-3 next actions, sorted by severity weight.
  const severityWeight = (s: ReadinessSeverity): number =>
    s === "blocker" ? 3 : s === "warning" ? 2 : 1
  const next_actions: ReadinessNextAction[] = items
    .filter((i) => i.status === "open")
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 3)
    .map((i) => ({
      label: i.label,
      description: i.explanation,
      severity: i.severity,
      target_url: i.target_url,
    }))

  return {
    project_id: args.projectId,
    generated_at: now.toISOString(),
    state,
    items,
    next_actions,
    counts: {
      open_blockers: openBlockers,
      open_warnings: openWarnings,
      satisfied,
      not_applicable: notApplicable,
    },
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scheduleReadinessItem(
  method: ProjectMethod | null,
  phases: number,
  sprints: number,
  href: (section: string) => string,
): ReadinessItem {
  // Method-aware: Scrum/SAFe → sprints required; Waterfall/PMI/Prince2/Vxt2
  // → phases required; Kanban/null → either OR work items.
  const requiresSprints =
    method === "scrum" || method === "safe"
  const requiresPhases =
    method === "waterfall" || method === "pmi" || method === "prince2" || method === "vxt2"

  if (requiresSprints) {
    return {
      key: "schedule_units",
      status: sprints > 0 ? "satisfied" : "open",
      severity: "warning",
      label: "Sprints angelegt",
      explanation:
        sprints > 0
          ? `${sprints} Sprint${sprints === 1 ? "" : "s"} angelegt.`
          : "Diese Methode arbeitet mit Sprints. Legen Sie mindestens einen Sprint an, damit das Backlog steuerbar wird.",
      target_url: href("backlog"),
    }
  }
  if (requiresPhases) {
    return {
      key: "schedule_units",
      status: phases > 0 ? "satisfied" : "open",
      severity: "warning",
      label: "Phasen angelegt",
      explanation:
        phases > 0
          ? `${phases} Phase${phases === 1 ? "" : "n"} angelegt.`
          : "Diese Methode arbeitet mit Phasen. Legen Sie mindestens eine Phase an, damit Termine, Reports und Gantt sinnvoll sind.",
      target_url: href("phases"),
    }
  }
  // Kanban or no method — either schedule unit OK; "info" not warning.
  const total = phases + sprints
  return {
    key: "schedule_units",
    status: total > 0 ? "satisfied" : "not_applicable",
    severity: "info",
    label: "Strukturierung (optional)",
    explanation:
      total > 0
        ? "Strukturierung vorhanden."
        : "Diese Methode benötigt keine festen Strukturen — Sie können später Phasen oder Sprints ergänzen.",
    target_url: href("planning"),
  }
}

async function countTable(
  supabase: SupabaseClient,
  table: string,
  filterCol: string,
  filterValue: string,
  options?: { extraEq?: { col: string; value: unknown } },
): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(filterCol, filterValue)
  if (options?.extraEq) {
    query = query.eq(options.extraEq.col, options.extraEq.value)
  }
  const { count, error } = await query
  if (error) return 0
  return count ?? 0
}

async function countActiveStakeholders(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { count } = await supabase
    .from("stakeholders")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_active", true)
  return count ?? 0
}

async function countAssessedStakeholders(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { count } = await supabase
    .from("stakeholders")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_active", true)
    .not("influence", "is", null)
    .not("impact", "is", null)
  return count ?? 0
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE")
  } catch {
    return iso
  }
}
