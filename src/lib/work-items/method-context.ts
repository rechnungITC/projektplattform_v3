/**
 * Method context helpers — wraps the kind-filtering logic so PROJ-7
 * can flip the source from a hardcoded `'general'` to the project's
 * actual method when `projects.project_method` ships.
 *
 * PROJ-7 pending: read `project.project_method` from the project row.
 * For now, default to `'general'` which allows all kinds.
 */

import {
  WORK_ITEM_KINDS,
  WORK_ITEM_METHOD_VISIBILITY,
  type WorkItemKind,
} from "@/types/work-item"
import type { ProjectMethod } from "@/types/project-method"

/**
 * Returns the current project method.
 *
 * Until PROJ-7 ships, this always returns `'general'` so every kind is
 * visible. The signature accepts an optional override that PROJ-7 can
 * pipe in once the column exists; today the override is unused.
 */
export function getCurrentMethod(override?: ProjectMethod | null): ProjectMethod {
  // PROJ-7 pending: read project.project_method from the project row.
  // For now, default to 'general' which allows all kinds.
  if (override) return override
  return "general"
}

/**
 * Returns the kinds creatable in the given method, in the canonical
 * `WORK_ITEM_KINDS` order. Bug is always included (cross-method per
 * V2 EP-07-ST-04).
 */
export function kindsForMethod(method: ProjectMethod): WorkItemKind[] {
  return WORK_ITEM_KINDS.filter((kind) =>
    WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)
  )
}

/**
 * True when the given kind is creatable in the given method.
 */
export function isKindCreatable(
  kind: WorkItemKind,
  method: ProjectMethod
): boolean {
  return WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)
}
