/**
 * Outbox POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * Why a separate file:
 *   - Single source of truth for the field set.
 *   - Drift-test introspects `.shape` to assert every key reaches the DB
 *     payload — catches the "field accepted by Zod but silently dropped"
 *     bug class.
 *
 * `body` (the email/message body) is NOT trimmed — leading/trailing
 * whitespace is part of user formatting. Only `recipient` and `subject`
 * are trimmed. `metadata` is JSONB; passes through unchanged.
 */

import { z } from "zod"

import { CHANNELS } from "@/types/communication"

export const outboxCreateSchema = z.object({
  channel: z.enum(CHANNELS as unknown as [string, ...string[]]),
  recipient: z.string().trim().min(1).max(320),
  subject: z.string().trim().max(255).optional().nullable(),
  body: z.string().min(1).max(50000),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const outboxPatchSchema = z
  .object({
    channel: z.enum(CHANNELS as unknown as [string, ...string[]]).optional(),
    recipient: z.string().trim().min(1).max(320).optional(),
    subject: z.string().trim().max(255).optional().nullable(),
    body: z.string().min(1).max(50000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

const TRIM_FIELDS = ["recipient", "subject"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

/**
 * Normalize a parsed outbox payload before it goes to the DB:
 * - Trim recipient + subject, convert empty → NULL
 * - Pass body, channel, metadata through unchanged
 */
export function normalizeOutboxPayload<
  T extends Partial<Record<TrimField, string | null | undefined>> &
    Record<string, unknown>,
>(data: T): T {
  const out = { ...data } as Record<string, unknown>
  for (const f of TRIM_FIELDS) {
    if (f in out) {
      const v = out[f]
      if (typeof v === "string") {
        const trimmed = v.trim()
        out[f] = trimmed.length === 0 ? null : trimmed
      }
    }
  }
  return out as T
}
