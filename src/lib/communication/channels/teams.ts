/**
 * PROJ-49 — Microsoft Teams channel via a Workflows (Power Automate) webhook.
 *
 * Replaces the PROJ-13 `stub-teams.ts`. The tenant admin stores a Teams
 * **Workflows incoming-webhook URL** in `tenant_secrets` (connector_key
 * 'teams'); the outbox-service decrypts it and passes it in as
 * `input.webhookUrl`. Delivery = one authenticated HTTPS POST of a minimal
 * text payload. No app registration, no OAuth, no dependency.
 *
 * Why Workflows and not Graph / classic connector: Graph app-only
 * channel-post is migration-only and the classic O365 connector retired
 * 2026-05 (CIA review 2026-06-15). Real "post as a named user/bot" via Graph
 * delegated auth is split out to PROJ-133.
 *
 * Class-3 enforcement is handled UPSTREAM in the outbox service — by the time
 * we reach this adapter the dispatch is already permitted.
 *
 * Hardening (AC-H1..H6): the webhook URL is a secret → `sanitizeTeamsError`
 * scrubs it from every error string; bounded retry/backoff on 429/5xx then
 * fail (no infinite retry); minimal text only (no Adaptive Cards/buttons);
 * the outbox row id rides along as a correlation marker.
 */

import type { ChannelAdapter, DispatchInput, DispatchOutcome } from "./types"

const MAX_ATTEMPTS = 3
const BACKOFF_MS = [300, 900] // delays between attempts 1→2, 2→3
const REQUEST_TIMEOUT_MS = 10_000

/** Redact the webhook URL (a secret) + any bearer-ish token from error text. */
export function sanitizeTeamsError(raw: string, webhookUrl?: string): string {
  let out = raw
  if (webhookUrl) out = out.split(webhookUrl).join("[redacted-webhook-url]")
  out = out
    .replace(/https:\/\/[^\s"']*\/workflows\/[^\s"']*/gi, "[redacted-webhook-url]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
  return out.slice(0, 500)
}

function buildPayload(input: DispatchInput): Record<string, unknown> {
  const title = input.subject?.trim()
  const text = title ? `**${title}**\n\n${input.body}` : input.body
  // Minimal, Adaptive-Card-free payload. The tenant's Workflow maps the
  // `text` field onto the channel message. A correlation marker aids tracing
  // an at-least-once retry without spawning a new outbox row.
  return input.correlationId
    ? { text: `${text}\n\n_ref: ${input.correlationId}_` }
    : { text }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export const TeamsChannel: ChannelAdapter = {
  channel: "teams",
  async dispatch(input: DispatchInput): Promise<DispatchOutcome> {
    const url = input.webhookUrl?.trim()
    if (!url) {
      return {
        ok: false,
        error_detail:
          "teams-not-configured: Kein Workflows-Webhook hinterlegt. Tenant-Admin trägt die URL unter Konnektoren → Microsoft Teams ein.",
      }
    }

    const payload = JSON.stringify(buildPayload(input))
    let lastError = "unknown"

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        let res: Response
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timer)
        }

        if (res.ok) {
          return { ok: true, stub: false }
        }

        // 4xx (except 429) → permanent: misconfig/invalid URL, don't retry.
        if (res.status !== 429 && res.status < 500) {
          const bodyText = await res.text().catch(() => "")
          return {
            ok: false,
            error_detail: sanitizeTeamsError(
              `Teams-Webhook lehnte ab (HTTP ${res.status}): ${bodyText || "URL ungültig oder Workflow gelöscht."}`,
              url,
            ),
          }
        }

        // 429 / 5xx → transient: retry with bounded backoff.
        lastError = `HTTP ${res.status}`
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }

      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1] ?? 900)
    }

    return {
      ok: false,
      error_detail: sanitizeTeamsError(
        `Teams-Versand nach ${MAX_ATTEMPTS} Versuchen fehlgeschlagen: ${lastError}`,
        url,
      ),
    }
  },
}
