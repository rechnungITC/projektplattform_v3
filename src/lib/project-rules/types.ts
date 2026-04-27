/**
 * Rule engine output (PROJ-6) — what `(type, method)` derives.
 */

import type { ProjectModule, RequiredInfo, StandardRole } from "@/lib/project-types/catalog"
import type { WorkItemKind } from "@/types/work-item"

export interface ProjectRules {
  active_modules: readonly ProjectModule[]
  suggested_roles: readonly StandardRole[]
  required_info: readonly RequiredInfo[]
  /**
   * Empty when the project has no method chosen yet — the user should
   * pick a method before the system suggests a starter structure.
   */
  starter_kinds: readonly WorkItemKind[]
}
