/**
 * PROJ-13 — fetch wrappers for the communication center.
 *
 * Used from the project-room communication tab. All endpoints are
 * scoped to a project; module gating + RLS are enforced server-side,
 * so callers don't need to pre-check anything.
 */

import type {
  Channel,
  ChatMessage,
  CommunicationOutboxEntry,
  OutboxMetadata,
  OutboxStatus,
} from "@/types/communication"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

const outboxBase = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/communication/outbox`

const chatBase = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/communication/chat`

// ─── Outbox ───────────────────────────────────────────────────────────

export interface OutboxListOptions {
  channel?: Channel
  status?: OutboxStatus
}

export async function listOutbox(
  projectId: string,
  options: OutboxListOptions = {}
): Promise<CommunicationOutboxEntry[]> {
  const params = new URLSearchParams()
  if (options.channel) params.set("channel", options.channel)
  if (options.status) params.set("status", options.status)
  const qs = params.toString()
  const url = qs ? `${outboxBase(projectId)}?${qs}` : outboxBase(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { outbox: CommunicationOutboxEntry[] }
  return body.outbox ?? []
}

export interface OutboxDraftInput {
  channel: Channel
  recipient: string
  subject?: string | null
  body: string
  metadata?: OutboxMetadata
}

export async function createOutboxDraft(
  projectId: string,
  input: OutboxDraftInput
): Promise<CommunicationOutboxEntry> {
  const response = await fetch(outboxBase(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { outbox: CommunicationOutboxEntry }
  return body.outbox
}

export async function updateOutboxDraft(
  projectId: string,
  outboxId: string,
  input: Partial<OutboxDraftInput>
): Promise<CommunicationOutboxEntry> {
  const response = await fetch(
    `${outboxBase(projectId)}/${encodeURIComponent(outboxId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { outbox: CommunicationOutboxEntry }
  return body.outbox
}

export async function deleteOutboxDraft(
  projectId: string,
  outboxId: string
): Promise<void> {
  const response = await fetch(
    `${outboxBase(projectId)}/${encodeURIComponent(outboxId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

export interface DispatchSummary {
  status: "sent" | "failed" | "suppressed"
  error_detail: string | null
  class3_blocked: boolean
  stub: boolean
}

export async function sendOutbox(
  projectId: string,
  outboxId: string
): Promise<{
  outbox: CommunicationOutboxEntry
  dispatch: DispatchSummary
}> {
  const response = await fetch(
    `${outboxBase(projectId)}/${encodeURIComponent(outboxId)}/send`,
    { method: "POST" }
  )
  if (!response.ok && response.status !== 202) {
    throw new Error(await safeError(response))
  }
  return (await response.json()) as {
    outbox: CommunicationOutboxEntry
    dispatch: DispatchSummary
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────

export async function listChat(
  projectId: string,
  options: { limit?: number } = {}
): Promise<ChatMessage[]> {
  const url = options.limit
    ? `${chatBase(projectId)}?limit=${options.limit}`
    : chatBase(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { messages: ChatMessage[] }
  return body.messages ?? []
}

export async function postChat(
  projectId: string,
  body: string
): Promise<ChatMessage> {
  const response = await fetch(chatBase(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const json = (await response.json()) as { message: ChatMessage }
  return json.message
}
