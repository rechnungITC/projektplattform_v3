/**
 * Resource availabilities POST Zod schema — colocated module.
 * Append-only (no PATCH route — DELETE only).
 */

import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const availabilityCreateSchema = z
  .object({
    start_date: isoDate,
    end_date: isoDate,
    fte: z.number().min(0).max(1),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => v.start_date <= v.end_date, {
    message: "start_date must be ≤ end_date",
    path: ["end_date"],
  })

const TRIM_FIELDS = ["note"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeAvailabilityPayload<
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
