import type { SupabaseClient } from "@supabase/supabase-js"

import { getProjectSectionHref } from "@/lib/method-templates/routing"
import { isProjectEditAllowed } from "@/lib/projects/access"
import {
  PROJECT_METHOD_LABELS,
  PROJECT_METHODS,
  type ProjectMethod,
} from "@/types/project-method"
import { PROJECT_TYPES, type ProjectType } from "@/types/project"
import type { ModuleKey } from "@/types/tenant-settings"
import { WORK_ITEM_KIND_LABELS, type WorkItemKind } from "@/types/work-item"

import {
  ASSISTANT_SETTINGS_DEFAULTS,
  normalizeAssistantSettings,
  type AssistantSettings,
} from "./settings"
import { transcriptForPersistence } from "./transcript"
import {
  parseWorkItemCommand,
  resolveTargetKind,
  type WorkItemCommand,
} from "./work-item-command"
import type {
  AssistantIntent,
  AssistantProjectChoice,
  AssistantRuntimeResult,
  AssistantToolCall,
  AssistantWorkItemDraftRef,
} from "./types"

interface AssistantRuntimeArgs {
  supabase: SupabaseClient
  tenantId: string
  userId: string
  inputText: string
  modality: "text" | "voice"
  projectId?: string | null
  clientContextPath?: string | null
}

interface ClassifiedIntent {
  intent: AssistantIntent
  area: ProjectArea | null
  projectQuery: string | null
  draft: DraftExtraction | null
  /** PROJ-144 — gefüllt, wenn der Satz ein Work-Item anlegen will. */
  workItem?: WorkItemCommand | null
}

interface DraftExtraction {
  name: string | null
  description: string
  project_type: ProjectType | null
  project_method: ProjectMethod | null
}

type ProjectArea =
  | "overview"
  | "backlog"
  | "risks"
  | "decisions"
  | "reports"
  | "stakeholders"

interface ProjectRow {
  id: string
  tenant_id: string
  name: string
  description: string | null
  lifecycle_status: string
  project_type: ProjectType
  project_method: ProjectMethod | null
  planned_start_date: string | null
  planned_end_date: string | null
  is_deleted: boolean
}

const AREA_CONFIG: Record<
  ProjectArea,
  { label: string; sectionId: string; module?: ModuleKey }
> = {
  overview: { label: "Projektübersicht", sectionId: "overview" },
  backlog: { label: "Backlog", sectionId: "backlog" },
  risks: { label: "Risiken", sectionId: "risks", module: "risks" },
  decisions: {
    label: "Entscheidungen",
    sectionId: "decisions",
    module: "decisions",
  },
  reports: {
    label: "Reports",
    sectionId: "reports",
    module: "output_rendering",
  },
  stakeholders: { label: "Stakeholder", sectionId: "stakeholders" },
}

const GENERIC_RESPONSE =
  "Ich konnte daraus noch keinen sicheren Assistant-Auftrag ableiten. Formuliere bitte als Statusfrage, Navigation, Projekt öffnen oder Projektentwurf."

export function classifyAssistantIntent(input: string): ClassifiedIntent {
  const text = normalizeText(input)
  const area = detectArea(text)

  // PROJ-144 — vor der Projektanlage geprüft, weil „Erstelle eine Story im
  // Projekt X" beide Muster streift. `parseWorkItemCommand` tritt seinerseits
  // zurück, wenn `projekt` das Objekt der Erzeugung ist (AC-144.31).
  // Absichtlich auf dem Originaltext: der Titel soll seine Schreibweise behalten.
  const workItem = parseWorkItemCommand(input)
  if (workItem) {
    return {
      intent: "work_item_create_draft",
      area: null,
      projectQuery: workItem.projectQuery,
      draft: null,
      workItem,
    }
  }

  if (isCreateDraftIntent(text)) {
    return {
      intent: "project_create_draft",
      area: null,
      projectQuery: null,
      draft: extractDraft(input),
    }
  }

  if (isStrongNavigationIntent(text)) {
    return {
      intent: "navigate_to_area",
      area: area ?? "overview",
      projectQuery: extractProjectQuery(text),
      draft: null,
    }
  }

  if (isReportIntent(text)) {
    return {
      intent: "report_summary_query",
      area: "reports",
      projectQuery: extractProjectQuery(text),
      draft: null,
    }
  }

  if (isStatusIntent(text)) {
    return {
      intent: "project_status_query",
      area,
      projectQuery: extractProjectQuery(text),
      draft: null,
    }
  }

  if (isNavigationIntent(text)) {
    return {
      intent: "navigate_to_area",
      area: area ?? "overview",
      projectQuery: extractProjectQuery(text),
      draft: null,
    }
  }

  if (isOpenIntent(text)) {
    return {
      intent: "project_open",
      area: "overview",
      projectQuery: extractProjectQuery(text),
      draft: null,
    }
  }

  return {
    intent: "unknown",
    area: null,
    projectQuery: null,
    draft: null,
  }
}

