/**
 * PROJ-13 — email channel via Resend.
 *
 * Falls back to a deterministic stub when `RESEND_API_KEY` is missing.
 * The stub returns `ok: true, stub: true` so the outbox row still flips
 * to `sent`, but the UI can surface a "Demo mode" banner via the row's
 * `metadata.stub` flag (set by the outbox service when it sees the
 * adapter's stub indicator).
 *
 * Class-3 enforcement is handled UPSTREAM in the outbox service — by the
 * time we reach this adapter, the dispatch is already permitted.
 */

import { Resend } from "resend"

import type {
  ChannelAdapter,
  DispatchInput,
  DispatchOutcome,
} from "./types"

const DEFAULT_FROM = "noreply@projektplattform.local"

export const EmailChannel: ChannelAdapter = {
  channel: "email",
  async dispatch(input: DispatchInput): Promise<DispatchOutcome> {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const fromEmail =
      process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM

    if (!apiKey) {
      // Stub fallback — preserves the user flow without an API key.
      return { ok: true, stub: true }
    }

    try {
      const client = new Resend(apiKey)
      const subject = input.subject?.trim() || "(ohne Betreff)"
      const result = await client.emails.send({
        from: fromEmail,
        to: input.recipient,
        subject,
        text: input.body,
      })
      if (result.error) {
        return {
          ok: false,
          error_detail: `Resend rejected the message: ${result.error.message}`,
        }
      }
      return {
        ok: true,
        provider_message_id: result.data?.id,
        stub: false,
      }
    } catch (err) {
      return {
        ok: false,
        error_detail: err instanceof Error ? err.message : String(err),
      }
    }
  },
}
