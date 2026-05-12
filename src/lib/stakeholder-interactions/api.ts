/**
 * PROJ-34-α — Client-side API helpers for stakeholder interactions.
 *
 * Mirrors the pattern from src/lib/stakeholder-profiles/api.ts: fetch +
 * throw on non-ok with structured error parsing.
 */

export interface InteractionParticipant {
  interaction_id: string
  stakeholder_id: string
  participant_sentiment: number | null
  participant_sentiment_source:
    | "manual"
    | "ai_proposed"
    | "ai_accepted"
    | "ai_rejected"
    | null
  participant_cooperation_signal: number | null
  participant_cooperation_signal_source:
    | "manual"
    | "ai_proposed"
    | "ai_accepted"
    | "ai_rejected"
    | null
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