export async function handleAssistantTurn(
  args: AssistantRuntimeArgs,
): Promise<AssistantRuntimeResult> {
  const input = args.inputText.trim()
  if (!input) {
    return result({
      intent: "needs_clarification",
      status: "needs_clarification",
      response: "Bitte gib eine Frage oder einen Auftrag ein.",
      projectId: args.projectId ?? null,
    })
  }

  const settings = await loadAssistantSettings(args.supabase, args.tenantId)
  const classified = classifyAssistantIntent(input)

  if (classified.intent === "unknown") {
    return result({
      intent: "unknown",
      status: "needs_clarification",
      response: GENERIC_RESPONSE,
      projectId: args.projectId ?? null,
      settings,
    })
  }

  if (classified.intent === "project_create_draft") {
    return createWizardDraft(args, classified.draft, settings)
  }

  if (classified.intent === "work_item_create_draft" && classified.workItem) {
    return createWorkItemDraft(args, classified.workItem, settings)
  }

  const projectResolution = await resolveProject(args, classified.projectQuery)
  if (projectResolution.status !== "resolved") {
    return result({
      intent: classified.intent,
      status: "needs_clarification",
      response: projectResolution.response,
      projectId: null,
      choices: projectResolution.choices,
      toolCalls: projectResolution.toolCalls,
      settings,
    })
  }

  if (
    classified.intent === "navigate_to_area" ||
    classified.intent === "project_open" ||
    classified.intent === "report_summary_query"
  ) {
    return navigationResult(args, classified, projectResolution.project, settings)
  }

  return statusResult(args, projectResolution.project, settings)
}

async function loadAssistantSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AssistantSettings> {
  const { data } = await supabase
    .from("tenant_settings")
    .select("assistant_settings")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  return normalizeAssistantSettings(
    (data as { assistant_settings?: unknown } | null)?.assistant_settings ??
      ASSISTANT_SETTINGS_DEFAULTS,
  )
}

async function createWizardDraft(
  args: AssistantRuntimeArgs,
  draft: DraftExtraction | null,
  settings: AssistantSettings,
): Promise<AssistantRuntimeResult> {
  const name = draft?.name?.trim() || "Neuer Projektentwurf"
  const data = {
    name,
    description: draft?.description ?? "",
    project_number: "",
    planned_start_date: null,
    planned_end_date: null,
    responsible_user_id: args.userId,
    project_type: draft?.project_type ?? null,
    project_method: draft?.project_method ?? null,
    type_specific_data: {},
  }

  const { data: row, error } = await args.supabase
    .from("project_wizard_drafts")
    .insert({
      tenant_id: args.tenantId,
      created_by: args.userId,
      name,
      project_type: data.project_type,
      project_method: data.project_method,
      data,
    })
    .select("id, name")
    .single()

  const toolCalls: AssistantToolCall[] = [
    {
      key: "wizard_draft.create",
      label: "Wizard-Entwurf anlegen",
      status: error ? "failed" : "executed",
      metadata: { project_type: data.project_type, project_method: data.project_method },
    },
  ]

  if (error || !row) {
    return result({
      intent: "project_create_draft",
      status: "failed",
      response:
        error?.message ?? "Der Projektentwurf konnte nicht angelegt werden.",
      projectId: null,
      toolCalls,
      settings,
    })
  }

  const id = (row as { id: string }).id
  const draftName = (row as { name: string | null }).name
  return result({
    intent: "project_create_draft",
    status: "success",
    response:
      "Ich habe einen Wizard-Entwurf vorbereitet. Bitte prüfe die Angaben im Wizard, bevor das Projekt final angelegt wird.",
    projectId: null,
    toolCalls,
    settings,
    wizardDraft: {
      id,
      name: draftName,
      href: `/projects/new/wizard?draftId=${encodeURIComponent(id)}`,
    },
    routeTarget: {
      href: `/projects/new/wizard?draftId=${encodeURIComponent(id)}`,
      label: "Entwurf prüfen",
    },
  })
}

