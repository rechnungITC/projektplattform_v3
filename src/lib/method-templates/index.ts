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

import { Handshake, ShieldCheck } from "lucide-react"

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

function withMaFoundation(config: MethodConfig): MethodConfig {
  const sections = config.sidebarSections
  // Insert right after the leading "overview" section (index 0) when present.
  const insertAt = sections[0]?.id === "overview" ? 1 : 0
  return {
    ...config,
    sidebarSections: [
      ...sections.slice(0, insertAt),
      MA_FOUNDATION_SECTION,
      MA_CONFIDENTIALITY_SECTION,
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
