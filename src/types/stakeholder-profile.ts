/**
 * PROJ-33 Phase 33-γ — Stakeholder Skill + Big5/OCEAN Profile types.
 *
 * Two separate tables (skill / personality) with fremd (PM-bewertet) +
 * self (Stakeholder via Magic-Link in Phase δ) values per dimension.
 * Audit-Events are append-only; actor_kind union covers both PM (user)
 * and Self-Assessment (stakeholder) flows.
 */

export const SKILL_DIMENSIONS = [
  "domain_knowledge",
  "method_competence",
  "it_affinity",
  "negotiation_skill",
  "decision_power",
] as const

export type SkillDimension = (typeof SKILL_DIMENSIONS)[number]

export const SKILL_DIMENSION_LABELS: Record<SkillDimension, string> = {
  domain_knowledge: "Domänenwissen",
  method_competence: "Methodenkompetenz",
  it_affinity: "IT-/Tool-Affinität",
  negotiation_skill: "Verhandlungsgeschick",
  decision_power: "Entscheidungskraft",
}

export const PERSONALITY_DIMENSIONS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "emotional_stability",
] as const

export type PersonalityDimension = (typeof PERSONALITY_DIMENSIONS)[number]

export const PERSONALITY_DIMENSION_LABELS: Record<PersonalityDimension, string> = {
  openness: "Offenheit",
  conscientiousness: "Gewissenhaftigkeit",
  extraversion: "Extraversion",
  agreeableness: "Verträglichkeit",
  emotional_stability: "Emotionale Stabilität",
}

export const PERSONALITY_DIMENSION_DESCRIPTIONS: Record<PersonalityDimension, string> = {
  openness:
    "Offen für neue Ideen, Erfahrungen, kreative Lösungen — vs. konventionell, traditionsbewusst.",
  conscientiousness:
    "Pflichtbewusst, planvoll, organisiert — vs. spontan, flexibel, weniger strukturiert.",
  extraversion:
    "Energetisch in sozialen Interaktionen, gesprächig — vs. zurückhaltend, ruhig, introvertiert.",
  agreeableness:
    "Kooperativ, vertrauensvoll, harmoniebedürftig — vs. wettbewerbsorientiert, kritisch, direkt.",
  emotional_stability:
    "Ruhig unter Stress, ausgeglichen — vs. emotional reaktiv, sensibel auf Druck.",
}

export interface StakeholderSkillProfile {
  stakeholder_id: string
  tenant_id: string
  domain_knowledge_fremd: number | null
  domain_knowledge_self: number | null
  method_competence_fremd: number | null
  method_competence_self: number | null
  it_affinity_fremd: number | null
  it_affinity_self: number | null
  negotiation_skill_fremd: number | null
  negotiation_skill_self: number | null
  decision_power_fremd: number | null
  decision_power_self: number | null
  fremd_assessed_by: string | null
  fremd_assessed_at: string | null
  self_assessed_at: string | null
  created_at: string
  updated_at: string
}

export interface StakeholderPersonalityProfile {
  stakeholder_id: string
  tenant_id: string
  openness_fremd: number | null
  openness_self: number | null
  conscientiousness_fremd: number | null
  conscientiousness_self: number | null
  extraversion_fremd: number | null
  extraversion_self: number | null
  agreeableness_fremd: number | null
  agreeableness_self: number | null
  emotional_stability_fremd: number | null
  emotional_stability_self: number | null
  fremd_assessed_by: string | null
  fremd_assessed_at: string | null
  self_assessed_at: string | null
  created_at: string
  updated_at: string
}

export type ProfileAuditEventType =
  | "fremd_updated"
  | "self_updated"
  | "self_assessed_via_token"
  | "reset"

export type ProfileAuditActorKind = "user" | "stakeholder"

export interface StakeholderProfileAuditEvent {
  id: string
  tenant_id: string
  stakeholder_id: string
  profile_kind: "skill" | "personality"
  event_type: ProfileAuditEventType
  actor_kind: ProfileAuditActorKind
  actor_user_id: string | null
  actor_stakeholder_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

// PROJ-33 Phase 33-δ — Self-Assessment Magic-Link invite shape.
export type SelfAssessmentInviteStatus =
  | "pending"
  | "completed"
  | "revoked"
  | "expired"

export interface SelfAssessmentInviteSummary {
  id: string
  status: SelfAssessmentInviteStatus
  magic_link_expires_at: string
  submitted_at: string | null
  created_at: string
}

/** PROJ-35 Phase 35-β — qualitative + risk-derived fields piggy-backed on
 *  the profile bundle so the UI can render banners + tonality without a
 *  separate round-trip. Optional for backwards compatibility with older
 *  bundle responses. */
export interface StakeholderQualitativeFields {
  attitude: "supportive" | "neutral" | "critical" | "blocking" | null
  conflict_potential: "low" | "medium" | "high" | "critical" | null
  decision_authority:
    | "none"
    | "advisory"
    | "recommending"
    | "deciding"
    | null
  influence: "low" | "medium" | "high" | "critical" | null
  impact: "low" | "medium" | "high" | "critical" | null
  communication_need: "low" | "medium" | "high" | "critical" | null
  preferred_channel: string | null
}

export interface StakeholderProfileBundle {
  skill: StakeholderSkillProfile | null
  personality: StakeholderPersonalityProfile | null
  events: StakeholderProfileAuditEvent[]
  /** Most recent invite (any status) — null if no invite was ever sent. */
  latest_invite: SelfAssessmentInviteSummary | null
  /** PROJ-35-β — qualitative fields read from `stakeholders` for the
   *  Risk-Banner / Tonality computation. */
  stakeholder_qualitative?: StakeholderQualitativeFields | null
  /** PROJ-35-β — current snapshot of detected escalation patterns (from
   *  `stakeholders.current_escalation_patterns`). Maintained by the
   *  PG audit-trigger on stakeholder + Big5 changes. */
  escalation_patterns?: string[]
  /** PROJ-35-β — tenant-level multiplier overrides; merged with TS-defaults
   *  client-side to compute the effective Risk-Score. */
  risk_score_overrides?: Record<string, unknown>
}

/**
 * Helper for the form: per-dimension input shape.
 * Input fields are 0-100 integers, nullable.
 */
export type SkillProfileInput = Partial<{
  [K in SkillDimension as `${K}_fremd`]: number | null
}>

export type PersonalityProfileInput = Partial<{
  [K in PersonalityDimension as `${K}_fremd`]: number | null
}>
