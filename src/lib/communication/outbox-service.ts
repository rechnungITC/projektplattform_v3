/**
 * PROJ-13 — outbox dispatch service.
 *
 * Orchestrates the send of a single `communication_outbox` row:
 *
 *   1. Class-3 hard block (defense-in-depth on top of PROJ-12 routing):
 *      if the row was AI-drafted and metadata.ki_run_id points at a run
 *      with classification=3, external channels (email/slack/teams) are
 *      forbidden and the row terminates as `suppressed`. The internal
 *      channel always remains permitted — Class-3 data may stay inside
 *      the tenant.
 *   2. Pick the adapter via `getChannelAdapter` and call `dispatch`.
 *   3. Update the outbox row to its terminal state (`sent` / `failed` /
 *      `suppressed`). The audit trigger picks the status flip up
 *      automatically (see migration 20260429230000).
 *
 * The service is invoked from the `/send` API route. Calls run with the
 * caller's RLS context — the route already verified write permission, so
 * the UPDATE here will succeed under the editor/lead/admin policy.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  Channel,
  CommunicationOutboxEntry,
  OutboxMetadata,
} from "@/types/communication"

import { getChannelAdapter } from "./channels/selector"
import type { DispatchOutcome } from "./channels/types"

interface DispatchOutboxArgs {
  supabase: SupabaseClient
  outbox: CommunicationOutboxEntry
}

export interface DispatchResult {
  status: "sent" | "failed" | "suppressed"
  error_detail: string | null
  /** True if the row was suppressed because of a Class-3 ki_runs link. */
  class3_blocked: boolean
  /** True if the channel adapter ran in stub mode (e.g. no RESEND key). */
  stub: boolean
}

const EXTERNAL_CHANNELS: ReadonlySet<Channel> = new Set([
  "email",
  "slack",
  "teams",
])

const SELECT_COLUMNS =
  "id, tenant_id, project_id, channel, recipient, subject, body, metadata, status, error_detail, sent_at, created_by, created_at, updated_at"

/**
 * Look up the linked ki_run (if any) and decide whether this outbox row
 * is allowed to leave the tenant. Returns true only when the link is
 * present AND the run is Class-3 AND the channel is external.
 */
async function isClass3Blocked(
  supabase: SupabaseClient,
  channel: Channel,
  metadata: OutboxMetadata
): Promise<boolean> {
  if (!EXTERNAL_CHANNELS.has(channel)) return false
  const runId = metadata.ki_run_id
  if (!runId || typeof runId !== "string") return false

  const { data } = await supabase
    .from("ki_runs")
    .select("classification")
    .eq("id", runId)
    .maybeSingle()

  if (!data) return false
  return data.classification === 3
}

export async function dispatchOutboxRow({
  supabase,
  outbox,
}: DispatchOutboxArgs): Promise<{
  result: DispatchResult
  row: CommunicationOutboxEntry | null
}> {
  if (outbox.status !== "draft" && outbox.status !== "queued") {
    return {
      result: {
        status: outbox.status === "sent" ? "sent" : "failed",
        error_detail: `Outbox row in terminal status "${outbox.status}".`,
        class3_blocked: false,
        stub: false,
      },
      row: null,
    }
  }

  const blockedByClass3 = await isClass3Blocked(
    supabase,
    outbox.channel,
    outbox.metadata
  )

  let outcome: DispatchOutcome
  if (blockedByClass3) {
    outcome = {
      ok: false,
      error_detail:
        "class-3-suppressed: AI-Entwurf basiert auf Klasse-3-Daten und darf nicht extern versendet werden.",
    }
  } else {
    const adapter = getChannelAdapter(outbox.channel)
    outcome = await adapter.dispatch({
      recipient: outbox.recipient,
      subject: outbox.subject,
      body: outbox.body,
      metadata: outbox.metadata,
    })
  }

  const now = new Date().toISOString()
  const updatePayload = outcome.ok
    ? {
        status: "sent" as const,
        sent_at: now,
        error_detail: null,
      }
    : {
        status: blockedByClass3 ? ("suppressed" as const) : ("failed" as const),
        sent_at: null,
        error_detail: outcome.error_detail,
      }

  const { data: updated, error: updateErr } = await supabase
    .from("communication_outbox")
    .update(updatePayload)
    .eq("id", outbox.id)
    .select(SELECT_COLUMNS)
    .single()

  if (updateErr) {
    return {
      result: {
        status: "failed",
        error_detail: `outbox_update_failed: ${updateErr.message}`,
        class3_blocked: blockedByClass3,
        stub: false,
      },
      row: null,
    }
  }

  return {
    result: {
      status: updatePayload.status,
      error_detail: updatePayload.error_detail,
      class3_blocked: blockedByClass3,
      stub: outcome.ok ? outcome.stub : false,
    },
    row: updated as CommunicationOutboxEntry,
  }
}
