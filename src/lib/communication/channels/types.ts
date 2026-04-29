/**
 * PROJ-13 — channel adapter Strategy interface.
 *
 * Each channel implementation (internal, email, slack, teams) exposes the
 * same `dispatch()` shape so the outbox-service can pick one based on the
 * row's `channel` column without caring about wire details.
 *
 * All adapters are server-only (run in API routes / server components).
 */

import type { Channel } from "@/types/communication"

export interface DispatchInput {
  recipient: string
  subject: string | null
  body: string
  /** Open bag — PROJ-12 ki_run_id, future provider hints, etc. */
  metadata: Record<string, unknown>
}

export type DispatchOutcome =
  | {
      ok: true
      provider_message_id?: string
      /** True when the adapter ran in stub mode (e.g. RESEND_API_KEY missing). */
      stub: boolean
    }
  | {
      ok: false
      error_detail: string
      /** True when the adapter is a placeholder (slack/teams in MVP). */
      not_implemented?: boolean
    }

export interface ChannelAdapter {
  readonly channel: Channel
  dispatch(input: DispatchInput): Promise<DispatchOutcome>
}
