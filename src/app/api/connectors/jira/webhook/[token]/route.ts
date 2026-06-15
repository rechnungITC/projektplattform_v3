/**
 * PROJ-50 — Jira inbound webhook receiver (PUBLIC route).
 *
 *   POST /api/connectors/jira/webhook/[token]
 *
 * Jira Cloud calls this without a Supabase session, so the route is in
 * PUBLIC_ROUTES and authenticates by hashing the URL `token` against
 * `jira_webhook_tokens` (raw token never stored). On a match it appends one
 * `jira_inbound_events` row — idempotent on (tenant_id, delivery_id) so a
 * re-delivered webhook is a no-op — and returns 200 fast. It does NOT process
 * inline; the `/api/cron/jira-inbound-process` drain does that.
 *
 * Security: invalid/revoked token → 401 with a generic message (no tenant
 * leak). The token is never logged. Uses the service-role client because
 * there is no user session (the token IS the credential).
 */

import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  buildPayloadDigest,
  hashWebhookToken,
  parseJiraWebhook,
} from "@/lib/jira/inbound"

interface Ctx {
  params: Promise<{ token: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const tokenHash = hashWebhookToken(token)

  const { data: tokenRow, error: tokenErr } = await admin
    .from("jira_webhook_tokens")
    .select("id, tenant_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (tokenErr) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
  if (!tokenRow || (tokenRow as { revoked_at: string | null }).revoked_at) {
    // Generic — never reveal whether the token existed or which tenant.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const tenantId = (tokenRow as { tenant_id: string }).tenant_id

  // Parse the body defensively; a malformed body still acks (200) so Jira
  // does not enter a retry storm, but is not queued.
  const rawBody = await request.text()
  let payload: unknown = {}
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable_body" }, { status: 200 })
  }

  const parsed = parseJiraWebhook(
    payload,
    request.headers.get("x-atlassian-webhook-identifier"),
    rawBody,
  )

  if (!parsed.issueKey) {
    // No issue key → nothing to link; ack without queueing.
    return NextResponse.json({ ok: true, ignored: "no_issue_key" }, { status: 200 })
  }

  // Idempotent append: a duplicate (tenant_id, delivery_id) is a no-op.
  const { error: insErr } = await admin
    .from("jira_inbound_events")
    .upsert(
      {
        tenant_id: tenantId,
        provider: "jira",
        jira_issue_key: parsed.issueKey,
        delivery_id: parsed.deliveryId,
        event_type: parsed.eventType,
        raw_payload_digest: buildPayloadDigest(parsed),
        status: "received",
      },
      { onConflict: "tenant_id,delivery_id", ignoreDuplicates: true },
    )

  if (insErr) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }

  // Best-effort last-used stamp (never blocks the ack).
  await admin
    .from("jira_webhook_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", (tokenRow as { id: string }).id)

  return NextResponse.json({ ok: true }, { status: 200 })
}
