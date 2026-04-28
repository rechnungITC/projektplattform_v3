/**
 * PROJ-8 — stakeholder types.
 *
 * Stakeholders are first-class business entities, not technical users. See
 * `docs/decisions/stakeholder-vs-user.md`. The optional `linked_user_id`
 * connects a stakeholder to an account on the platform when applicable.
 */

export type StakeholderKind = "person" | "organization"
export type StakeholderOrigin = "internal" | "external"
export type StakeholderScore = "low" | "medium" | "high" | "critical"

export const STAKEHOLDER_KINDS: readonly StakeholderKind[] = [
  "person",
  "organization",
] as const

export const STAKEHOLDER_ORIGINS: readonly StakeholderOrigin[] = [
  "internal",
  "external",
] as const

export const STAKEHOLDER_SCORES: readonly StakeholderScore[] = [
  "low",
  "medium",
  "high",
  "critical",
] as const

export const STAKEHOLDER_KIND_LABELS: Record<StakeholderKind, string> = {
  person: "Person",
  organization: "Organisation",
}

export const STAKEHOLDER_ORIGIN_LABELS: Record<StakeholderOrigin, string> = {
  internal: "Intern",
  external: "Extern",
}

export const STAKEHOLDER_SCORE_LABELS: Record<StakeholderScore, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
}

export interface Stakeholder {
  id: string
  tenant_id: string
  project_id: string
  kind: StakeholderKind
  origin: StakeholderOrigin
  name: string
  role_key: string | null
  org_unit: string | null
  contact_email: string | null
  contact_phone: string | null
  influence: StakeholderScore
  impact: StakeholderScore
  linked_user_id: string | null
  notes: string | null
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * A role suggestion derived from PROJ-6's catalog (`standard_roles`) minus
 * already-added or dismissed entries. The `role_key` is the catalog key,
 * `label_de` is the human-readable label.
 */
export interface StakeholderSuggestion {
  role_key: string
  label_de: string
}
