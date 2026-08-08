/**
 * Method-Config-Registry — code-based source of truth for the Project
 * Room shell rendering per method (PROJ-7 + PROJ-6). Each `ProjectMethod`
 * resolves to a `MethodConfig` here. When `projects.project_method` is
 * NULL ("noch nicht festgelegt"), `getMethodConfig(null)` returns null
 * and the shell falls back to a neutral layout + banner.
 *
 * Add a new method by:
 * 1. Updating the `ProjectMethod` union in `@/types/project-method`.
 * 2. Adding `<method>.ts` exporting a `MethodConfig`.
 * 3. Wiring it up in `METHOD_TEMPLATES` below.
 *
 * Tenant-level overrides land with PROJ-16.
 */

import {
  BarChart3,
  ClipboardCheck,
  FileText,
  Flag,
  FolderTree,
  Gauge,
  Handshake,
  Layers,
  LineChart,
  ListChecks,
  MessagesSquare,
  Microscope,
  Network,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react"

import type { MethodConfig, SidebarSection } from "@/types/method-config"
import type { ProjectMethod } from "@/types/project-method"

import { kanbanConfig } from "./kanban"
import { neutralFallbackConfig } from "./neutral"
import { pmiConfig } from "./pmi"
import { prince2Config } from "./prince2"
import { safeConfig } from "./safe"
import { scrumConfig } from "./scrum"
import { vxt2Config } from "./vxt2"
import { waterfallConfig } from "./waterfall"

/**
 * PROJ-94 — the "Strategische Grundlage" section is project-TYPE driven, not
 * method driven: it must appear for every M&A project regardless of method.
 * Rather than duplicating it into all 8 method templates, it is injected once
 * here (after Übersicht) into every config and gated by `requiresProjectType`.
 * The renderers (project-sidebar, project-room-shell) drop it for non-M&A
 * projects via `filterSectionsByProjectType`. Routing helpers resolve it
 * through `getMethodConfig`, so the slug + active-state work in every method.
 */
const MA_FOUNDATION_SECTION: SidebarSection = {
  id: "ma-foundation",
  label: "Strategische Grundlage",
  icon: Handshake,
  tabPath: "strategische-grundlage",
  requiresProjectType: "ma",
}

// PROJ-99/128/129 — the "Governance & Zugriff" section (external advisors, NDA
// register, need-to-know classification matrix + PROJ-100b clearance management)
// is project-TYPE driven (M&A need-to-know) and is injected right after the
// foundation section, gated the same way. The route stays `vertraulichkeit` for
// back-compat; the section grew from the PROJ-100b clearance-only surface into
// the full governance bundle.
const MA_CONFIDENTIALITY_SECTION: SidebarSection = {
  id: "ma-confidentiality",
  label: "Governance & Zugriff",
  icon: ShieldCheck,
  tabPath: "vertraulichkeit",
  requiresProjectType: "ma",
}

// PROJ-95 — the M&A "Phasenmodell" cockpit (10-phase roadmap, activation,
// mandate/stage-gate status). Project-TYPE driven, same injection pattern.
const MA_PHASE_MODEL_SECTION: SidebarSection = {
  id: "ma-phase-model",
  label: "Phasenmodell",
  icon: Workflow,
  tabPath: "phasenmodell",
  requiresProjectType: "ma",
}

// PROJ-97 — "Rollen & RACI": M&A professional roles responsibility view (97a)
// + RACI matrix editor per work item (97b). Project-TYPE driven.
const MA_ROLES_SECTION: SidebarSection = {
  id: "ma-roles",
  label: "Rollen & RACI",
  icon: Network,
  tabPath: "rollen",
  requiresProjectType: "ma",
}

// PROJ-101 — the "Aufgaben" section (operative M&A tasks = work_items kind='task'
// with Verantwortlicher, Frist, Phase, Status + Workstream-Tag). Project-TYPE
// driven (M&A), injected after Rollen & RACI (tasks carry RACI).
const MA_TASKS_SECTION: SidebarSection = {
  id: "ma-tasks",
  label: "Aufgaben",
  icon: ListChecks,
  tabPath: "aufgaben",
  requiresProjectType: "ma",
}

// PROJ-102 — the "Workstreams" section (per-project steering units grouping tasks
// + risks, with RAG status + phase spans + dashboard). Project-TYPE driven (M&A),
// injected right after Aufgaben (both Epic C).
const MA_WORKSTREAMS_SECTION: SidebarSection = {
  id: "ma-workstreams",
  label: "Workstreams",
  icon: Layers,
  tabPath: "workstreams",
  requiresProjectType: "ma",
}

// PROJ-104 — the "Deliverables" section (deliverable catalogue per phase +
// workstream, status lifecycle, doc-links, RACI, Ampel). Project-TYPE driven
// (M&A), injected after Workstreams.
const MA_DELIVERABLES_SECTION: SidebarSection = {
  id: "ma-deliverables",
  label: "Deliverables",
  icon: ClipboardCheck,
  tabPath: "deliverables",
  requiresProjectType: "ma",
}

// PROJ-109 — the "Maßnahmen" section: read-only measures overview per risk /
// risk-owner / workstream (measure = work_item linked to a risk via risk_links),
// with a soft coverage hint for active-but-uncovered risks. Project-TYPE driven
// (M&A), injected after Deliverables (Epic E, risk-adjacent).
const MA_MEASURES_SECTION: SidebarSection = {
  id: "ma-measures",
  label: "Maßnahmen",
  icon: ShieldAlert,
  tabPath: "massnahmen",
  requiresProjectType: "ma",
}

// PROJ-103 — the "Engpässe" section: project-wide, cross-workstream view of all
// open tasks with days-overdue + Top-3 bottlenecks + quick filters + CSV export.
// Read-only aggregation (INVOKER RPC); need-to-know inherits via work_items.
// Project-TYPE driven (M&A); injected right after Workstreams (Epic C).
const MA_BOTTLENECKS_SECTION: SidebarSection = {
  id: "ma-bottlenecks",
  label: "Engpässe",
  icon: Gauge,
  tabPath: "engpaesse",
  requiresProjectType: "ma",
}

// PROJ-112 — the "Due Diligence" section (DD-stream backbone: per-stream status,
// lead, time window, confidentiality). Also project-TYPE driven (M&A) and
// injected right after Governance, gated the same way.
const MA_DUE_DILIGENCE_SECTION: SidebarSection = {
  id: "ma-due-diligence",
  label: "Due Diligence",
  icon: Microscope,
  tabPath: "due-diligence",
  requiresProjectType: "ma",
}

// PROJ-116 — the "DD-Bericht" section: consolidated, live DD report (per-stream
// summary + cross-stream red-flag list) with print-to-PDF export. Read-only and
// need-to-know-scoped server-side; injected right after Due Diligence.
const MA_DD_REPORT_SECTION: SidebarSection = {
  id: "ma-dd-report",
  label: "DD-Bericht",
  icon: FileText,
  tabPath: "dd-bericht",
  requiresProjectType: "ma",
}

// PROJ-110 — the "Stage-Gates" section: the 9 M&A stage gates that authorize
// phase transitions. Each gate has a pre-read (open tasks / risks-without-
// measure / open red-flags) and a 3-way decision (Freigabe / Auflage / Abbruch)
// that writes an immutable PROJ-20 decision and drives the phase/project state
// machine. Project-TYPE driven (M&A); need-to-know-scoped server-side.
const MA_STAGE_GATES_SECTION: SidebarSection = {
  id: "ma-stage-gates",
  label: "Stage-Gates",
  icon: Flag,
  tabPath: "stage-gates",
  requiresProjectType: "ma",
}

// PROJ-98 — the "Gremien" section: governance bodies (SteerCo / Core Team / IMO)
// per project with stakeholder-centric membership + decision competence.
// Project-TYPE driven (M&A); need-to-know-scoped server-side.
const MA_GREMIEN_SECTION: SidebarSection = {
  id: "ma-gremien",
  label: "Gremien",
  icon: Users,
  tabPath: "gremien",
  requiresProjectType: "ma",
}

// PROJ-118 — the "Kommunikationsmatrix" section: the M&A communication planning
// matrix (target groups × messages × channels × dates) with a single-approver
// workflow (submit → approve/reject → mark sent) and need-to-know
// confidentiality. Project-TYPE driven (M&A); injected after Gremien (Epic H).
// NOTE: label + route are deliberately "Kommunikationsmatrix" / route
// `kommunikationsmatrix` — the plain `kommunikation` slug + "Kommunikation"
// label are already taken by the PROJ-13 Communication Center (outbox/chat),
// which is module-gated and orthogonal to this M&A governance planning layer.
const MA_KOMMUNIKATION_SECTION: SidebarSection = {
  id: "ma-kommunikation",
  label: "Kommunikationsmatrix",
  icon: MessagesSquare,
  tabPath: "kommunikationsmatrix",
  requiresProjectType: "ma",
}

// PROJ-79-α — the "Dokumente" section: project document tree (folders +
// uploads + quota). CORE for ALL project types (no `requiresProjectType`
// gate), so it is injected here once (like the M&A sections) rather than in
// each of the 8 method templates. Placed right after Übersicht.
const DMS_DOCUMENTS_SECTION: SidebarSection = {
  id: "dms-documents",
  label: "Dokumente",
  icon: FolderTree,
  tabPath: "dokumente",
}

// PROJ-78 — the "Projekt-Skills" section: the skill set assigned to this
// project (auto-resolved from method + project type + cross-cutting, plus
// manual additions). CORE for ALL project types (no `requiresProjectType`
// gate), so it is injected here once next to the Dokumente section.
// The label is deliberately "Projekt-Skills": the plain "Skills" label is
// already taken by the tenant-wide catalog in the main navigation.
const PROJECT_SKILLS_SECTION: SidebarSection = {
  id: "project-skills",
  label: "Projekt-Skills",
  icon: Sparkles,
  tabPath: "skills",
}

// PROJ-132 — the "Operatives Reporting" section: weekly-steering operative
// bundle (overdue tasks / open findings by severity / Q&A status / deliverable
// status) with filters + CSV/PDF export. Project-TYPE driven (M&A); read-only
// and need-to-know-scoped server-side. Injected right after DD-Bericht (Epic M).
const MA_OPERATIVE_REPORT_SECTION: SidebarSection = {
  id: "ma-operative-report",
  label: "Operatives Reporting",
  icon: BarChart3,
  tabPath: "operatives-reporting",
  requiresProjectType: "ma",
}

// PROJ-131 — the "Steering-Dashboard" section: management/steering-level bundle
// (deal status + next stage gate + top red flags [DD-findings + high risks] +
// critical open tasks + steering pre-read) with CSV/PDF export + drill-down.
// Project-TYPE driven (M&A); read-only and need-to-know-scoped server-side.
// Injected right after Operatives Reporting (Epic M). Kaufpreis/Synergie are
// shown as "not-yet-available" placeholders until PROJ-120/121/126 (PROJ-Y-131a).
const MA_STEERING_REPORT_SECTION: SidebarSection = {
  id: "ma-steering-report",
  label: "Steering-Dashboard",
  icon: LineChart,
  tabPath: "management-reporting",
  requiresProjectType: "ma",
}

function withMaFoundation(config: MethodConfig): MethodConfig {
  const sections = config.sidebarSections
  // Insert right after the leading "overview" section (index 0) when present.
  const insertAt = sections[0]?.id === "overview" ? 1 : 0
  return {
    ...config,
    sidebarSections: [
      ...sections.slice(0, insertAt),
      DMS_DOCUMENTS_SECTION,
      PROJECT_SKILLS_SECTION,
      MA_FOUNDATION_SECTION,
      MA_PHASE_MODEL_SECTION,
      MA_STAGE_GATES_SECTION,
      MA_ROLES_SECTION,
      MA_GREMIEN_SECTION,
      MA_KOMMUNIKATION_SECTION,
      MA_TASKS_SECTION,
      MA_WORKSTREAMS_SECTION,
      MA_BOTTLENECKS_SECTION,
      MA_DELIVERABLES_SECTION,
      MA_MEASURES_SECTION,
      MA_CONFIDENTIALITY_SECTION,
      MA_DUE_DILIGENCE_SECTION,
      MA_DD_REPORT_SECTION,
      MA_OPERATIVE_REPORT_SECTION,
      MA_STEERING_REPORT_SECTION,
      ...sections.slice(insertAt),
    ],
  }
}

export const METHOD_TEMPLATES: Record<ProjectMethod, MethodConfig> = {
  scrum: withMaFoundation(scrumConfig),
  kanban: withMaFoundation(kanbanConfig),
  safe: withMaFoundation(safeConfig),
  waterfall: withMaFoundation(waterfallConfig),
  pmi: withMaFoundation(pmiConfig),
  prince2: withMaFoundation(prince2Config),
  vxt2: withMaFoundation(vxt2Config),
}

const neutralWithMaFoundation: MethodConfig =
  withMaFoundation(neutralFallbackConfig)

/**
 * Resolves a method to its `MethodConfig`. Returns the neutral fallback
 * config (method: null, label "Methode wählen") when the method is
 * unset or unknown — callers can render the same chrome as for a real
 * method and surface a banner inviting the user to pick one.
 */
export function getMethodConfig(
  method: ProjectMethod | null | undefined
): MethodConfig {
  if (!method) return neutralWithMaFoundation
  return METHOD_TEMPLATES[method] ?? neutralWithMaFoundation
}

export {
  kanbanConfig,
  neutralFallbackConfig,
  pmiConfig,
  prince2Config,
  safeConfig,
  scrumConfig,
  vxt2Config,
  waterfallConfig,
}