/**
 * PROJ-144 — Schritt 1 des Zwei-Schritt-Flusses: aus dem Sprachbefehl wird ein
 * gespeicherter Entwurf. Es entsteht hier bewusst KEIN Work-Item; das passiert
 * erst über `POST /api/assistant/work-item-drafts/[id]/confirm` (AC-144.15/16).
 */
async function createWorkItemDraft(
  args: AssistantRuntimeArgs,
  command: WorkItemCommand,
  settings: AssistantSettings,
): Promise<AssistantRuntimeResult> {
  const requestedLabel = WORK_ITEM_KIND_LABELS[command.requestedKind]

  // Nur die Art genannt, kein Inhalt → Rückfrage statt geratener Titel.
  if (!command.title) {
    return result({
      intent: "work_item_create_draft",
      status: "needs_clarification",
      response: `Wie soll die Position heißen? Zum Beispiel: „Neue ${requestedLabel}: Rechnungsimport testen".`,
      projectId: args.projectId ?? null,
      settings,
      requiresConfirmation: false,
    })
  }

  // Ein gesprochener Projektname schlägt den Kontext (AC-144.12). Ohne Namen
  // gilt das offene Projekt (AC-144.11); ohne beides wird gefragt (AC-144.13).
  const scopeArgs = command.projectQuery
    ? { ...args, projectId: null }
    : args
  const projectResolution = await resolveProject(scopeArgs, command.projectQuery)
  if (projectResolution.status !== "resolved") {
    return result({
      intent: "work_item_create_draft",
      status: "needs_clarification",
      response: projectResolution.response,
      projectId: null,
      choices: projectResolution.choices,
      toolCalls: projectResolution.toolCalls,
      settings,
      requiresConfirmation: false,
    })
  }

  const project = projectResolution.project

  // Schreibrecht schon jetzt prüfen (D6) — sonst bekäme ein Nutzer mit
  // Leserechten eine Prüfansicht, die beim Bestätigen scheitert.
  const mayEdit = await hasProjectEditAccess(args, project)
  if (!mayEdit) {
    return result({
      intent: "work_item_create_draft",
      status: "blocked",
      response: `In „${project.name}" hast du nur Leserechte — dort kann ich nichts anlegen.`,
      projectId: project.id,
      settings,
      requiresConfirmation: false,
      toolCalls: [
        {
          key: "work_item_draft.create",
          label: "Sprach-Entwurf anlegen",
          status: "blocked",
          metadata: { reason: "missing_edit_right" },
        },
      ],
    })
  }

  // Zielart aus der Projektmethode ableiten (L1/D4).
  const kindResolution = resolveTargetKind(
    command.requestedKind,
    project.project_method,
  )
  if (kindResolution.status === "not_creatable") {
    const response =
      kindResolution.reason === "requires_parent"
        ? `Eine ${requestedLabel} braucht ein übergeordnetes Element. Das kann ich per Sprache noch nicht zuordnen — bitte im Backlog anlegen.`
        : `In „${project.name}" gibt es keine passende Position auf oberster Ebene für „${requestedLabel}".`
    return result({
      intent: "work_item_create_draft",
      status: "needs_clarification",
      response,
      projectId: project.id,
      settings,
      requiresConfirmation: false,
      toolCalls: [
        {
          key: "work_item_draft.create",
          label: "Sprach-Entwurf anlegen",
          status: "blocked",
          metadata: { reason: kindResolution.reason },
        },
      ],
    })
  }

  const targetKind = kindResolution.kind
  const targetLabel = WORK_ITEM_KIND_LABELS[targetKind]

  const transcriptPersistence =
    settings.transcript_retention_mode === "no_persist"
      ? "none"
      : settings.transcript_retention_mode === "persist_redacted_transcript"
        ? "redacted"
        : "metadata"

  const { data: row, error } = await args.supabase
    .from("assistant_work_item_drafts")
    .insert({
      tenant_id: args.tenantId,
      user_id: args.userId,
      project_id: project.id,
      requested_kind: command.requestedKind,
      target_kind: targetKind,
      title: command.title,
      description: command.description,
      // Rohtranskript nur im Rahmen der Mandanten-Regel (AC-144.26); der Titel
      // selbst ist gewollter Geschäftsinhalt und wird immer gespeichert.
      source_transcript: transcriptForPersistence(
        args.inputText,
        transcriptPersistence,
      ),
      source_modality: args.modality,
    })
    .select("id, title, description, target_kind, requested_kind")
    .single()

  const toolCalls: AssistantToolCall[] = [
    {
      key: "work_item_draft.create",
      label: "Sprach-Entwurf anlegen",
      status: error ? "failed" : "executed",
      metadata: {
        draft_id: (row as { id?: string } | null)?.id ?? null,
        requested_kind: command.requestedKind,
        target_kind: targetKind,
        kind_was_mapped: kindResolution.mapped,
      },
    },
  ]

  if (error || !row) {
    return result({
      intent: "work_item_create_draft",
      status: "failed",
      response:
        error?.message ?? "Der Entwurf konnte nicht vorbereitet werden.",
      projectId: project.id,
      settings,
      toolCalls,
      requiresConfirmation: false,
    })
  }

  const draft = row as {
    id: string
    title: string
    description: string | null
    target_kind: string
    requested_kind: string | null
  }

  // Weicht die Art von der gesagten ab, wird das ausdrücklich benannt (AC-144.8).
  const methodLabel = project.project_method
    ? PROJECT_METHOD_LABELS[project.project_method]
    : null
  const response = kindResolution.mapped
    ? `Dieses Projekt läuft nach ${methodLabel} — dort gibt es keine ${requestedLabel}. Ich habe ein ${targetLabel} „${draft.title}" vorbereitet. Bitte prüfen und bestätigen.`
    : `Ich habe ${articleFor(targetLabel)} ${targetLabel} „${draft.title}" für „${project.name}" vorbereitet. Bitte prüfen und bestätigen.`

  const workItemDraft: AssistantWorkItemDraftRef = {
    id: draft.id,
    title: draft.title,
    description: draft.description,
    target_kind: draft.target_kind,
    requested_kind: draft.requested_kind,
    kind_was_mapped: kindResolution.mapped,
    project_id: project.id,
    project_name: project.name,
  }

  return result({
    intent: "work_item_create_draft",
    status: "success",
    response,
    projectId: project.id,
    settings,
    toolCalls,
    workItemDraft,
    requiresConfirmation: true,
  })
}

