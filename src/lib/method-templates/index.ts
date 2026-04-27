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

import type { MethodConfig } from "@/types/method-config"
import type { ProjectMethod } from "@/types/project-method"

import { kanbanConfig } from "./kanban"
import { neutralFallbackConfig } from "./neutral"
import { pmiConfig } from "./pmi"
import { prince2Config } from "./prince2"
import { safeConfig } from "./safe"
import { scrumConfig } from "./scrum"
import { vxt2Config } from "./vxt2"
import { waterfallConfig } from "./waterfall"

export const METHOD_TEMPLATES: Record<ProjectMethod, MethodConfig> = {
  scrum: scrumConfig,
  kanban: kanbanConfig,
  safe: safeConfig,
  waterfall: waterfallConfig,
  pmi: pmiConfig,
  prince2: prince2Config,
  vxt2: vxt2Config,
}

/**
 * Resolves a method to its `MethodConfig`. Returns the neutral fallback
 * config (method: null, label "Methode wählen") when the method is
 * unset or unknown — callers can render the same chrome as for a real
 * method and surface a banner inviting the user to pick one.
 */
export function getMethodConfig(
  method: ProjectMethod | null | undefined
): MethodConfig {
  if (!method) return neutralFallbackConfig
  return METHOD_TEMPLATES[method] ?? neutralFallbackConfig
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
