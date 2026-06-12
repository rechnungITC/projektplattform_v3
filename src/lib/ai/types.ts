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
  // PROJ-65 ε.4.α — trajectory sequence suggestions (Class-2, advisory)
  | "trajectory_sequence"
  // PROJ-65 ε.4.β — resource-swap suggestions (Class-3 hard-fix, Ollama-only, advisory)
  | "resource_swap"
  // PROJ-65 ε.4.γ — cross-project work-item link suggestions (Class-2, advisory)
  | "cross_project_links"
  // PROJ-70-α — auto-backlog from a context_sources kickoff input (advisory).
  // Hierarchical Item-Vorschläge mit `temp_id` + optional `parent_temp_id`
  // — flach gespeichert, Hierarchie via Chain. Class-1/2 → Anthropic;
  // Class-3 (via Heuristik oder PROJ-44-β privacy_class) → Ollama-only.
  | "proposal_from_context"
  // PROJ-88 — stakeholder extraction from a kickoff context source.
  // Class-3-pinned (names by definition) → local providers only.
  | "proposal_stakeholders_from_context"
  // PROJ-89 — risk proposals from a kickoff context source. Standard
  // content-based classification (NOT pinned): clean business documents
  // are Class 2 → cloud allowed; real PII → Class 3 → local-only via
  // the standard resolver clamp.
  | "proposal_risks_from_context"

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

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.α — trajectory-sequence purpose types
// ---------------------------------------------------------------------------

/**
 * Auto-context for trajectory-sequence suggestions. Class-2: project /
 * phases / sprints / milestones / dependencies / goals — strictly the
 * structural layout of the project, NO personal data (`responsible_user_id`,
 * stakeholders, profile fields, etc.). Every column listed here is in the
 * Class-1/2 portion of `data-privacy-registry.ts`.
 */
export interface TrajectorySequenceAutoContext {
  project: {
    name: string
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
    planned_start_date: string | null
    planned_end_date: string | null
  }
  phases: Array<{
    id: string
    name: string
    status: string
    planned_start: string | null
    planned_end: string | null
    sequence_number: number | null
  }>
  sprints: Array<{
    id: string
    name: string
    /** `sprints.state` column (planned/active/completed/canceled). */
    state: string
    start_date: string | null
    end_date: string | null
  }>
  milestones: Array<{
    id: string
    name: string
    status: string
    target_date: string | null
  }>
  dependencies: Array<{
    from_type: string
    from_id: string
    to_type: string
    to_id: string
    constraint_type: string
  }>
  goals: Array<{
    id: string
    title: string
    target_date: string | null
    status: string | null
  }>
}

export type TrajectorySequenceSuggestionKind =
  | "parallelize"
  | "reorder"
  | "serialize"
  | "merge"

export interface TrajectorySequenceSuggestion {
  /** One-line German title shown in the drawer card. */
  title: string
  /** 1–3 sentence German rationale; cites node names. */
  rationale: string
  /** Action type. UI maps to an icon + colour. */
  kind: TrajectorySequenceSuggestionKind
  /**
   * Snapshot-prefixed node ids the user should review.
   *   `phase:<uuid>` or `sprint:<uuid>` — matches the trajectory layout
   *   id format and the Plan-Mutate source-node contract.
   */
  affected_node_ids: string[]
  /** Optional time-savings estimate (advisory). */
  estimated_savings_days: number | null
  /** Provider's self-confidence; the UI shows this as a small badge. */
  confidence: "low" | "medium" | "high"
}

export interface TrajectorySequenceGenerationOutput {
  suggestions: TrajectorySequenceSuggestion[]
  usage: ProviderUsage
}

/**
 * Result of a trajectory-sequence router invocation. Persisted as a
 * `ki_runs` row + one `ki_suggestions` row per suggestion (purpose=
 * 'trajectory_sequence'). The `accepted_entity_*` link stays NULL on
 * accept — trajectory-sequence is advisory; users apply via Plan-Mutate.
 */
