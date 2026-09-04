/**
 * PROJ-Y-5a — shared frontend contract for the skill-guided project context.
 *
 * During project creation this shape lives inside the owner-only wizard draft.
 * The backend stage will persist the reviewed projection as an immutable
 * project-context revision and return the same semantic fields to the
 * project-room read view.
 */

export const PROJECT_CONTEXT_COVERAGE_STATES = [
  "needs_clarification",
  "sufficient",
  "unknown",
  "not_applicable",
  "skipped",
] as const

export type ProjectContextCoverageState =
  (typeof PROJECT_CONTEXT_COVERAGE_STATES)[number]

export const PROJECT_CONTEXT_STATEMENT_ORIGINS = [
  "wizard_selection",
  "user_answer",
  "kickoff_evidence",
  "ai_interpretation",
] as const

export type ProjectContextStatementOrigin =
  (typeof PROJECT_CONTEXT_STATEMENT_ORIGINS)[number]

export const PROJECT_CONTEXT_ANALYSIS_STATUSES = [
  "captured_not_ai_analyzed",
  "ai_analyzed",
  "ai_interrupted",
] as const

export type ProjectContextAnalysisStatus =
  (typeof PROJECT_CONTEXT_ANALYSIS_STATUSES)[number]

export const PROJECT_CONTEXT_REASON_CODES = [
  "no_provider",
  "class3_blocked",
  "provider_error",
  "cost_cap_exceeded",
  "external_ai_disabled",
] as const

export type ProjectContextReasonCode =
  (typeof PROJECT_CONTEXT_REASON_CODES)[number]

export interface ProjectContextStatement {
  id: string
  text: string
  origin: ProjectContextStatementOrigin
  source_label: string
  confirmed: boolean
  affected_skill_version_ids: string[]
}

export interface ProjectContextTurn {
  id: string
  role: "user" | "assistant"
  content: string
  status: "complete" | "interrupted"
}

export interface ProjectContextSkillCoverage {
  skill_id: string
  /** Null is a visible unresolved snapshot; the backend resolves authoritatively. */
  skill_version_id: string | null
  skill_name: string
  state: ProjectContextCoverageState
  evidence_statement_ids: string[]
  stale: boolean
}

export interface ProjectContextData {
  summary: string
  statements: ProjectContextStatement[]
  turns: ProjectContextTurn[]
  skill_coverage: ProjectContextSkillCoverage[]
  gaps: string[]
  assumptions: string[]
  contradictions: string[]
  analysis_status: ProjectContextAnalysisStatus
  reason_code: ProjectContextReasonCode | null
  finished: boolean
}

export function emptyProjectContextData(): ProjectContextData {
  return {
    summary: "",
    statements: [],
    turns: [],
    skill_coverage: [],
    gaps: [],
    assumptions: [],
    contradictions: [],
    analysis_status: "captured_not_ai_analyzed",
    reason_code: null,
    finished: false,
  }
}

export interface ProjectContextDocumentView {
  id: string
  project_id: string
  revision_number: number
  created_at: string
  created_by_name: string | null
  confidentiality_level: "standard" | "confidential" | "strict"
  context: ProjectContextData
  /** Null means the narrower transcript permission was not granted. */
  transcript: ProjectContextTurn[] | null
}
