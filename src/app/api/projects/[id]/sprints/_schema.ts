/**
 * Sprints POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * `start_date` and `end_date` are YYYY-MM-DD strings — NOT trimmable.
 * The PATCH schema chains TWO `.refine()` calls (non-empty + date range).
 */

import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

export const sprintCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    goal: z.string().max(5000).nullable().optional(),
    start_date: isoDate.nullable().optional(),
    end_date: isoDate.nullable().optional(),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "end_date must be >= start_date",
    path: ["end_date"],
  })

export const sprintPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    goal: z.string().max(5000).nullable().optional(),
    start_date: isoDate.nullable().optional(),
    end_date: isoDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required.",
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "end_date must be >= start_date",
    path: ["end_date"],
  })

const TRIM_FIELDS = ["name", "goal"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeSprintPayload<
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
