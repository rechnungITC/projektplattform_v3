/**
 * PROJ-12 — shared AI types.
 *
 * PROJ-30: extended with `narrative` purpose for the PROJ-21 KI-Kurzfazit.
 */

export type AIPurpose =
  | "risks"
  | "decisions"
  | "work_items"
  | "open_items"
  | "narrative"
  | "sentiment"
  | "coaching"

export type DataClass = 1 | 2 | 3

export type AIProviderName =
  | "anthropic"
  | "stub"
  | "ollama"
  | "openai"
  | "google"

/**
 * Auto-context for risk-suggestion generation. The shape mirrors the
 * curated class-1/2 allowlist locked in the tech design — never includes
 * stakeholders, profile data, descriptions, or freetext that could carry
 * Class-3 personal data by accident.
 */
export interface RiskAutoContext {
  project: {
    name: string
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
    planned_start_date: string | null
    planned_end_date: string | null
  }
  phases: Array<{
    name: string
    status: string
    planned_start: string | null
    planned_end: string | null
  }>
  milestones: Array<{
    name: string
    status: string
    target_date: string | null
  }>
  work_items: Array<{
    title: string
    kind: string
    status: string
  }>
  existing_risks: Array<{
    title: string
    probability: number
    impact: number
  }>
}

/**
 * Single AI-proposed risk before it lands as a real `risks` row.
 * Probability/impact bounded 1–5 to match the DB constraint.
 */
export interface RiskSuggestion {
  title: string
  description: string | null
  probability: number
  impact: number
  status: "open" | "mitigated" | "accepted" | "closed"
  mitigation: string | null
}

export interface ProviderUsage {
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number | null
}

export interface RiskGenerationOutput {
  suggestions: RiskSuggestion[]
  usage: ProviderUsage
}

/**
 * Result of a router invocation. Persisted as a `ki_runs` row plus a
 * `ki_suggestions` row per item.
 */
export interface RouterRiskResult {
  run_id: string
  classification: DataClass
  provider: AIProviderName
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  suggestion_ids: string[]
  external_blocked: boolean
  error_message?: string
}

// ---------------------------------------------------------------------------
// PROJ-30 — narrative-purpose types
// ---------------------------------------------------------------------------

/**
 * Auto-context for narrative generation (PROJ-21 KI-Kurzfazit).
 *
 * Strict Class-1/2: NO `responsible_user_id`, NO `lead_name`, NO
 * `sponsor_name`, NO stakeholder names. The whitelist classifier in
 * `classify.ts` enforces this as a defense-in-depth check.
 *
 * `kind` discriminates the snapshot variant so the prompt can vary
 * tone (Status-Report = full pass, Executive-Summary = 1-pager).
 */
export interface NarrativeAutoContext {
  kind: "status_report" | "executive_summary"
  project: {
    name: string
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
    planned_start_date: string | null
    planned_end_date: string | null
  }
  phases_summary: {
    total: number
    by_status: Record<string, number>
  }
  top_risks: Array<{
    title: string
    score: number
    status: string
  }>
  top_decisions: Array<{
    title: string
    decided_at: string
  }>
  upcoming_milestones: Array<{
    name: string
    status: string
    target_date: string | null
  }>
  backlog_counts: {
    by_kind: Record<string, number>
    by_status: Record<string, number>
  }
}

export interface NarrativeGenerationOutput {
  text: string
  usage: ProviderUsage
}

/**
 * Result of a narrative router invocation. Persisted as a single
 * `ki_runs` row — narrative is transient (no `ki_suggestions` insert);
 * the user-edited final text lands in `report_snapshots.content
 * .ki_summary` via the PROJ-21 commit path.
 */
export interface RouterNarrativeResult {
  run_id: string
  classification: DataClass
  provider: AIProviderName
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  text: string
  external_blocked: boolean
  error_message?: string
}

// ---------------------------------------------------------------------------
// PROJ-34-γ.1 — sentiment-purpose types
// ---------------------------------------------------------------------------

