/**
 * PROJ-50 — Bidirectional Jira Sync, inbound service.
 *
 * Pure-ish helpers + the drain logic shared by the webhook receiver
 * (`/api/connectors/jira/webhook/[token]`) and the drain cron
 * (`/api/cron/jira-inbound-process`).
 *
 * Security/governance posture (Tech Design + invariant #2):
 *   - The webhook is PUBLIC; it resolves the tenant by hashing the URL token
 *     against `jira_webhook_tokens` (raw token never stored). No secret is
 *     ever logged.
 *   - The drain auto-applies ONLY a clean fast-forward (V3 side unchanged
 *     since the last sync) on a safe field whitelist (title/description),
 *     through the same DB CHECK constraints native mutations hit. Any
 *     concurrent local change → a reviewable `jira_sync_conflicts` row,
 *     never a silent overwrite. `status` is conflict-only in α (reverse
 *     status-mapping + enum validation is deferred to β). `kind`/parent
 *     reparenting inbound is out of scope.
 */

import { createHash, randomBytes } from "crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

/** Fields the drain may auto-apply on a clean fast-forward (α whitelist). */
export const INBOUND_AUTOAPPLY_FIELDS = ["title", "description"] as const
export type InboundField = (typeof INBOUND_AUTOAPPLY_FIELDS)[number]

/** Generate a high-entropy raw webhook token (shown once at issue time). */
export function generateWebhookToken(): string {
  return randomBytes(32).toString("hex")
}

/** sha256 hex of a raw token — only the hash is persisted/looked up. */
export function hashWebhookToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex")
}

export interface ParsedJiraInbound {
  issueKey: string | null
  deliveryId: string
  eventType: string | null
  /** Safe, non-secret field snapshot extracted from the webhook payload. */
  fields: {
    summary: string | null
    description: string | null
    status: string | null
  }
}