/**
 * Darf der Aufrufer in diesem Projekt fachlich schreiben? Die Rollenregel liegt
 * in `@/lib/projects/access` und ist damit dieselbe, die `requireProjectAccess`
 * auf der API-Ebene anwendet.
 */
async function hasProjectEditAccess(
  args: AssistantRuntimeArgs,
  project: ProjectRow,
): Promise<boolean> {
  const [tenantRes, projectRes] = await Promise.all([
    args.supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", project.tenant_id)
      .eq("user_id", args.userId)
      .maybeSingle(),
    args.supabase
      .from("project_memberships")
      .select("role")
      .eq("project_id", project.id)
      .eq("user_id", args.userId)
      .maybeSingle(),
  ])

  const tenantRole = (tenantRes.data as { role?: string } | null)?.role ?? null
  const projectRole = (projectRes.data as { role?: string } | null)?.role ?? null
  return isProjectEditAllowed(tenantRole, projectRole)
}

/** „ein Arbeitspaket" vs. „eine Story" — reine Textkosmetik der Antwort. */
function articleFor(label: string): string {
  return /^(Story|Aufgabe|Unteraufgabe|Teilaufgabe)$/.test(label)
    ? "eine"
    : "ein"
}

async function statusResult(
  args: AssistantRuntimeArgs,
  project: ProjectRow,
  settings: AssistantSettings,
): Promise<AssistantRuntimeResult> {
  const [risksRes, decisionsRes, milestonesRes, snapshotRes] =
    await Promise.all([
      args.supabase
        .from("risks")
        .select("title, score, status")
        .eq("project_id", project.id)
        .order("score", { ascending: false })
        .limit(3),
      args.supabase
        .from("decisions")
        .select("title, decided_at, is_revised")
        .eq("project_id", project.id)
        .eq("is_revised", false)
        .order("decided_at", { ascending: false })
        .limit(3),
      args.supabase
        .from("milestones")
        .select("name, target_date, status, is_deleted")
        .eq("project_id", project.id)
        .eq("is_deleted", false)
        .order("target_date", { ascending: true })
        .limit(3),
      args.supabase
        .from("report_snapshots")
        .select("id, kind, version, generated_at")
        .eq("project_id", project.id)
        .order("generated_at", { ascending: false })
        .limit(1),
    ])

  const risks = ((risksRes.data ?? []) as Array<{
    title: string
    score: number
    status: string
  }>).filter((risk) => risk.status !== "closed")
  const decisions = (decisionsRes.data ?? []) as Array<{
    title: string
    decided_at: string
  }>
  const milestones = (milestonesRes.data ?? []) as Array<{
    name: string
    target_date: string
    status: string
  }>
  const snapshot = ((snapshotRes.data ?? []) as Array<{
    kind: string
    version: number
    generated_at: string
  }>)[0]

  const riskLine = risks.length
    ? `Top-Risiken: ${risks.map((r) => `${r.title} (${r.score})`).join(", ")}.`
    : "Aktuell sind keine offenen Top-Risiken sichtbar."
  const decisionLine = decisions.length
    ? `Letzte Entscheidungen: ${decisions.map((d) => d.title).join(", ")}.`
    : "Es sind keine aktiven Entscheidungen sichtbar."
  const milestoneLine = milestones.length
    ? `Nächste Meilensteine: ${milestones
        .map((m) => `${m.name} (${m.target_date})`)
        .join(", ")}.`
    : "Es sind keine kommenden Meilensteine sichtbar."
  const sourceLine = snapshot
    ? `Datenbasis: Live-Daten plus letzter ${snapshot.kind}-Snapshot v${snapshot.version}.`
    : "Datenbasis: Live-Projektdaten; kein Snapshot gefunden."

  return result({
    intent: "project_status_query",
    status:
      risksRes.error || decisionsRes.error || milestonesRes.error
        ? "failed"
        : "success",
    response: `${project.name}: Status ${project.lifecycle_status}. ${riskLine} ${decisionLine} ${milestoneLine} ${sourceLine}`,
    projectId: project.id,
    settings,
    routeTarget: {
      href: `/projects/${project.id}`,
      label: "Projekt öffnen",
    },
    toolCalls: [
      { key: "projects.read", label: "Projekt lesen", status: "executed" },
      { key: "risks.read", label: "Risiken lesen", status: risksRes.error ? "failed" : "executed" },
      { key: "decisions.read", label: "Entscheidungen lesen", status: decisionsRes.error ? "failed" : "executed" },
      { key: "milestones.read", label: "Meilensteine lesen", status: milestonesRes.error ? "failed" : "executed" },
      { key: "report_snapshots.read", label: "Snapshot prüfen", status: snapshotRes.error ? "failed" : "executed" },
    ],
  })
}

