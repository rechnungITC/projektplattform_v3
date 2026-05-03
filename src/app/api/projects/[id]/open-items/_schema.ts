/**
 * Open-items POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * Why a separate file:
 *   - Single source of truth for the field set.
 *   - Drift-test introspects `.shape` to assert every key reaches the DB
 *     payload — catches the "field accepted by Zod but silently dropped"
 *     bug class.
 */

import { z } from "zod"

export const openItemCreateSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  status: z
    .enum(["open", "in_clarification", "closed"] as const)
    .default("open"),
  contact: z.string().max(255).optional().nullable(),
  contact_stakeholder_id: z.string().uuid().optional().nullable(),
})

export const openItemPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).optional().nullable(),
    status: z.enum(["open", "in_clarification", "closed"] as const).optional(),
    contact: z.string().max(255).optional().nullable(),
    contact_stakeholder_id: z.string().uuid().optional().nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

const TRIM_FIELDS = ["title", "description", "contact"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

/**
 * Normalize a parsed open-item payload before it goes to the DB:
 * - Trim string fields, convert empty → NULL
 * - Pass everything else (UUIDs, status, nulls) through unchanged
 */
export function normalizeOpenItemPayload<
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
