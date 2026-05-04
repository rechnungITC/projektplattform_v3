/**
 * Work-item resources POST/PATCH Zod schemas — colocated module so the
 * routes AND the drift-tests can both import them.
 *
 * No trim-able string fields (resource_id is UUID, allocation_pct is a
 * number). Provided as structural twin to the other entity _schema.ts
 * modules.
 */

import { z } from "zod"

export const resourceAllocationCreateSchema = z.object({
  resource_id: z.string().uuid(),
  allocation_pct: z.number().min(0).max(200),
})

export const resourceAllocationPatchSchema = z
  .object({
    allocation_pct: z.number().min(0).max(200).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

export function normalizeResourceAllocationPayload<
  T extends Record<string, unknown>,
>(data: T): T {
  return { ...data } as T
}