async function navigationResult(
  args: AssistantRuntimeArgs,
  classified: ClassifiedIntent,
  project: ProjectRow,
  settings: AssistantSettings,
): Promise<AssistantRuntimeResult> {
  const area = classified.area ?? "overview"
  const areaConfig = AREA_CONFIG[area]
  const moduleBlocked = areaConfig.module
    ? await isModuleDisabled(args.supabase, args.tenantId, areaConfig.module)
    : false

  if (moduleBlocked) {
    return result({
      intent: classified.intent,
      status: "blocked",
      response: `${areaConfig.label} ist fuer diesen Workspace deaktiviert.`,
      projectId: project.id,
      settings,
      toolCalls: [
        {
          key: "module_gate",
          label: `${areaConfig.label} Modul-Gate`,
          status: "blocked",
          metadata: { module: areaConfig.module },
        },
      ],
    })
  }

  const href = getProjectSectionHref(
    project.id,
    areaConfig.sectionId,
    project.project_method,
  )
  const label =
    classified.intent === "project_open"
      ? "Projekt öffnen"
      : `${areaConfig.label} öffnen`

  return result({
    intent: classified.intent,
    status: "success",
    response:
      classified.intent === "report_summary_query"
        ? `Ich öffne die Report-Sicht für ${project.name}.`
        : `Ich öffne ${areaConfig.label} für ${project.name}.`,
    projectId: project.id,
    settings,
    routeTarget: { href, label },
    toolCalls: [
      {
        key: "navigation.resolve",
        label: "Route auflösen",
        status: "executed",
        metadata: { area, method: project.project_method },
      },
    ],
  })
}

