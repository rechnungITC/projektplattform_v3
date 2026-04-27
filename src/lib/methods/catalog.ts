/**
 * Method catalog (PROJ-6) — single source of truth for method labels,
 * descriptions, and leading planning objects. Wraps the constants in
 * `src/types/project-method.ts` into one structured catalog used by the
 * `/api/project-types/[type]/rules` endpoint and the rule engine.
 *
 * The catalog is global (platform-wide). Tenant-level overrides are out
 * of scope for PROJ-6 and tracked under PROJ-16.
 */

import {
  PROJECT_METHODS,
  PROJECT_METHOD_DESCRIPTIONS,
  PROJECT_METHOD_LABELS,
  PROJECT_METHOD_LEAD_OBJECTS,
  type ProjectMethod,
} from "@/types/project-method"

export interface MethodProfile {
  key: ProjectMethod
  label_de: string
  description_de: string
  lead_objects: string[]
}

const PROFILES: Record<ProjectMethod, MethodProfile> = Object.fromEntries(
  PROJECT_METHODS.map((key) => [
    key,
    {
      key,
      label_de: PROJECT_METHOD_LABELS[key],
      description_de: PROJECT_METHOD_DESCRIPTIONS[key],
      lead_objects: PROJECT_METHOD_LEAD_OBJECTS[key],
    },
  ])
) as Record<ProjectMethod, MethodProfile>

export const METHOD_CATALOG: readonly MethodProfile[] = PROJECT_METHODS.map(
  (key) => PROFILES[key]
)

export function getMethodProfile(method: ProjectMethod): MethodProfile {
  return PROFILES[method]
}
