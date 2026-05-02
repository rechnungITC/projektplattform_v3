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

// PROJ-33 Phase 33-α — qualitative Bewertungs-Felder.

export type ManagementLevel =
  | "top"
  | "upper"
  | "middle"
  | "lower"
  | "operational"

export type DecisionAuthority =
  | "none"
  | "advisory"
  | "recommending"
  | "deciding"

export type StakeholderAttitude =
  | "supportive"
  | "neutral"
  | "critical"
  | "blocking"

export type CommunicationNeed = "low" | "normal" | "high" | "critical"

export type PreferredChannel =
  | "meeting"
  | "email"
  | "chat"
  | "report"
  | "dashboard"

export const MANAGEMENT_LEVELS: readonly ManagementLevel[] = [
  "top",
  "upper",
  "middle",
  "lower",
  "operational",
] as const

export const DECISION_AUTHORITIES: readonly DecisionAuthority[] = [
  "none",
  "advisory",
  "recommending",
  "deciding",
] as const

export const STAKEHOLDER_ATTITUDES: readonly StakeholderAttitude[] = [
  "supportive",
  "neutral",
  "critical",
  "blocking",
] as const

export const COMMUNICATION_NEEDS: readonly CommunicationNeed[] = [
  "low",
  "normal",
  "high",
  "critical",
] as const

export const PREFERRED_CHANNELS: readonly PreferredChannel[] = [
  "meeting",
  "email",
  "chat",
  "report",
  "dashboard",
] as const

export const MANAGEMENT_LEVEL_LABELS: Record<ManagementLevel, string> = {
  top: "Top Management",
  upper: "Oberes Management",
  middle: "Mittleres Management",
  lower: "Unteres Management",
  operational: "Operative Ebene",
}

export const DECISION_AUTHORITY_LABELS: Record<DecisionAuthority, string> = {
  none: "Keine",
  advisory: "Beratend",
  recommending: "Empfehlend",
  deciding: "Entscheidend",
}

export const STAKEHOLDER_ATTITUDE_LABELS: Record<StakeholderAttitude, string> = {
  supportive: "Unterstützend",
  neutral: "Neutral",
  critical: "Kritisch",
  blocking: "Blockierend",
}

export const COMMUNICATION_NEED_LABELS: Record<CommunicationNeed, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  critical: "Kritisch",
}

export const PREFERRED_CHANNEL_LABELS: Record<PreferredChannel, string> = {
  meeting: "Meeting",
  email: "E-Mail",
  chat: "Chat",
  report: "Bericht",
  dashboard: "Dashboard",
}

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
  /**
   * PROJ-31 — eligible to be nominated as approver on formal Decisions.
   * Optional in the type until PROJ-31 backend migration lands; older
   * fetched payloads simply lack the field.
   */
  is_approver?: boolean
  // PROJ-33 Phase 33-α — qualitative Bewertungs-Felder. Alle nullable.
  reasoning?: string | null
  stakeholder_type_key?: string | null
  management_level?: ManagementLevel | null
  decision_authority?: DecisionAuthority | null
  attitude?: StakeholderAttitude | null
  conflict_potential?: StakeholderScore | null
  communication_need?: CommunicationNeed | null
  preferred_channel?: PreferredChannel | null
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
