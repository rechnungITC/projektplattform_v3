/**
 * Method-Config-Registry — the V1 code-based source of truth for the
 * Project Room shell (PROJ-7 Tech Design § 5). Each `ProjectMethod`
 * resolves to a `MethodConfig` here.
 *
 * Add a new method by:
 * 1. Updating the `ProjectMethod` union in `@/types/project-method`.
 * 2. Adding `<method>.ts` exporting a `MethodConfig`.
 * 3. Wiring it up in `METHOD_TEMPLATES` below.
 *
 * Tenant-level overrides (`project_method_configs` table) are deferred
 * to P1 per the V1 decision matrix in the spec.
 */

import type { MethodConfig } from "@/types/method-config"
import type { ProjectMethod } from "@/types/project-method"

import { generalConfig } from "./general"
import { kanbanConfig } from "./kanban"
import { pmiConfig } from "./pmi"
import { safeConfig } from "./safe"
import { scrumConfig } from "./scrum"
import { waterfallConfig } from "./waterfall"

export const METHOD_TEMPLATES: Record<ProjectMethod, MethodConfig> = {
  scrum: scrumConfig,
  kanban: kanbanConfig,
  safe: safeConfig,
  waterfall: waterfallConfig,
  pmi: pmiConfig,
  general: generalConfig,
}

/**
 * Resolves a method to its `MethodConfig`. Defaults to `general` when
 * the method is missing or unknown — keeps behavior stable while the
 * `projects.project_method` column is being rolled out.
 */
export function getMethodConfig(
  method: ProjectMethod | null | undefined
): MethodConfig {
  if (!method) return generalConfig
  return METHOD_TEMPLATES[method] ?? generalConfig
}

export {
  generalConfig,
  kanbanConfig,
  pmiConfig,
  safeConfig,
  scrumConfig,
  waterfallConfig,
}
