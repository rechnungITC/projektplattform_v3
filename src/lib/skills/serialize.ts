import yaml from "js-yaml"

import type { Skill, SkillFrontmatter, SkillVersion } from "@/types/skill"

/**
 * PROJ-76 — serialise the structured source of truth into the canonical
 * `.md` representation (YAML frontmatter + Markdown body).
 *
 * This is generation-only: the JSON metadata is authoritative and is
 * NEVER parsed back (see ADR skills-data-model.md). Uses `js-yaml.dump`
 * (server-side) for escaping-correct YAML — we deliberately avoid a
 * frontmatter-parser dependency (`gray-matter`).
 *
 * `name` + `description` come from the (mutable) skill so a rename is
 * reflected immediately; the behaviour keys come from the (immutable)
 * version's `frontmatter`.
 */
export function serializeSkillMarkdown(
  skill: Pick<Skill, "name" | "description">,
  version: Pick<SkillVersion, "frontmatter" | "markdown_content">
): string {
  const fm: Record<string, unknown> = {
    name: skill.name,
    description: skill.description ?? "",
  }

  const b: SkillFrontmatter = version.frontmatter ?? {}
  if (b.model_overrides != null && Object.keys(b.model_overrides).length > 0) {
    fm.model_overrides = b.model_overrides
  }
  if (b.temperature != null) fm.temperature = b.temperature
  if (b.allowed_kinds != null && b.allowed_kinds.length > 0) {
    fm.allowed_kinds = b.allowed_kinds
  }
  if (b.tone != null && b.tone !== "") fm.tone = b.tone

  const frontmatter = yaml
    .dump(fm, { lineWidth: -1, noRefs: true, sortKeys: false })
    .trimEnd()

  const body = version.markdown_content ?? ""
  return `---\n${frontmatter}\n---\n${body ? `${body}\n` : ""}`
}
