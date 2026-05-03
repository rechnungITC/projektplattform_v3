/**
 * Milestones POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * Why a separate file:
 *   - Single source of truth for the field set.
 *   - Drift-test introspects `.shape` to assert every key reaches the DB
 *     payload — catches the "field accepted by Zod but silently dropped"
 *     bug class.
 *
 * `target_date` and `actual_date` are YYYY-MM-DD strings, NOT trimmable —
 * they're not in the TRIM_FIELDS list so they pass through unchanged.
 */

import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

export const milestoneCreateSchema = z.object({
  phase_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  target_date: isoDate,
  status: z
    .enum(["planned", "achieved", "missed", "cancelled"])
    .default("planned"),
})

export const milestonePatchSchema = z
  .object({
    phase_id: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    target_date: isoDate.optional(),
    actual_date: isoDate.nullable().optional(),
    status: z.enum(["planned", "achieved", "missed", "cancelled"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required.",
  })

const TRIM_FIELDS = ["name", "description"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

/**
 * Normalize a parsed milestone payload before it goes to the DB:
 * - Trim string fields, convert empty → NULL
 * - Pass everything else (UUIDs, dates, status) through unchanged
 */
export function normalizeMilestonePayload<
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