export interface RouterTrajectorySequenceResult {
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
// PROJ-65 ε.4.β — resource-swap purpose types
// ---------------------------------------------------------------------------

/**
 * Auto-context for resource-swap suggestions. **Class-3 by design**:
 * carries identifiable behavioural / role context for named resources
 * (display_name) and stakeholders. `classifyResourceSwapAutoContext`
 * hard-fixes to Class-3, so the router routes locally to Ollama only —
 * external providers are never reached.
 *
 * Day rates are bucketed per the **caller's** `cost_clear_view` permission:
 *   * `cost_clear_view = true` (lead/admin): `rate_eur` populated with the
 *     resolved daily rate (override → role → null).
 *   * `cost_clear_view = false` (editor): `rate_eur` is `null` and
 *     `rate_bucket` ∈ `'low'|'mid'|'high'` is set instead. The prompt
 *     instructs the model NOT to invent €-amounts in the rationale when
 *     buckets are present. This mirrors the UI masking rule for non-lead
 *     users and closes the cost-clear-view-bypass risk identified in CIA
 *     Fork 3 (2026-05-28).
 */
export type RateBucket = "low" | "mid" | "high"

export interface ResourceSwapResourceRef {
  resource_id: string
  display_name: string
  role_key: string | null
  is_active: boolean
  rate_eur: number | null
  rate_bucket: RateBucket | null
  // Linked-stakeholder hints (Class-3) — flat strings, no nested PII blocks.
  stakeholder_name: string | null
  // Top skill labels from the linked stakeholder's qualitative profile.
  skills: string[]
}

export interface ResourceSwapWorkItem {
  work_item_id: string
  title: string
  kind: string
  status: string
  current_assignees: ResourceSwapResourceRef[]
}

export interface ResourceSwapAutoContext {
  /** Whether the caller has cost-clear-view (lead/admin) — drives the rate
   *  presentation in the prompt + the classifier defense-in-depth. */
  cost_clear_view: boolean
  /** Top-N work items eligible for a swap (in-progress or todo, with
   *  current assignees). Pre-ranked deterministically by status priority
   *  + recent activity. */
  work_items: ResourceSwapWorkItem[]
  /** Top-N candidate resources tenant-wide (active, with at least one
   *  skill, ranked by activity). Used as the swap-target universe. */
  candidate_resources: ResourceSwapResourceRef[]
  /** Number of resources truncated from the candidate pool (for the UI
   *  hint "Aus 10 von 47 …"). */
  candidate_pool_truncated_by: number
}

export type ResourceSwapKind = "skill_mismatch" | "overallocation" | "cost_optimization" | "availability"

export interface ResourceSwapSuggestion {
  /** German one-line title, references the swap target by name. */
  title: string
  /** 1–3 sentence German rationale. When `cost_clear_view=false`, the
   *  prompt instructs the model to use bucket terms (low/mid/high) and
   *  NOT invent €-amounts. */
  rationale: string
  kind: ResourceSwapKind
  /** Work-item the swap applies to. */
  work_item_id: string
  /** Currently assigned resource to be replaced. */
  from_resource_id: string
  /** Proposed replacement resource. */
  to_resource_id: string
  /** 0..100 model self-confidence in the match. */
  fit_score: number
  /** Provider's self-confidence on the suggestion. */
  confidence: "low" | "medium" | "high"
}

export interface ResourceSwapGenerationOutput {
  suggestions: ResourceSwapSuggestion[]
  usage: ProviderUsage
}

/**
 * Result of a resource-swap router invocation. Persisted as `ki_runs` +
 * `ki_suggestions` rows (purpose='resource_swap'). Accept is advisory;
 * the `accepted_entity_*` link stays NULL on accept.
 */
export interface RouterResourceSwapResult {
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
// PROJ-65 ε.4.γ — cross-project work-item link purpose types
// ---------------------------------------------------------------------------

/**
 * Auto-context for cross-project-link suggestions. Class-2: project +
 * work-item metadata (title/kind/status) + parent_project_id-based
 * hierarchy + existing `work_item_links` so the model doesn't propose
 * duplicates. Strictly NO personal data — `responsible_user_id`,
 * `description`, stakeholder joins, audit fields are all out of scope
 * (defense-in-depth enforced by `classifyCrossProjectLinksAutoContext`).
 *
 * The "candidate universe" mirrors PROJ-27 cross-project-link surface:
 * the source project + its parent + direct children + sibling projects
 * sharing the same parent — exactly the set a project lead would see in
 * the existing link-create combobox (`/api/work-items/search`).
 */
export interface CrossProjectLinkProjectRef {
  project_id: string
  name: string
  project_type: string | null
  project_method: string | null
  lifecycle_status: string
  /** `self` (the project the user opened the drawer in) | `parent` |
   *  `child` | `sibling`. UX hint only; never used as auth signal. */
  relation: "self" | "parent" | "child" | "sibling"
}

export interface CrossProjectLinkWorkItemRef {
  work_item_id: string
  project_id: string
  title: string
  kind: string
  status: string
}

export interface CrossProjectLinkExistingLink {
  from_work_item_id: string
  to_work_item_id: string | null
  to_project_id: string
  link_type: string
  approval_state: string
}

export interface CrossProjectLinksAutoContext {
  source_project: CrossProjectLinkProjectRef
  related_projects: CrossProjectLinkProjectRef[]
  source_work_items: CrossProjectLinkWorkItemRef[]
  related_work_items: CrossProjectLinkWorkItemRef[]
  /** Existing semantic links between any of the in-scope work-items.
   *  Used by the prompt to avoid duplicate suggestions. */
  existing_links: CrossProjectLinkExistingLink[]
}

/**
 * Curated subset of PROJ-27 canonical link types that the AI is allowed
 * to propose. Reverse tokens (`follows`, `blocked`, …) are intentionally
 * excluded — the storage layer canonicalises them anyway, and constraining
 * the prompt to canonical-only avoids confusing round-trips.
 *
 * Tokens map 1:1 to `work_item_links.link_type` (PROJ-27 migration
 * 20260511210000) so the suggestion can be applied as-is via the existing
 * create-link dialog without remapping.
 */
export type CrossProjectLinkKind =
  | "relates"
  | "blocks"
  | "requires"
  | "duplicates"
  | "delivers"
  | "precedes"
  | "includes"

export interface CrossProjectLinkSuggestion {
  /** German one-line title that references both work-item titles. */
  title: string
  /** 1–3 sentence German rationale citing the observation that motivates
   *  the link (e.g. "Story X in Project A liefert auf Phase Y in B"). */
  rationale: string
  /** PROJ-27 canonical link type. */
  kind: CrossProjectLinkKind
  /** Source work-item id — MUST appear in `source_work_items`. */
  from_work_item_id: string
  /** Target work-item id — MUST appear in `related_work_items`. NULL only
   *  for whole-project `delivers`-links (mirrors PROJ-27 ST-08). */
  to_work_item_id: string | null
  /** Target project id — always set so the FE can deeplink even for
   *  whole-project `delivers` suggestions. */
  to_project_id: string
  /** Optional lag in days (for `precedes`/`requires`). Provider may emit
   *  null when not applicable. */
  lag_days: number | null
  /** Provider's self-confidence; the UI shows this as a small badge. */
  confidence: "low" | "medium" | "high"
}

/** Server-side display enrichment for the drawer card (titles + project
 *  names denormalised so the FE renders without extra round-trips). */
export interface CrossProjectLinkSuggestionDisplay {
  from_work_item_title: string | null
  to_work_item_title: string | null
  to_project_name: string | null
  source_project_name: string | null
}

export interface CrossProjectLinkSuggestionPersisted
  extends CrossProjectLinkSuggestion {
  display?: CrossProjectLinkSuggestionDisplay
}

export interface CrossProjectLinksGenerationOutput {
  suggestions: CrossProjectLinkSuggestion[]
  usage: ProviderUsage
}

/**
 * Result of a cross-project-links router invocation. Persisted as a
 * `ki_runs` row + one `ki_suggestions` row per suggestion (purpose=
 * 'cross_project_links'). The `accepted_entity_*` link stays NULL on
 * accept — this is advisory; the user applies via the existing PROJ-27
 * create-link dialog with its own audit trail.
 */
export interface RouterCrossProjectLinksResult {
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
// PROJ-70-α — proposal_from_context purpose types
// ---------------------------------------------------------------------------

/**
 * Method-hint for the AI prompt. Maps roughly to `project.project_method`
 * but normalised — Anthropic doesn't care about waterfall-de-DE vs.
 * waterfall-en-US, just the methodological frame.
 */
export type ProjectMethodHint =
  | "waterfall"
  | "scrum"
  | "kanban"
  | "hybrid"
  | "unspecified"

/**
 * Auto-context for proposal-from-context suggestions.
 *
 * Reads ONE `context_sources` row (the kickoff artefact) + the source
 * project's `project_method`. Class-2 by default, but the heuristic
 * Class-3-detector in `classify.ts` may upgrade the run to Class-3 when
 * email / DACH-name / phone patterns are present in `content_excerpt`.
 *
 * Strict allowlist — fields NOT in this shape never reach the prompt.
 */
export interface ProposalFromContextAutoContext {
  source_project: {
    project_id: string
    name: string
    /** PROJ-91 — the wizard "Vorhaben" (project goal). Grounds the
     *  backlog generation so each item's relevance to the goal can be
     *  judged. May be null when the project has no description. */
    description: string | null
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
  }
  context_source: {
    context_source_id: string
    /** Document kind ("document" / "email" / "meeting_notes" / "transcript" / "other"). */
    kind: string
    title: string
    /** Pre-classified privacy level from PROJ-44-β. Heuristik in classify.ts
     *  can only raise it (high-class-wins) — never lower. */
    privacy_class: 1 | 2 | 3
    /** Capped 8k chars per PROJ-44-β; the only freetext that leaves the
     *  RLS layer for AI processing. */
    content_excerpt: string
    /** Language hint, autodetected at ingestion time (de / en / null). */
    language: string | null
  }
  /** Method-hint passed to the prompt so the model picks kinds aligned
   *  with the project's project_method (waterfall → phase/work_package/todo;
   *  scrum → epic/story/task; etc). */
  method_hint: ProjectMethodHint
}

/**
 * One AI-proposed backlog item. `temp_id` and `parent_temp_id` are
 * model-generated; they only have meaning within ONE run. The actual
 * `work_items.id` lives in a different namespace and is allocated at
 * accept-time in slice 70-β.
 *
 * `kind` is suggested by the model but NOT validated against project_method
 * here — strict method-compatibility check happens at accept-time
 * (AC-β7) so the user can correct via inline-edit before persisting.
 */
export interface ProposalFromContextSuggestion {
  /** Model-generated stable id within this run. */
  temp_id: string
  /** Parent reference within the same run; null at top-level. */
  parent_temp_id: string | null
  /** Suggested work_item kind (phase/work_package/todo/epic/story/task/
   *  subtask/bug). Validation deferred to 70-β accept-time. */
  kind: string
  /** Short German title for the proposed work-item. */
  title: string
  /** Optional 1-3 sentence rationale; capped 500 chars by Zod-schema. */
  description: string | null
  /** Provider's self-confidence; the UI shows this as a small badge.
   *  Axis 1: how clearly the item is grounded in the DOCUMENT. */
  confidence: "low" | "medium" | "high"
  /** PROJ-91 — relevance to the project goal (the wizard "Vorhaben").
   *  Axis 2 (distinct from confidence): `off_goal` items come from the
   *  kickoff but don't serve the project intent — surfaced with a badge,
   *  never suppressed. Defaults to `on_goal` when no goal is provided. */
  relevance: "on_goal" | "off_goal"
  /** Server-side display enrichment so the FE renders without round-trips. */
  display?: {
    method_hint_kind: ProjectMethodHint | null
    source_project_name: string | null
    context_source_title: string | null
  }
}

export interface ProposalFromContextGenerationOutput {
  suggestions: ProposalFromContextSuggestion[]
  usage: ProviderUsage
}

/**
 * Result of a proposal-from-context router invocation. Persisted as a
 * `ki_runs` row + one `ki_suggestions` row per suggestion
 * (`purpose='proposal_from_context'`). The `accepted_entity_*` link
 * stays NULL on accept — accept is advisory; the actual `work_items`
 * row gets created by the 70-β accept-pipeline.
 */
export interface RouterProposalFromContextResult {
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
// PROJ-88 — proposal_stakeholders_from_context purpose types
// ---------------------------------------------------------------------------

/**
 * Auto-context for stakeholder proposals from a kickoff context source.
 *
 * Class-3 BY DESIGN (stakeholder extraction surfaces personal names) —
 * `classifyStakeholderProposalsAutoContext` returns 3 unconditionally,
 * so the router can only ever pick a local/eligible provider. The full
 * excerpt may flow here because it never leaves the tenant boundary.
 *
 * `existing_stakeholders` enables dedup: the model proposes
 * `duplicate_of_stakeholder_id` instead of a duplicate create.
 */
export interface StakeholderProposalsAutoContext {
  source_project: {
    project_id: string
    name: string
    /** PROJ-91 track invariant: the Vorhaben is ONLY the relevance
     *  yardstick — NEVER a generation source (AC-88.9). */
    description: string | null
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
  }
  context_source: {
    context_source_id: string
    kind: string
    title: string
    privacy_class: 1 | 2 | 3
    content_excerpt: string
    language: string | null
  }
  existing_stakeholders: Array<{
    stakeholder_id: string
    name: string
    kind: "person" | "organization"
    role_key: string | null
  }>
}

/**
 * One AI-proposed stakeholder. Flat (no hierarchy). Reviewer-set accept
 * options (`create_resource`, `linked_user_id`) are added via the
 * purpose-aware PATCH before bulk-accept — the model never sets them.
 */
export interface StakeholderProposalSuggestion {
  /** Extracted display name (person or organization). Never fabricated —
   *  must be grounded in the kickoff document (AC-88.9). */
  name: string
  kind: "person" | "organization"
  /** Model's best guess whether the party belongs to the own org. */
  origin: "internal" | "external"
  /** Suggested project role, free text from the document (≤ 100 chars). */
  role_key: string | null
  /** Organization/department hint from the document. */
  org_unit: string | null
  /** Contact details if (and only if) the document states them. Stays in
   *  the tenant DB — the generation itself runs on a local provider. */
  contact_email: string | null
  contact_phone: string | null
  /** Dedup: id of an existing project stakeholder this mention refers to.
   *  Accept then links instead of creating (L4). */
  duplicate_of_stakeholder_id: string | null
  /** Short verbatim quote locating the mention in the document (review aid,
   *  source traceability). */
  source_quote: string | null
  /** Axis 1 — how clearly the document supports this stakeholder. Low for
   *  ambiguous names (could be a product). */
  confidence: "low" | "medium" | "high"
  /** Axis 2 (PROJ-91 invariant) — relevance to the Vorhaben. */
  relevance: "on_goal" | "off_goal"
  /** Reviewer-set accept options (via PATCH, not model output). */
  create_resource?: boolean
  linked_user_id?: string | null
  /** Server-side display enrichment. */
  display?: {
    source_project_name: string | null
    context_source_title: string | null
  }
}

export interface StakeholderProposalsGenerationOutput {
  suggestions: StakeholderProposalSuggestion[]
  usage: ProviderUsage
}

/** Router result for a stakeholder-proposals invocation. */
export interface RouterStakeholderProposalsResult {
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
// PROJ-89 — proposal_risks_from_context purpose types
// ---------------------------------------------------------------------------

/**
 * Auto-context for risk proposals from a kickoff context source.
 *
 * Classification is CONTENT-BASED (PROJ-70-α pattern, post-PROJ-86
 * marker detection) — risk text is business language, so clean documents
 * route to the tenant's cloud provider. Defense-in-depth: the
 * `context_source.privacy_class` acts as a floor (a manually stamped
 * Class-3 source never goes to cloud), and the resolver clamps Class 3
 * to local providers.
 *
 * `existing_risks` enables dedup: the model proposes
 * `duplicate_of_risk_id` instead of a duplicate create, and does not
 * re-propose what the register already has.
 */
export interface RiskProposalsAutoContext {
  source_project: {
    project_id: string
    name: string
    /** PROJ-91 track invariant: the Vorhaben is ONLY the relevance
     *  yardstick — NEVER a generation source (AC-89.9). */
    description: string | null
    project_type: string | null
    project_method: string | null
    lifecycle_status: string
  }
  context_source: {
    context_source_id: string
    kind: string
    title: string
    privacy_class: 1 | 2 | 3
    content_excerpt: string
    language: string | null
  }
  existing_risks: Array<{
    risk_id: string
    title: string
    probability: number
    impact: number
    status: string
  }>
}

/**
 * One AI-proposed risk, mapped onto the PROJ-20 risk shape (AC-89.3).
 * Flat (no hierarchy). On accept, rows insert into `public.risks` with
 * status 'open' — review semantics live in ki_suggestions + provenance
 * (AC-89.3 design clarification: the risks table has no draft status).
 */
export interface RiskProposalSuggestion {
  /** Risk title (≤ 255 per risks_title_length). Derived exclusively from
   *  the kickoff document (AC-89.9). */
  title: string
  /** What the document implies, why this is a risk (≤ 5000). */
  description: string | null
  /** Probability of occurrence, 1 (rare) … 5 (almost certain). */
  probability: number
  /** Impact severity, 1 (negligible) … 5 (critical). */
  impact: number
  /** Actionable mitigation next step (≤ 5000); null when the document
   *  gives no basis for one (no fabricated advice). */
  mitigation: string | null
  /** Dedup: id of an existing project risk this finding refers to.
   *  Accept then records provenance on the existing risk instead of
   *  creating (PROJ-88 L4 pattern). Validated post-hoc against the
   *  supplied list — hallucinated ids → null. */
  duplicate_of_risk_id: string | null
  /** Short verbatim quote locating the finding in the document (review
   *  aid, source traceability). */
  source_quote: string | null
  /** Axis 1 — how clearly the document supports this risk. */
  confidence: "low" | "medium" | "high"
  /** Axis 2 (PROJ-91 invariant) — relevance to the Vorhaben. */
  relevance: "on_goal" | "off_goal"
  /** Server-side display enrichment. */
  display?: {
    source_project_name: string | null
    context_source_title: string | null
  }
}

export interface RiskProposalsGenerationOutput {
  suggestions: RiskProposalSuggestion[]
  usage: ProviderUsage
}

/** Router result for a risk-proposals invocation. */
export interface RouterRiskProposalsResult {
  run_id: string
  classification: DataClass
  provider: AIProviderName
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  suggestion_ids: string[]
  external_blocked: boolean
  error_message?: string
}
