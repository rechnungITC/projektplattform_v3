/**
 * Vendor master-data POST/PATCH Zod schemas — colocated module so the
 * routes AND the drift-tests can both import them.
 *
 * `name`, `category`, `primary_contact_email`, `website` are trimmed and
 * empty → NULL. `status` is the VENDOR_STATUSES enum (not trimmed).
 */

import { z } from "zod"

import { VENDOR_STATUSES } from "@/types/vendor"

export const vendorCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  category: z.string().trim().max(120).optional().nullable(),
  primary_contact_email: z
    .string()
    .trim()
    .email()
    .max(320)
    .optional()
    .nullable(),
  website: z
    .string()
    .trim()
    .url()
    .startsWith("https://", "Website muss HTTPS sein")
    .max(2000)
    .optional()
    .nullable(),
  status: z
    .enum(VENDOR_STATUSES as unknown as [string, ...string[]])
    .default("active"),
})

export const vendorPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    category: z.string().trim().max(120).optional().nullable(),
    primary_contact_email: z
      .string()
      .trim()
      .email()
      .max(320)
      .optional()
      .nullable(),
    website: z
      .string()
      .trim()
      .url()
      .startsWith("https://", "Website muss HTTPS sein")
      .max(2000)
      .optional()
      .nullable(),
    status: z
      .enum(VENDOR_STATUSES as unknown as [string, ...string[]])
      .optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

const TRIM_FIELDS = [
  "name",
  "category",
  "primary_contact_email",
  "website",
] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeVendorPayload<
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
