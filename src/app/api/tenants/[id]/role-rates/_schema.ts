/**
 * Role-rates POST Zod schema — append-only versioning (PROJ-24 ST-07).
 * No PATCH route — rate changes are NEW rows with a newer valid_from.
 */

import { z } from "zod"

import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

export const roleRateCreateSchema = z.object({
  role_key: z.string().trim().min(1).max(100),
  daily_rate: z.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
})

const TRIM_FIELDS = ["role_key"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeRoleRatePayload<
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
