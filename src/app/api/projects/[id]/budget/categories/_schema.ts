/**
 * Budget categories POST/PATCH Zod schemas — colocated module so the
 * routes AND the drift-tests can both import them.
 */

import { z } from "zod"

export const budgetCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).nullable().optional(),
  position: z.number().int().min(0).max(10000).optional(),
})

export const budgetCategoryPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(2000).nullable().optional(),
    position: z.number().int().min(0).max(10000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required.",
  })

const TRIM_FIELDS = ["name", "description"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeBudgetCategoryPayload<
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
