/**
 * PROJ-34-α — Client-side API helpers for stakeholder interactions.
 *
 * Mirrors the pattern from src/lib/stakeholder-profiles/api.ts: fetch +
 * throw on non-ok with structured error parsing.
 */

export type ParticipantSignalSource =
  | "manual"
  | "ai_proposed"
  | "ai_accepted"
  | "ai_rejected"

export interface InteractionParticipant {
  interaction_id: string
  stakeholder_id: string
  participant_sentiment: number | null
  participant_sentiment_source: ParticipantSignalSource | null
  participant_cooperation_signal: number | null
  participant_cooperation_signal_source: ParticipantSignalSource | null
  // PROJ-34-γ.2 — AI-proposal metadata. Confidence is per-participant
  // (γ.1 router writes a single confidence per SentimentSignal that
  // covers both sentiment + cooperation). Provider/model live on the
  // sentiment column set; cooperation reuses the same run.
  participant_sentiment_confidence?: number | null
  participant_sentiment_model?: string | null
  participant_sentiment_provider?: string | null
}

export interface StakeholderInteraction {
  id: string
  tenant_id: string
  project_id: string
  channel: "email" | "meeting" | "chat" | "phone" | "other"
  direction: "inbound" | "outbound" | "bidirectional"
  interaction_date: string
  summary: string
  awaiting_response: boolean
  response_due_date: string | null
  response_received_date: string | null
  replies_to_interaction_id: string | null
  created_by: string | null
  source: "manual" | "context_ingestion" | "assistant"
  source_context_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  participants: InteractionParticipant[]
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; field?: string }
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let msg = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as ApiErrorBody
      msg = body.error?.message ?? msg
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(msg)
  }
  return (await response.json()) as T
}

export async function listInteractions(
  projectId: string,
  stakeholderId: string,
): Promise<StakeholderInteraction[]> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/stakeholders/${encodeURIComponent(stakeholderId)}/interactions`,
    { cache: "no-store" },
  )
  const body = await unwrap<{ interactions: StakeholderInteraction[] }>(res)
  return body.interactions
}

export interface CreateInteractionPayload {
  channel: StakeholderInteraction["channel"]
  direction: StakeholderInteraction["direction"]
  interaction_date: string
  summary: string
  awaiting_response?: boolean
  response_due_date?: string | null
  replies_to_interaction_id?: string | null
  source?: StakeholderInteraction["source"]
  additional_participants?: Array<{ stakeholder_id: string }>
}

export async function createInteraction(
  projectId: string,
  stakeholderId: string,
  payload: CreateInteractionPayload,
): Promise<StakeholderInteraction> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/stakeholders/${encodeURIComponent(stakeholderId)}/interactions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  )
  const body = await unwrap<{ interaction: StakeholderInteraction }>(res)
  return body.interaction
}

export interface AwaitingInteraction {
  id: string
  channel: StakeholderInteraction["channel"]
  direction: StakeholderInteraction["direction"]
  interaction_date: string
  summary: string
  response_due_date: string | null
  response_received_date: string | null
  created_at: string
  is_overdue: boolean
}

export async function listAwaitingInteractions(
  projectId: string,
  stakeholderId: string,
): Promise<AwaitingInteraction[]> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/stakeholders/${encodeURIComponent(stakeholderId)}/interactions/awaiting`,
    { cache: "no-store" },
  )
  const body = await unwrap<{ interactions: AwaitingInteraction[] }>(res)
  return body.interactions
}

export interface UpdateInteractionPayload {
  channel?: StakeholderInteraction["channel"]
  direction?: StakeholderInteraction["direction"]
  interaction_date?: string
  summary?: string
  awaiting_response?: boolean
  response_due_date?: string | null
  response_received_date?: string | null
  replies_to_interaction_id?: string | null
}

export async function updateInteraction(
  projectId: string,
  interactionId: string,
  payload: UpdateInteractionPayload,
): Promise<StakeholderInteraction> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/interactions/${encodeURIComponent(interactionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  )
  const body = await unwrap<{ interaction: StakeholderInteraction }>(res)
  return body.interaction
}

export interface UpdateParticipantSignalPayload {
  participant_sentiment?: number | null
  participant_cooperation_signal?: number | null
}

export async function updateParticipantSignal(
  projectId: string,
  interactionId: string,
  stakeholderId: string,
  payload: UpdateParticipantSignalPayload,
): Promise<InteractionParticipant> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/interactions/${encodeURIComponent(interactionId)}/participants/${encodeURIComponent(stakeholderId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  )
  const body = await unwrap<{ participant: InteractionParticipant }>(res)
  return body.participant
}

// ---------------------------------------------------------------------------
// PROJ-34-γ.2 — AI Sentiment Review
// ---------------------------------------------------------------------------

export type AIReviewDecisionKind = "accept" | "reject" | "modify"

export interface AIReviewDecision {
  stakeholder_id: string
  decision: AIReviewDecisionKind
  overrides?: {
    sentiment?: number | null
    cooperation?: number | null
  }
}

export interface AIReviewRunMetadata {
  provider: string | null
  model: string | null
  status: "success" | "external_blocked" | "error" | "pending"
  confidence_avg: number | null
}

/**
 * Triggers `invokeSentimentGeneration` server-side for this interaction.
 * Backend writes per-participant `_source = 'ai_proposed'` rows on success.
 * Returns the run metadata so the UI can render a Stub/external_blocked banner
 * before re-fetching the participants.
 */
export async function triggerSentimentReview(
  projectId: string,
  interactionId: string,
): Promise<AIReviewRunMetadata> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/interactions/${encodeURIComponent(interactionId)}/sentiment-trigger`,
    { method: "POST" },
  )
  const body = await unwrap<{ run: AIReviewRunMetadata }>(res)
  return body.run
}

/**
 * Batches Accept / Reject / Modify decisions for all open ai_proposed rows
 * on this interaction. Backend transitions each row's `_source` to
 * `ai_accepted` / `ai_rejected` / `manual` (Modify) atomically.
 */
export async function submitAIReviewBatch(
  projectId: string,
  interactionId: string,
  decisions: AIReviewDecision[],
): Promise<{ updated_participants: InteractionParticipant[] }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/interactions/${encodeURIComponent(interactionId)}/ai-review`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions }),
    },
  )
  return unwrap<{ updated_participants: InteractionParticipant[] }>(res)
}

export async function deleteInteraction(
  projectId: string,
  interactionId: string,
): Promise<void> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/interactions/${encodeURIComponent(interactionId)}`,
    { method: "DELETE" },
  )
  if (!res.ok && res.status !== 204) {
    let msg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as ApiErrorBody
      msg = body.error?.message ?? msg
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
}
