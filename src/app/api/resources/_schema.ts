/**
 * Resources POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * Only `display_name` is trim-able; kind is enum, the rest are numbers
 * or booleans.
 */

import { z } from "zod"

import { RESOURCE_KINDS } from "@/types/resource"

export const resourceCreateSchema = z.object({
  display_name: z.string().trim().min(1).max(200),
  kind: z
    .enum(RESOURCE_KINDS as unknown as [string, ...string[]])
    .default("internal"),
  fte_default: z.number().min(0).max(1).default(1),
  availability_default: z.number().min(0).max(1).default(1),
  is_active: z.boolean().default(true),
  source_stakeholder_id: z.string().uuid().optional().nullable(),
  linked_user_id: z.string().uuid().optional().nullable(),
})

export const resourcePatchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(200).optional(),
    kind: z
      .enum(RESOURCE_KINDS as unknown as [string, ...string[]])
      .optional(),
    fte_default: z.number().min(0).max(1).optional(),
    availability_default: z.number().min(0).max(1).optional(),
    is_active: z.boolean().optional(),
    linked_user_id: z.string().uuid().optional().nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

const TRIM_FIELDS = ["display_name"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeResourcePayload<
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
