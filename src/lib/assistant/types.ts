export const ASSISTANT_INTENTS = [
  "project_status_query",
  "project_open",
  "project_create_draft",
  "navigate_to_area",
  "report_summary_query",
  "needs_clarification",
  "unknown",
] as const

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number]

export type AssistantModality = "text" | "voice"

export type AssistantResultStatus =
  | "success"
  | "needs_clarification"
  | "blocked"
  | "failed"

export type AssistantConfirmationState =
  | "not_required"
  | "required"
  | "confirmed"
  | "cancelled"

export type AssistantToolStatus =
  | "planned"
  | "executed"
  | "blocked"
  | "failed"

export interface AssistantToolCall {
  key: string
  label: string
  status: AssistantToolStatus
  metadata?: Record<string, unknown>
}

export interface AssistantRouteTarget {
  href: string
  label: string
}

export interface AssistantProjectChoice {
  id: string
  name: string
  lifecycle_status: string
}

export interface AssistantWizardDraftRef {
  id: string
  name: string | null
  href: string
}

export interface AssistantRuntimeResult {
  recognized_intent: AssistantIntent
  requires_confirmation: boolean
  confirmation_state: AssistantConfirmationState
  result_status: AssistantResultStatus
  user_response: string
  project_id: string | null
  route_target: AssistantRouteTarget | null
  project_choices: AssistantProjectChoice[]
  wizard_draft: AssistantWizardDraftRef | null
  tool_calls: AssistantToolCall[]
  transcript_persistence: "none" | "metadata" | "redacted"
}