async function isModuleDisabled(
  supabase: SupabaseClient,
  tenantId: string,
  module: ModuleKey,
): Promise<boolean> {
  const { data } = await supabase
    .from("tenant_settings")
    .select("active_modules")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  const modules = (data as { active_modules?: string[] } | null)
    ?.active_modules
  return Array.isArray(modules) ? !modules.includes(module) : false
}

async function resolveProject(
  args: AssistantRuntimeArgs,
  query: string | null,
): Promise<
  | { status: "resolved"; project: ProjectRow }
  | {
      status: "needs_clarification"
      response: string
      choices: AssistantProjectChoice[]
      toolCalls: AssistantToolCall[]
    }
> {
  if (args.projectId) {
    const { data, error } = await args.supabase
      .from("projects")
      .select(
        "id, tenant_id, name, description, lifecycle_status, project_type, project_method, planned_start_date, planned_end_date, is_deleted",
      )
      .eq("id", args.projectId)
      .eq("tenant_id", args.tenantId)
      .eq("is_deleted", false)
      .maybeSingle()
    if (!error && data) {
      return { status: "resolved", project: data as ProjectRow }
    }
  }

  if (!query || query.trim().length < 2) {
    return {
      status: "needs_clarification",
      response: "Welches Projekt meinst du?",
      choices: [],
      toolCalls: [
        {
          key: "project.resolve",
          label: "Projektkontext auflösen",
          status: "planned",
        },
      ],
    }
  }

  const pattern = `%${query.trim().replace(/[%_\\]/g, "\\$&")}%`
  const { data, error } = await args.supabase
    .from("projects")
    .select(
      "id, tenant_id, name, description, lifecycle_status, project_type, project_method, planned_start_date, planned_end_date, is_deleted",
    )
    .eq("tenant_id", args.tenantId)
    .eq("is_deleted", false)
    .ilike("name", pattern)
    .order("updated_at", { ascending: false })
    .limit(6)

  if (error) {
    return {
      status: "needs_clarification",
      response: "Ich konnte die Projektsuche nicht ausführen.",
      choices: [],
      toolCalls: [
        {
          key: "project.search",
          label: "Projekt suchen",
          status: "failed",
          metadata: { error: error.message },
        },
      ],
    }
  }

  const rows = (data ?? []) as ProjectRow[]
  if (rows.length === 1) return { status: "resolved", project: rows[0]! }
  if (rows.length > 1) {
    return {
      status: "needs_clarification",
      response: "Ich habe mehrere passende Projekte gefunden. Bitte wähle eines davon.",
      choices: rows.map((row) => ({
        id: row.id,
        name: row.name,
        lifecycle_status: row.lifecycle_status,
      })),
      toolCalls: [
        {
          key: "project.search",
          label: "Projekt suchen",
          status: "executed",
          metadata: { matches: rows.length },
        },
      ],
    }
  }

  return {
    status: "needs_clarification",
    response: "Ich habe kein sichtbares Projekt mit diesem Namen gefunden.",
    choices: [],
    toolCalls: [
      {
        key: "project.search",
        label: "Projekt suchen",
        status: "executed",
        metadata: { matches: 0 },
      },
    ],
  }
}

