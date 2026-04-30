/**
 * PROJ-16 — server helpers + Zod schema for project-type overrides.
 *
 * Overrides are additive deltas on top of the code-defined PROJECT_TYPE_CATALOG.
 * The Zod schema enforces the whitelist (standard_roles + required_info only).
 * Storing an empty `{}` is allowed and equivalent to "no override" — the
 * resolved type uses the catalog defaults.
 */

import { z } from "zod"

import type {
  ProjectTypeOverrideFields,
  ProjectTypeOverrideRow,
} from "@/types/master-data"
import type { ProjectType } from "@/types/project"

import { PROJECT_TYPE_CATALOG } from "./catalog"

const StandardRoleSchema = z.object({
  key: z.string().min(1).max(64),
  label_de: z.string().min(1).max(120),
})

const RequiredInfoSchema = z.object({
  key: z.string().min(1).max(64),
  label_de: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
})

export const ProjectTypeOverrideSchema: z.ZodType<ProjectTypeOverrideFields> =
  z
    .object({
      standard_roles: z.array(StandardRoleSchema).max(50).optional(),
      required_info: z.array(RequiredInfoSchema).max(50).optional(),
      // PROJ-18 ST-05: tenant-additive replacement of platform-default tag keys.
      // Slug shape mirrors `compliance_tags.key` CHECK constraint.
      default_tag_keys: z
        .array(z.string().regex(/^[a-z][a-z0-9-]{1,63}$/))
        .max(20)
        .optional(),
    })
    .strict()

export const VALID_PROJECT_TYPE_KEYS: readonly ProjectType[] = [
  "erp",
  "construction",
  "software",
  "general",
] as const

export function isValidProjectTypeKey(key: string): key is ProjectType {
  return (VALID_PROJECT_TYPE_KEYS as readonly string[]).includes(key)
}

/**
 * Merge a stored override on top of the code-defined catalog entry.
 * Returns the resolved profile that callers should use. Catalog entry
 * is the source of truth for any field NOT in the override.
 */
export function resolveProjectTypeProfile(
  typeKey: ProjectType,
  override: ProjectTypeOverrideFields | null
) {
  const base = PROJECT_TYPE_CATALOG.find((p) => p.key === typeKey)
  if (!base) return null
  if (!override) return base
  return {
    ...base,
    standard_roles: override.standard_roles ?? base.standard_roles,
    required_info: override.required_info ?? base.required_info,
    default_tag_keys: override.default_tag_keys ?? base.default_tag_keys,
  }
}

/** Pure helper: take the raw DB rows and produce a key→row map. */
export function indexOverrides(
  rows: readonly ProjectTypeOverrideRow[]
): Map<ProjectType, ProjectTypeOverrideRow> {
  const map = new Map<ProjectType, ProjectTypeOverrideRow>()
  for (const r of rows) {
    map.set(r.type_key, r)
  }
  return map
}
