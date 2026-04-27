/**
 * MethodConfig — the per-method blueprint that drives the Project Room
 * shell (PROJ-7 Tech Design § 5). Each `ProjectMethod` resolves to a
 * `MethodConfig` via the code-registry in `@/lib/method-templates/`.
 *
 * Adding a new method: create `<method>.ts` in `lib/method-templates/`,
 * add it to the registry's `METHOD_TEMPLATES` record, and update the
 * `ProjectMethod` union in `@/types/project-method`.
 */

import type { LucideIcon } from "lucide-react"

import type { ProjectMethod } from "@/types/project-method"
import type { WorkItemKind } from "@/types/work-item"

/**
 * A single sidebar nav entry. The `tabPath` is appended to
 * `/projects/[id]` — pass an empty string for the Übersicht tab so it
 * resolves to the bare project page.
 */
export interface SidebarSection {
  /** Stable id used for `key` and active-link lookups. */
  id: string
  label: string
  /** Icon component from `lucide-react`. */
  icon: LucideIcon
  /**
   * The path appended after `/projects/[id]`. Use `""` for the bare
   * Übersicht route.
   */
  tabPath: string
  /** Optional pill text rendered to the right of the label. */
  badge?: string
}

/**
 * What sits in the top header above the tab content area.
 * - `sprint-selector` — Scrum: pick a sprint + actions.
 * - `phase-bar` — PMI / Waterfall: horizontal phase timeline.
 * - `simple` — Kanban / general: project name + status.
 */
export type TopHeaderMode = "sprint-selector" | "phase-bar" | "simple"

/**
 * Default center-content view for the method. The Backlog tab uses
 * `'board'` for Scrum, `'list'` for Waterfall/PMI etc. Routes that
 * don't honor this fall back to their own defaults.
 */
export type DefaultCenterView = "board" | "list" | "gantt" | "wbs"

export interface MethodConfig {
  /** The method this config describes. */
  method: ProjectMethod
  /** Human-readable label, e.g. "Scrum". */
  label: string
  /** Top header mode (Sprint-Selector / Phase-Bar / simple). */
  topHeaderMode: TopHeaderMode
  /** Sidebar sections in render order. */
  sidebarSections: SidebarSection[]
  /** Default view for the center area (Backlog primarily). */
  defaultCenterView: DefaultCenterView
  hasSprints: boolean
  hasPhases: boolean
  hasDependencies: boolean
  /**
   * Kinds the AI may propose for this method (Tech Design § 6).
   * Bug is always allowed across methods (cross-method by spec).
   */
  allowedAiKinds: WorkItemKind[]
  /**
   * Kinds to which stakeholders may be attached. Per Tech Design § 6:
   * Scrum → stories/tasks; PMI/Waterfall → work_packages/milestones.
   */
  stakeholderAttachableKinds: WorkItemKind[]
  /** Kinds visible in the Backlog/Tree views — derived from
   * `WORK_ITEM_METHOD_VISIBILITY` in `@/types/work-item`. */
  workItemKindsVisible: WorkItemKind[]
  /**
   * Method-specific rituals / ceremonies — rendered in the Übersicht
   * tab as a small reminder card.
   */
  ritualsLabel: string
}
