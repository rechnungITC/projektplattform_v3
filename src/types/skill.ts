/**
 * PROJ-76 — Skill-Framework Foundation.
 *
 * A "Skill" is a tenant-managed, reusable agent-behaviour definition.
 * Authoring is form-first: the structured metadata (this shape + the
 * per-version `frontmatter` JSON) is the source of truth; the canonical
 * `.md` string is generated on demand (see `lib/skills/serialize.ts`),
 * never parsed back. See ADRs skills-data-model.md + skill-versioning.md.
 */

export type SkillCategory = "method" | "project_type" | "cross_cutting"

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  "method",
  "project_type",
  "cross_cutting",
] as const

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  method: "Methode",
  project_type: "Projekttyp",
  cross_cutting: "Übergreifend",
}

export type SkillVersionStatus = "draft" | "active" | "archived"

/**
 * The optional behaviour keys stored per version (immutable content).
 * `name` + `description` are NOT here — they live on the mutable skill
 * and are merged in at serialise time so a rename never leaves the
 * active version's `.md` stale.
 */
export interface SkillFrontmatter {
  model_overrides?: Record<string, string> | null
  temperature?: number | null
  allowed_kinds?: string[] | null
  tone?: string | null
}

export interface Skill {
  id: string
  tenant_id: string
  name: string
  slug: string
  description: string
  category: SkillCategory
  method_tags: string[]
  project_type_tags: string[]
  is_active: boolean
  current_version_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SkillVersion {
  id: string
  skill_id: string
  tenant_id: string
  version_number: number
  markdown_content: string
  frontmatter: SkillFrontmatter
  change_summary: string | null
  status: SkillVersionStatus
  created_by: string | null
  created_at: string
}

export const SKILL_SELECT =
  "id, tenant_id, name, slug, description, category, method_tags, project_type_tags, is_active, current_version_id, created_by, created_at, updated_at"

export const SKILL_VERSION_SELECT =
  "id, skill_id, tenant_id, version_number, markdown_content, frontmatter, change_summary, status, created_by, created_at"
