/**
 * PROJ-61 release API schemas.
 *
 * Releases are Jira-like Versions/FixVersions. Dates are plain YYYY-MM-DD
 * values; text fields are trimmed before writing to the database.
 */

import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

export const RELEASE_STATUSES = [
  "planned",
  "active",
  "released",
  "archived",
] as const

export const releaseCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(5000).nullable().optional(),
    start_date: isoDate.nullable().optional(),
    end_date: isoDate.nullable().optional(),
    status: z.enum(RELEASE_STATUSES).optional(),
    target_milestone_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "end_date must be >= start_date",
    path: ["end_date"],
  })

export const releasePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(5000).nullable().optional(),
    start_date: isoDate.nullable().optional(),
    end_date: isoDate.nullable().optional(),
    status: z.enum(RELEASE_STATUSES).optional(),
    target_milestone_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required.",
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "end_date must be >= start_date",
    path: ["end_date"],
  })

const TRIM_FIELDS = ["name", "description"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeReleasePayload<
  T extends Partial<Record<TrimField, string | null | undefined>> &
    Record<string, unknown>,
>(data: T): T {
  const out = { ...data } as Record<string, unknown>
  for (const field of TRIM_FIELDS) {
    if (field in out) {
      const value = out[field]
      if (typeof value === "string") {
        const trimmed = value.trim()
        out[field] = trimmed.length === 0 ? null : trimmed
      }
    }
  }
  return out as T
}
