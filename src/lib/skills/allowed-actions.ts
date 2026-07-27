/**
 * PROJ-77-α — the fixed V1 allow-list of actions a skill's agent may perform.
 *
 * Single source of truth. Stored (validated) in a skill version's frontmatter
 * (`allowed_actions`). ENFORCEMENT is deferred to PROJ-82 (proposals) /
 * PROJ-83 (doc-generation), which read the active version's list and reject
 * out-of-mandate actions with 403 + audit `skill.action_denied`.
 *
 * Fail-closed contract (ADR skill-allowed-actions.md): an empty or absent
 * list means NO mutating action is permitted. `read_only` is an explicit
 * "no mutations" marker.
 */
export const SKILL_ALLOWED_ACTIONS = [
  "propose_work_item",
  "propose_risk",
  "propose_budget_item",
  "propose_phase",
  "propose_milestone",
  "generate_document",
  "summarize_document",
  "read_only",
] as const

export type SkillAllowedAction = (typeof SKILL_ALLOWED_ACTIONS)[number]

export function isSkillAllowedAction(v: string): v is SkillAllowedAction {
  return (SKILL_ALLOWED_ACTIONS as readonly string[]).includes(v)
}
