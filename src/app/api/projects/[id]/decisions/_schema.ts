/**
 * Decisions POST Zod schema — colocated module so the route AND the
 * drift-test can both import it.
 *
 * Why a separate file:
 *   - Single source of truth for the field set.
 *   - Drift-test introspects `decisionCreateSchema.shape` to assert every
 *     key reaches the DB insertPayload — catches the "field accepted by
 *     Zod but silently dropped" bug class.
 *
 * Decisions are append-only (no PATCH); revising means POSTing a new
 * decision with `supersedes_decision_id`. A DB trigger flips the
 * predecessor's `is_revised`.
 */

import { z } from "zod"

export const decisionCreateSchema = z.object({
  title: z.string().trim().min(1).max(255),
  decision_text: z.string().trim().min(1).max(10000),
  rationale: z.string().max(10000).optional().nullable(),
  decided_at: z
    .string()
    .min(1)
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid ISO timestamp")
    .optional(),
  decider_stakeholder_id: z.string().uuid().optional().nullable(),
  context_phase_id: z.string().uuid().optional().nullable(),
  context_risk_id: z.string().uuid().optional().nullable(),
  supersedes_decision_id: z.string().uuid().optional().nullable(),
})

/**
 * Trimmable text fields where empty string should become NULL. Other
 * fields (UUIDs, timestamps) pass through unchanged via spread.
 */
const TRIM_FIELDS = ["title", "decision_text", "rationale"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

/**
 * Normalize a parsed decision payload before it goes to the DB:
 * - Trim string fields, convert empty → NULL
 * - Pass everything else (UUIDs, timestamps, nulls) through unchanged
 *
 * `decided_at` is NOT normalized here — it gets a server-side default
 * (`new Date().toISOString()`) directly in the route, alongside other
 * server-set fields like `tenant_id` and `created_by`.
 */
export function normalizeDecisionPayload<
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
