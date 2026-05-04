/**
 * Budget postings POST Zod schema — colocated module so the route AND
 * the drift-test can both import it.
 *
 * Postings are append-only — there is no PATCH route. Reversals are
 * handled by the dedicated `/[pid]/reverse` endpoint, which has no
 * request body.
 *
 * `source` is server-derived (`source_ref_id ? "vendor_invoice" : "manual"`)
 * and not part of the schema. `note` is NOT trimmed — matches the
 * pre-extraction route behavior verbatim.
 */

import { z } from "zod"

import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

export const budgetPostingCreateSchema = z.object({
  item_id: z.string().uuid(),
  kind: z.enum(["actual", "reservation"] as const),
  amount: z.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]),
  posted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  note: z.string().max(500).nullable().optional(),
  source_ref_id: z.string().uuid().nullable().optional(),
})

/**
 * Postings have no trim-able fields per current route behavior — note is
 * intentionally NOT trimmed. Provided as a no-op for consistency with the
 * other entity normalize helpers in this project.
 */
export function normalizeBudgetPostingPayload<
  T extends Record<string, unknown>,
>(data: T): T {
  return { ...data } as T
}
