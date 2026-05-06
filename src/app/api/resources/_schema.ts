/**
 * Resources POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * Only `display_name` is trim-able; kind is enum, the rest are numbers
 * or booleans.
 */

import { z } from "zod"

import { RESOURCE_KINDS } from "@/types/resource"
import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

// PROJ-54-α — both-or-neither invariant for the Override pair. The DB also
// enforces this via `resources_override_consistency` CHECK; the Zod schemas
// fail fast with a clear validation error before the round-trip.
function bothOrNeither(val: {
  daily_rate_override?: number | null
  daily_rate_override_currency?: string | null
}): boolean {
  const r = val.daily_rate_override
  const c = val.daily_rate_override_currency
  const rSet = r !== null && r !== undefined
  const cSet = c !== null && c !== undefined && c.length > 0
  return rSet === cSet
}

const overrideRefinement = {
  message:
    "daily_rate_override und daily_rate_override_currency müssen gemeinsam gesetzt oder beide leer sein.",
  path: ["daily_rate_override"],
}

export const resourceCreateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(200),
    kind: z
      .enum(RESOURCE_KINDS as unknown as [string, ...string[]])
      .default("internal"),
    fte_default: z.number().min(0).max(1).default(1),
    availability_default: z.number().min(0).max(1).default(1),
    is_active: z.boolean().default(true),
    source_stakeholder_id: z.string().uuid().optional().nullable(),
    linked_user_id: z.string().uuid().optional().nullable(),
    // PROJ-54-α — per-resource Tagessatz-Override (Class-3 PII).
    daily_rate_override: z.number().positive().optional().nullable(),
    daily_rate_override_currency: z
      .enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
  })
  .refine(bothOrNeither, overrideRefinement)

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
    // PROJ-54-α — Override is admin-only at the API layer (enforced in the
    // PATCH handler via `requireTenantAdmin` when either field is in payload).
    daily_rate_override: z.number().positive().optional().nullable(),
    daily_rate_override_currency: z
      .enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(bothOrNeither, overrideRefinement)

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