function result(args: {
  intent: AssistantIntent
  status: AssistantRuntimeResult["result_status"]
  response: string
  projectId: string | null
  settings?: AssistantSettings
  routeTarget?: AssistantRuntimeResult["route_target"]
  choices?: AssistantProjectChoice[]
  wizardDraft?: AssistantRuntimeResult["wizard_draft"]
  workItemDraft?: AssistantRuntimeResult["work_item_draft"]
  toolCalls?: AssistantToolCall[]
  /**
   * PROJ-144 — bis dahin war die Bestätigungs-Meldung fest an den einen
   * Projektanlage-Intent gebunden. Ohne Angabe gilt genau dieses alte
   * Verhalten weiter (AC-144.30/144.31); die neuen Pfade setzen den Wert
   * ausdrücklich, weil ein Klärungs- oder Sperr-Ergebnis desselben Intents
   * gerade KEINE Bestätigung erwartet.
   */
  requiresConfirmation?: boolean
}): AssistantRuntimeResult {
  const settings = args.settings ?? ASSISTANT_SETTINGS_DEFAULTS
  const requiresConfirmation =
    args.requiresConfirmation ?? args.intent === "project_create_draft"
  return {
    recognized_intent: args.intent,
    requires_confirmation: requiresConfirmation,
    confirmation_state: requiresConfirmation ? "required" : "not_required",
    result_status: args.status,
    user_response: args.response,
    project_id: args.projectId,
    route_target: args.routeTarget ?? null,
    project_choices: args.choices ?? [],
    wizard_draft: args.wizardDraft ?? null,
    work_item_draft: args.workItemDraft ?? null,
    tool_calls: args.toolCalls ?? [],
    transcript_persistence:
      settings.transcript_retention_mode === "no_persist"
        ? "none"
        : settings.transcript_retention_mode === "persist_redacted_transcript"
          ? "redacted"
          : "metadata",
  }
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isCreateDraftIntent(text: string): boolean {
  return (
    /\b(erstelle|erzeuge|lege|mach|create)\b/.test(text) &&
    /\b(projekt|project)\b/.test(text)
  )
}

function isStatusIntent(text: string): boolean {
  return /\b(status|stand|lage|gesundheit|health|risiken|entscheidungen|meilenstein|milestone)\b/.test(
    text,
  )
}

function isReportIntent(text: string): boolean {
  return /\b(report|statusreport|summary|zusammenfassung|executive)\b/.test(
    text,
  )
}

function isNavigationIntent(text: string): boolean {
  return /\b(offne|oeffne|zeige|geh|gehe|navigiere|springe)\b/.test(text)
}

function isStrongNavigationIntent(text: string): boolean {
  return /\b(geh|gehe|navigiere|springe)\b/.test(text)
}

function isOpenIntent(text: string): boolean {
  return /\b(offne|oeffne|open)\b/.test(text) && /\b(projekt|project)\b/.test(text)
}

function detectArea(text: string): ProjectArea | null {
  if (/\b(risiko|risiken|risk|risks)\b/.test(text)) return "risks"
  if (/\b(entscheidung|entscheidungen|decision|decisions)\b/.test(text)) {
    return "decisions"
  }
  if (/\b(report|reports|snapshot|summary|zusammenfassung)\b/.test(text)) {
    return "reports"
  }
  if (/\b(stakeholder|beteiligte|ansprechpartner)\b/.test(text)) {
    return "stakeholders"
  }
  if (/\b(backlog|arbeitspaket|arbeitspakete|tasks?|stories)\b/.test(text)) {
    return "backlog"
  }
  if (/\b(ubersicht|uebersicht|overview|projekt)\b/.test(text)) {
    return "overview"
  }
  return null
}

function extractProjectQuery(text: string): string | null {
  const withoutIntent = text
    .replace(/\b(wie ist|was ist|aktueller|aktuelle|status|stand|lage|zu|zum|zur|vom|von|projekt|project|offne|oeffne|zeige|geh|gehe|navigiere|springe|risiken|entscheidungen|report|reports|snapshot|summary|zusammenfassung|ubersicht|uebersicht|backlog|stakeholder)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (withoutIntent.length >= 2) return withoutIntent
  return null
}

function extractDraft(input: string): DraftExtraction {
  const normalized = normalizeText(input)
  const type = detectProjectType(normalized)
  const method = detectProjectMethod(normalized)
  const name = extractDraftName(input)
  return {
    name,
    description: input.trim(),
    project_type: type,
    project_method: method,
  }
}

function detectProjectType(text: string): ProjectType | null {
  if (/\b(erp|sap)\b/.test(text)) return "erp"
  if (/\b(bau|construction|baustelle)\b/.test(text)) return "construction"
  if (/\b(software|app|portal|system)\b/.test(text)) return "software"
  if (PROJECT_TYPES.includes(text as ProjectType)) return text as ProjectType
  return null
}

function detectProjectMethod(text: string): ProjectMethod | null {
  for (const method of PROJECT_METHODS) {
    if (text.includes(method)) return method
  }
  if (text.includes("wasserfall")) return "waterfall"
  return null
}

function extractDraftName(input: string): string | null {
  const match =
    input.match(/(?:namens|name|thema|für|fuer)\s+["“]?([^".,;]+)["”]?/i) ??
    input.match(/projekt\s+["“]?([^".,;]+)["”]?/i)
  const name = match?.[1]?.trim()
  if (!name) return null
  return name.replace(/\s+(als|mit|nach|und)\s+.*$/i, "").trim().slice(0, 255)
}
