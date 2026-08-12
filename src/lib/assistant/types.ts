export const ASSISTANT_INTENTS = [
  "project_status_query",
  "project_open",
  "project_create_draft",
  // PROJ-144 — zweites mutierendes Aktionspaket. Die Intent-Spalten in
  // assistant_turns/-action_events sind freier Text OHNE CHECK, ein neuer Wert
  // braucht daher keine Migration (Tech Design D8).
  "work_item_create_draft",
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

/**
 * PROJ-144 — ein gespeicherter Sprach-Entwurf, noch KEIN Work-Item.
 * Er entsteht in Schritt 1 und wird erst durch die ausdrückliche Bestätigung
 * in Schritt 2 zu einem echten Work-Item (AC-144.15/144.16).
 */
export interface AssistantWorkItemDraftRef {
  id: string
  title: string
  description: string | null
  /** Die aus der Projektmethode abgeleitete Art. */
  target_kind: string
  /** Die vom Nutzer genannte Art — weicht sie ab, erklärt die Oberfläche das. */
  requested_kind: string | null
  /** true, wenn die Methode eine andere Art erzwungen hat (AC-144.8). */
  kind_was_mapped: boolean
  project_id: string
  project_name: string
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
  work_item_draft: AssistantWorkItemDraftRef | null
  tool_calls: AssistantToolCall[]
  transcript_persistence: "none" | "metadata" | "redacted"
}
