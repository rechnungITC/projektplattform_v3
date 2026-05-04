/**
 * Vendor documents POST Zod schema — colocated module.
 * Append-only (no PATCH route).
 */

import { z } from "zod"

import { VENDOR_DOCUMENT_KINDS } from "@/types/vendor"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const documentCreateSchema = z.object({
  kind: z.enum(VENDOR_DOCUMENT_KINDS as unknown as [string, ...string[]]),
  title: z.string().trim().min(1).max(200),
  external_url: z
    .string()
    .trim()
    .url()
    .startsWith("https://", "URL muss HTTPS sein")
    .max(2000),
  document_date: isoDate.optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
})

const TRIM_FIELDS = ["title", "external_url", "note"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeDocumentPayload<
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
