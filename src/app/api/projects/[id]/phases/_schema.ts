/**
 * Phases POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * `planned_start`, `planned_end`, `actual_start`, `actual_end` are
 * YYYY-MM-DD strings — NOT trimmable. `is_critical` (PROJ-35-β) is
 * a boolean. Cross-field rule (planned_end ≥ planned_start) is
 * enforced via .refine() on the create schema.
 */

import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

export const phaseCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(5000).optional().nullable(),
    planned_start: isoDate.optional().nullable(),
    planned_end: isoDate.optional().nullable(),
    sequence_number: z.number().int().positive().optional(),
  })
  .refine(
    (v) =>
      !v.planned_start || !v.planned_end || v.planned_end >= v.planned_start,
    { message: "planned_end must be >= planned_start", path: ["planned_end"] }
  )

export const phasePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    planned_start: isoDate.nullable().optional(),
    planned_end: isoDate.nullable().optional(),
    actual_start: isoDate.nullable().optional(),
    actual_end: isoDate.nullable().optional(),
    // PROJ-35-β: Critical-Path-Marker (PM-driven, opt-in).
    is_critical: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required.",
  })

const TRIM_FIELDS = ["name", "description"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizePhasePayload<
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