interface JiraWebhookBody {
  webhookEvent?: unknown
  issue?: {
    key?: unknown
    fields?: {
      summary?: unknown
      description?: unknown
      status?: { name?: unknown } | null
    } | null
  } | null
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/**
 * Parse a Jira Cloud webhook body into a minimal, secret-free shape. The
 * delivery id (for idempotency) comes from the `X-Atlassian-Webhook-Identifier`
 * header when present, else a content hash so replays still de-dupe.
 */
export function parseJiraWebhook(
  payload: unknown,
  headerDeliveryId: string | null,
  rawBodyForHash: string,
): ParsedJiraInbound {
  const body = (payload ?? {}) as JiraWebhookBody
  const issue = body.issue ?? null
  const fields = issue?.fields ?? null
  const description = fields?.description
  return {
    issueKey: asStringOrNull(issue?.key),
    deliveryId:
      headerDeliveryId && headerDeliveryId.length > 0
        ? headerDeliveryId
        : createHash("sha256").update(rawBodyForHash, "utf8").digest("hex"),
    eventType: asStringOrNull(body.webhookEvent),
    fields: {
      summary: asStringOrNull(fields?.summary),
      // Jira descriptions can be ADF objects; α only syncs plain strings.
      description: typeof description === "string" ? description : null,
      status: asStringOrNull(fields?.status?.name),
    },
  }
}

/** A non-secret digest persisted on the event row for ops/debugging. */
export function buildPayloadDigest(parsed: ParsedJiraInbound): Record<string, unknown> {
  return {
    issue_key: parsed.issueKey,
    event_type: parsed.eventType,
    fields: parsed.fields,
  }
}

export interface InboundProcessResult {
  status: "processed" | "ignored" | "quarantined" | "failed"
  applied: InboundField[]
  conflicts: string[]
  error?: string
}

interface InboundEventRow {
  id: string
  tenant_id: string
  jira_issue_key: string
  raw_payload_digest: {
    fields?: { summary?: string | null; description?: string | null; status?: string | null }
  } | null
}

/** Map a Jira field name to the V3 work_items column for the whitelist. */
function jiraValueForField(
  field: InboundField,
  jiraFields: { summary?: string | null; description?: string | null },
): string | null {
  const v = field === "title" ? jiraFields.summary : jiraFields.description
  return v ?? null
}

/**
 * Process one `received` inbound event with the service-role client.
 * Resolves the work item via `external_refs`, applies clean fast-forwards,
 * records conflicts otherwise, and advances the inbound sync baseline.
 *
 * Returns the terminal status to stamp on the event row. Never throws for
 * business outcomes (unknown key → ignored); only re-throws nothing — DB
 * errors are returned as `failed`.
 */
export async function processInboundEvent(
  admin: SupabaseClient,
  event: InboundEventRow,
): Promise<InboundProcessResult> {
  const jiraFields = event.raw_payload_digest?.fields ?? {
    summary: null,
    description: null,
    status: null,
  }

  // 1. Resolve the linked work item via external_refs (the PROJ-47 map).
  const { data: ref, error: refErr } = await admin
    .from("external_refs")
    .select("id, project_id, entity_id, metadata")
    .eq("tenant_id", event.tenant_id)
    .eq("provider", "jira")
    .eq("entity_type", "work_item")
    .eq("external_key", event.jira_issue_key)
    .maybeSingle()
  if (refErr) return { status: "failed", applied: [], conflicts: [], error: refErr.message }
  if (!ref) {
    // Unknown issue key — not linked to any V3 work item (ST-01).
    return { status: "ignored", applied: [], conflicts: [] }
  }

  const refRow = ref as {
    id: string
    project_id: string
    entity_id: string
    metadata: Record<string, unknown> | null
  }

  // 2. Load the current work item.
  const { data: wi, error: wiErr } = await admin
    .from("work_items")
    .select("id, tenant_id, project_id, title, description")
    .eq("id", refRow.entity_id)
    .maybeSingle()
  if (wiErr) return { status: "failed", applied: [], conflicts: [], error: wiErr.message }
  if (!wi) {
    // Linked work item was deleted — quarantine for review, don't recreate.
    return { status: "quarantined", applied: [], conflicts: [] }
  }
  const workItem = wi as {
    id: string
    tenant_id: string
    project_id: string
    title: string | null
    description: string | null
  }

  const baseline =
    (refRow.metadata?.inbound_last_synced as
      | Record<string, string | null>
      | undefined) ?? undefined

  const applied: InboundField[] = []
  const conflicts: string[] = []
  const updatePayload: Record<string, string> = {}
  const newBaseline: Record<string, string | null> = { ...(baseline ?? {}) }

  // 3. Field-by-field fast-forward vs. conflict.
  for (const field of INBOUND_AUTOAPPLY_FIELDS) {
    const jiraVal = jiraValueForField(field, jiraFields)
    if (jiraVal === null) continue // field not present in this event
    const current = workItem[field] ?? null
    if (jiraVal === current) {
      newBaseline[field] = jiraVal
      continue // already in sync
    }
    const base = baseline?.[field]
    if (base !== undefined && current === base) {
      // Clean fast-forward: V3 untouched since last sync → apply.
      updatePayload[field] = jiraVal
      applied.push(field)
      newBaseline[field] = jiraVal
    } else {
      // Both sides changed (or no baseline to prove otherwise) → conflict.
      conflicts.push(field)
      await admin.from("jira_sync_conflicts").insert({
        tenant_id: event.tenant_id,
        project_id: workItem.project_id,
        work_item_id: workItem.id,
        external_ref_id: refRow.id,
        field,
        v3_value: current,
        jira_value: jiraVal,
        resolution: "pending",
      })
    }
  }

  // 4. status is conflict-only in α (no reverse status-map auto-apply).
  if (jiraFields.status) {
    newBaseline.status = jiraFields.status
  }

  // 5. Apply the fast-forwarded fields through the same table CHECK
  //    constraints native mutations hit (length, etc.).
  if (Object.keys(updatePayload).length > 0) {
    const { error: updErr } = await admin
      .from("work_items")
      .update(updatePayload)
      .eq("id", workItem.id)
      .eq("project_id", workItem.project_id)
    if (updErr) return { status: "failed", applied: [], conflicts, error: updErr.message }
  }

  // 6. Advance the inbound sync baseline on the external ref.
  const { error: refUpdErr } = await admin
    .from("external_refs")
    .update({
      metadata: {
        ...(refRow.metadata ?? {}),
        inbound_last_synced: newBaseline,
        inbound_last_synced_at: new Date().toISOString(),
      },
    })
    .eq("id", refRow.id)
  if (refUpdErr) {
    return { status: "failed", applied, conflicts, error: refUpdErr.message }
  }

  return { status: "processed", applied, conflicts }
}
