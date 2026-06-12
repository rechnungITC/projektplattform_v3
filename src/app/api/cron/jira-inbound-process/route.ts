/**
 * PROJ-50 — Jira inbound drain cron.
 *
 *   GET /api/cron/jira-inbound-process
 *
 * Picks a bounded batch of `received` jira_inbound_events and processes each
 * via `processInboundEvent`: resolve the linked work item through
 * external_refs, apply clean fast-forwards (title/description), record
 * conflicts otherwise, advance the inbound sync baseline. Unknown issue keys
 * → 'ignored'; deleted work items → 'quarantined'; DB errors → 'failed' with a
 * bounded attempt counter.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Service-role
 * client (no user session) — RLS would otherwise hide cross-tenant rows.
 */

import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { processInboundEvent } from "@/lib/jira/inbound"

const BATCH_SIZE = 50
const MAX_ATTEMPTS = 5

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return apiError("configuration_error", "CRON_SECRET is not set on the server.", 500)
  }
  const authHeader = request.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${expected}`) {
    return apiError("unauthorized", "Invalid or missing cron secret.", 401)
  }

  const admin = createAdminClient()

  const { data: events, error } = await admin
    .from("jira_inbound_events")
    .select("id, tenant_id, jira_issue_key, raw_payload_digest, attempt")
    .eq("status", "received")
    .order("received_at", { ascending: true })
    .limit(BATCH_SIZE)

  if (error) return apiError("internal_error", error.message, 500)

  const rows = (events ?? []) as Array<{
    id: string
    tenant_id: string
    jira_issue_key: string
    raw_payload_digest: { fields?: { summary?: string | null; description?: string | null; status?: string | null } } | null
    attempt: number
  }>

  let processed = 0
  let ignored = 0
  let quarantined = 0
  let failed = 0
  let conflicts = 0
  let applied = 0
  const now = new Date().toISOString()

  for (const row of rows) {
    const result = await processInboundEvent(admin, {
      id: row.id,
      tenant_id: row.tenant_id,
      jira_issue_key: row.jira_issue_key,
      raw_payload_digest: row.raw_payload_digest,
    })

    if (result.status === "failed") {
      const nextAttempt = row.attempt + 1
      // Exhausted retries → park as 'failed' terminal; else leave 'received'
      // for the next tick (bounded backoff via attempt counter).
      await admin
        .from("jira_inbound_events")
        .update({
          attempt: nextAttempt,
          sanitized_error: result.error?.slice(0, 500) ?? "unknown",
          status: nextAttempt >= MAX_ATTEMPTS ? "failed" : "received",
          processed_at: nextAttempt >= MAX_ATTEMPTS ? now : null,
        })
        .eq("id", row.id)
        .eq("status", "received")
      failed++
      continue
    }

    await admin
      .from("jira_inbound_events")
      .update({ status: result.status, processed_at: now })
      .eq("id", row.id)
      .eq("status", "received")

    if (result.status === "processed") processed++
    else if (result.status === "ignored") ignored++
    else if (result.status === "quarantined") quarantined++
    conflicts += result.conflicts.length
    applied += result.applied.length
  }

  return NextResponse.json({
    inspected: rows.length,
    processed,
    ignored,
    quarantined,
    failed,
    conflicts_created: conflicts,
    fields_applied: applied,
  })
}