/**
 * Auto-context for sentiment classification of a single interaction.
 *
 * Always Class-3 per CIA-L1: the `summary` is user-redacted but still
 * carries identifiable behavioural assessment of a named stakeholder.
 * `classifySentimentAutoContext` therefore hard-fixes the result.
 *
 * Per-participant output (CIA-L3) — the prompt is told which
 * stakeholder roles took part so it can emit one value per participant.
 */
export interface SentimentAutoContext {
  summary: string
  participants: Array<{
    stakeholder_id: string
    /**
     * Short label only — no contact info, no profile data; the value is
     * sent to the provider verbatim so callers must not include PII
     * beyond the stakeholder's display name.
     */
    label: string
  }>
}

export interface SentimentSignal {
  stakeholder_id: string
  /** Integer in `-2..+2`. */
  sentiment: number
  /** Integer in `-2..+2`. */
  cooperation_signal: number
  /** Confidence in `0..1`. */
  confidence: number
}

export interface SentimentGenerationOutput {
  signals: SentimentSignal[]
  usage: ProviderUsage
}

export interface RouterSentimentResult {
  run_id: string
  classification: DataClass
  provider: AIProviderName
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  signals: SentimentSignal[]
  external_blocked: boolean
  error_message?: string
}

// ---------------------------------------------------------------------------
// PROJ-34-ε — coaching recommendations
// ---------------------------------------------------------------------------

/**
 * Auto-context for AI coaching-recommendation generation.
 *
 * Always Class-3 per CIA-L1 (parallel to sentiment): every field carries
 * identifiable behavioural assessment of a named stakeholder. Sources
 * locked 2026-05-13 (Q1 Profile / Q2 Last-N-Interactions / Q3 Risk-Score /
 * Q4 Tonality-Lookup / Q5 Response-Stats).
 */
export interface CoachingAutoContext {
  stakeholder_id: string
  stakeholder_name: string
  // Q1 Profile — flat snapshot of qualitative PROJ-33 fields. Only
  // populated keys are sent to the provider; nulls are stripped.
  profile: {
    big5?: Partial<Record<
      "openness" | "conscientiousness" | "extraversion" | "agreeableness" | "neuroticism",
      number
    >>
    skills?: Partial<Record<string, number>>
    reasoning?: string | null
    attitude?: string | null
    management_level?: string | null
    decision_authority?: string | null
    communication_need?: string | null
    preferred_channel?: string | null
  }
  // Q2 — last N interactions; never the raw email/chat body, always the
  // user-redacted summary.
  recent_interactions: Array<{
    interaction_id: string
    channel: string
    direction: string
    interaction_date: string
    summary: string
    participant_sentiment: number | null
    participant_cooperation_signal: number | null
  }>
  // Q3 — PROJ-35 risk snapshot at trigger time.
  risk: {
    score: number | null
    escalation_pattern: number | null
    critical_path: boolean | null
  }
  // Q4 — PROJ-35 32-Big5 Tonality-Lookup result as a read-only prompt
  // hint. NEVER promoted directly to a recommendation output (AC-17).
  tonality_hint: string | null
  // Q5 — PROJ-34-δ response-behaviour snapshot.
  response_stats: {
    awaiting_count: number
    avg_response_latency_hours: number | null
    has_overdue: boolean
  }
}

export type CoachingKind =
  | "outreach"
  | "tonality"
  | "escalation"
  | "celebration"

export interface CoachingRecommendation {
  kind: CoachingKind
  /** Recommendation text — provider keeps it ≤ 1000 chars. */
  text: string
  /** Confidence in `0..1`. */
  confidence: number
  /** IDs from `recent_interactions` the recommendation cited. */
  cited_interaction_ids: string[]
  /** Profile field keys the recommendation cited (e.g. `big5_neuroticism`). */
  cited_profile_fields: string[]
}

export interface CoachingGenerationOutput {
  /** 0..n recommendations; provider must emit ≤ 1 per kind. */
  recommendations: CoachingRecommendation[]
  usage: ProviderUsage
}

export interface RouterCoachingResult {
  run_id: string
  classification: DataClass
  provider: AIProviderName
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  recommendations: CoachingRecommendation[]
  external_blocked: boolean
  /** Echoed back from the context so callers can persist it as audit. */
  tonality_hint: string | null
  error_message?: string
}
