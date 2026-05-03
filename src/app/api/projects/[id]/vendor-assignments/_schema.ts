/**
 * Vendor-assignments POST/PATCH Zod schemas — colocated module so the
 * routes AND the drift-tests can both import them.
 *
 * Why a separate file:
 *   - Single source of truth for the field set.
 *   - Drift-test introspects `.shape` to assert every key reaches the DB
 *     payload — catches the "field accepted by Zod but silently dropped"
 *     bug class.
 *
 * `valid_from` / `valid_until` are YYYY-MM-DD strings, NOT trimmable.
 * Cross-field rule (valid_from ≤ valid_until) is enforced via .refine().
 *
 * Note: The PATCH schema chains TWO `.refine()` calls (non-empty + date
 * range). Drift-tests must unwrap both ZodEffects layers via
 * `_def.schema._def.schema.shape` for v3, or `.shape` accessor for v4
 * which auto-resolves through effects.
 */

import { z } from "zod"

import { VENDOR_ROLES } from "@/types/vendor"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const vendorAssignmentCreateSchema = z
  .object({
    vendor_id: z.string().uuid(),
    role: z.enum(VENDOR_ROLES as unknown as [string, ...string[]]),
    scope_note: z.string().trim().max(2000).optional().nullable(),
    valid_from: isoDate.optional().nullable(),
    valid_until: isoDate.optional().nullable(),
  })
  .refine(
    (v) => !v.valid_from || !v.valid_until || v.valid_from <= v.valid_until,
    {
      message: "valid_from must be ≤ valid_until",
      path: ["valid_until"],
    }
  )

export const vendorAssignmentPatchSchema = z
  .object({
    role: z.enum(VENDOR_ROLES as unknown as [string, ...string[]]).optional(),
    scope_note: z.string().trim().max(2000).optional().nullable(),
    valid_from: isoDate.optional().nullable(),
    valid_until: isoDate.optional().nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(
    (v) => !v.valid_from || !v.valid_until || v.valid_from <= v.valid_until,
    {
      message: "valid_from must be ≤ valid_until",
      path: ["valid_until"],
    }
  )

const TRIM_FIELDS = ["scope_note"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

/**
 * Normalize a parsed vendor-assignment payload before it goes to the DB:
 * - Trim string fields, convert empty → NULL
 * - Pass everything else (UUIDs, dates, role enum, nulls) through unchanged
 */
export function normalizeVendorAssignmentPayload<
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
