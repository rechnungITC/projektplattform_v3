/**
 * Budget items POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * `planned_amount` is a number; `planned_currency` is a SUPPORTED_CURRENCIES
 * enum; `position` and `is_active` are non-trimmable.
 */

import { z } from "zod"

import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

export const budgetItemCreateSchema = z.object({
  category_id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).nullable().optional(),
  planned_amount: z.number().nonnegative(),
  planned_currency: z.enum(
    SUPPORTED_CURRENCIES as unknown as [string, ...string[]]
  ),
  position: z.number().int().min(0).max(10000).optional(),
  is_active: z.boolean().optional(),
})

export const budgetItemPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(2000).nullable().optional(),
    planned_amount: z.number().nonnegative().optional(),
    planned_currency: z
      .enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]])
      .optional(),
    position: z.number().int().min(0).max(10000).optional(),
    is_active: z.boolean().optional(),
    category_id: z.string().uuid().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required.",
  })

const TRIM_FIELDS = ["name", "description"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeBudgetItemPayload<
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
