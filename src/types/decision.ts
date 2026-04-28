/**
 * PROJ-20 — decision types. Decisions are immutable: revisions are new rows
 * with `supersedes_decision_id` pointing at the predecessor; the predecessor's
 * `is_revised` flag flips to true via DB trigger.
 */

export interface Decision {
  id: string
  tenant_id: string
  project_id: string
  title: string
  decision_text: string
  rationale: string | null
  decided_at: string
  decider_stakeholder_id: string | null
  context_phase_id: string | null
  context_risk_id: string | null
  supersedes_decision_id: string | null
  is_revised: boolean
  created_by: string
  created_at: string
}
