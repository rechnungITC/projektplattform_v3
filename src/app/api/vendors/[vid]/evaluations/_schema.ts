/**
 * Vendor evaluations POST Zod schema — colocated module.
 * Append-only (no PATCH route).
 */

import { z } from "zod"

export const evaluationCreateSchema = z.object({
  criterion: z.string().trim().min(1).max(200),
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().nullable(),
})

const TRIM_FIELDS = ["criterion", "comment"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeEvaluationPayload<
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
