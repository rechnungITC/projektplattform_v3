/**
 * PROJ-5 — wizard data types.
 *
 * `WizardData` is the accumulator across all 5 steps. `WizardDraft` is the
 * persisted-server representation; in the frontend phase it lives in
 * localStorage, the /backend phase moves it to the `project_wizard_drafts`
 * Supabase table with RLS.
 */

import type { ProjectMethod } from "@/types/project-method"
import type { ProjectType } from "@/types/project"

export const WIZARD_STEPS = [
  "basics",
  "type",
  "method",
  "followups",
  "ki_backlog",
  "clarifying",
  "review",
] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  basics: "Stammdaten",
  type: "Projekttyp",
  method: "Methode",
  followups: "Detail-Fragen",
  ki_backlog: "KI-Backlog",
  clarifying: "Rückfragen",
  review: "Review",
}

/**
 * PROJ-70-ε — `ki_backlog` is an OPTIONAL step (toggle on the basics step).
 * PROJ-135 — `clarifying` is an OPTIONAL step that only appears once a kickoff
 * artefact has actually been UPLOADED (a `context_source_id` exists). Both are
 * filtered out of the active flow otherwise; the full `WIZARD_STEPS` catalog
 * still drives the stepper/labels.
 */
export function visibleWizardSteps(
  kiBacklogEnabled: boolean,
  kickoffUploaded = false,
): WizardStep[] {
  return WIZARD_STEPS.filter((s) => {
    if (s === "ki_backlog") return kiBacklogEnabled
    if (s === "clarifying") return kickoffUploaded
    return true
  })
}

/**
 * The full wizard answer set. Step 4 fills `type_specific_data` based on
 * the required_info catalog from PROJ-6 — keys come from
 * `RequiredInfo.key` (e.g. `target_systems`, `business_units`).
 */
export interface WizardData {
  // Step 1: Basics
  name: string
  description: string
  project_number: string
  planned_start_date: string | null
  planned_end_date: string | null
  responsible_user_id: string

  // Step 2
  project_type: ProjectType | null

  // Step 3 — null = "not yet decided", spec allows that at creation
  project_method: ProjectMethod | null

  // Step 4 — keyed by RequiredInfo.key, value = user answer text
  type_specific_data: Record<string, string>

  // PROJ-70-ε — optional KI-Backlog generation from a kickoff artefact.
  // `enabled` toggles the `ki_backlog` step; `context_source_id` +
  // `filename` are filled once the user uploads a file in that step.
  // The whole block lives in the draft's `.passthrough()` JSON payload —
  // no DB schema change.
  ki_backlog: KiBacklogData

  // PROJ-135 — optional dialogic clarifying-questions answers. Populated by
  // the (β) `clarifying` wizard step; on finalize the answered Q&A is appended
  // to the kickoff context_source's content_excerpt. Lives in the draft's
  // passthrough JSON — no DB schema change. Optional: absent for the manual
  // (no-kickoff) path and for pre-PROJ-135 drafts.
  clarifying?: ClarifyingData
}

export interface KiBacklogData {
  enabled: boolean
  context_source_id: string | null
  filename: string | null
}

/** PROJ-135 — one answered clarifying question. Skipped questions are omitted. */
export interface ClarifyingAnswer {
  question: string
  answer: string
  gap_tag?: string | null
}

/** PROJ-135 — a generated clarifying question (persisted for render/resume). */
export interface ClarifyingQuestionItem {
  question: string
  rationale: string | null
  gap_tag: string | null
}

/** Last generation outcome — drives the step's fail-open render states. */
export type ClarifyingStatus =
  | "idle"
  | "ready"
  | "empty"
  | "blocked"
  | "error"

export interface ClarifyingData {
  /** Generated questions (persisted so navigating back doesn't re-generate). */
  questions?: ClarifyingQuestionItem[]
  /** Answered (non-skipped, non-empty) Q&A — the ONLY field finalize reads. */
  answers: ClarifyingAnswer[]
  /** Last generation outcome for render (not read by finalize). */
  status?: ClarifyingStatus
}

export function emptyKiBacklogData(): KiBacklogData {
  return { enabled: false, context_source_id: null, filename: null }
}

export function emptyWizardData(responsibleUserId: string): WizardData {
  return {
    name: "",
    description: "",
    project_number: "",
    planned_start_date: null,
    planned_end_date: null,
    responsible_user_id: responsibleUserId,
    project_type: null,
    project_method: null,
    type_specific_data: {},
    ki_backlog: emptyKiBacklogData(),
  }
}

/**
 * Persisted draft — id and timestamps come from the backend; until the
 * /backend phase, the localStorage adapter generates the id and timestamps.
 */
export interface WizardDraft {
  id: string
  tenant_id: string
  created_by: string
  name: string | null
  project_type: ProjectType | null
  project_method: ProjectMethod | null
  data: WizardData
  created_at: string
  updated_at: string
}
