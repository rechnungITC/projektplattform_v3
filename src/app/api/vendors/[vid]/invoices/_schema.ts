/**
 * Vendor invoices POST Zod schema — colocated module.
 * Append-only (no PATCH route).
 *
 * `invoice_number` is trimmed; `note` is intentionally NOT trimmed
 * (matches pre-extraction behavior — preserves verbatim formatting).
 */

import { z } from "zod"

import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

export const invoiceCreateSchema = z.object({
  invoice_number: z.string().trim().min(1).max(100),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  gross_amount: z.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]),
  project_id: z.string().uuid().nullable().optional(),
  file_storage_key: z.string().max(1000).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
})

const TRIM_FIELDS = ["invoice_number"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeInvoicePayload<
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
