/**
 * PROJ-13 — communication center types.
 */

export type Channel = "internal" | "email" | "slack" | "teams"
export const CHANNELS: readonly Channel[] = [
  "internal",
  "email",
  "slack",
  "teams",
] as const

export const CHANNEL_LABELS: Record<Channel, string> = {
  internal: "Intern",
  email: "E-Mail",
  slack: "Slack",
  teams: "Teams",
}

export type OutboxStatus =
  | "draft"
  | "queued"
  | "sent"
  | "failed"
  | "suppressed"

export const OUTBOX_STATUSES: readonly OutboxStatus[] = [
  "draft",
  "queued",
  "sent",
  "failed",
  "suppressed",
] as const

export const OUTBOX_STATUS_LABELS: Record<OutboxStatus, string> = {
  draft: "Entwurf",
  queued: "Wartet",
  sent: "Gesendet",
  failed: "Fehlgeschlagen",
  suppressed: "Unterdrückt",
}

/**
 * Open metadata bag stored on each outbox row. PROJ-12 sets `ki_run_id`
 * when the body was AI-drafted; the dispatcher cross-references the
 * `ki_runs.classification` to decide whether external channels are
 * permitted (Class-3 → suppressed).
 */
export interface OutboxMetadata {
  ki_run_id?: string
  ki_drafted?: boolean
  /** Free-form. Adapters may stash provider response IDs here. */
  [key: string]: unknown
}

export interface CommunicationOutboxEntry {
  id: string
  tenant_id: string
  project_id: string
  channel: Channel
  recipient: string
  subject: string | null
  body: string
  metadata: OutboxMetadata
  status: OutboxStatus
  error_detail: string | null
  sent_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  tenant_id: string
  project_id: string
  sender_user_id: string | null
  body: string
  created_at: string
}
