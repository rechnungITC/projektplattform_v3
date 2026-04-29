/**
 * PROJ-12 — domain types for KI runs, suggestions, and provenance.
 */

export type KiRunStatus = "success" | "error" | "external_blocked"
export type KiProviderName = "anthropic" | "stub" | "ollama"
export type KiPurpose = "risks" | "decisions" | "work_items" | "open_items"
export type KiSuggestionStatus = "draft" | "accepted" | "rejected"

export interface KiRun {
  id: string
  tenant_id: string
  project_id: string
  actor_user_id: string | null
  purpose: KiPurpose
  classification: 1 | 2 | 3
  provider: KiProviderName
  model_id: string | null
  status: KiRunStatus
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number | null
  error_message: string | null
  created_at: string
}

export interface KiRiskSuggestionPayload {
  title: string
  description: string | null
  probability: number
  impact: number
  status: "open" | "mitigated" | "accepted" | "closed"
  mitigation: string | null
}

export interface KiSuggestion {
  id: string
  tenant_id: string
  project_id: string
  ki_run_id: string
  purpose: KiPurpose
  payload: KiRiskSuggestionPayload
  original_payload: KiRiskSuggestionPayload
  is_modified: boolean
  status: KiSuggestionStatus
  accepted_entity_type: string | null
  accepted_entity_id: string | null
  rejection_reason: string | null
  created_by: string
  created_at: string
  updated_at: string
  accepted_at: string | null
  rejected_at: string | null
}

export interface KiProvenance {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  ki_suggestion_id: string
  was_modified: boolean
  created_at: string
}
