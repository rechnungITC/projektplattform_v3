import { z } from "zod"

// PROJ-112 — tenant-scoped DD-stream template catalog.

const streamKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,40}$/, "stream_key must be lowercase a-z0-9_ (2-41 chars)")

export const createTemplateSchema = z.object({
  stream_key: streamKey,
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
})

export const updateTemplateSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable(),
    sort_order: z.number().int().min(0).max(9999),
    is_active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const TEMPLATE_SELECT =
  "id, tenant_id, stream_key, label, description, sort_order, is_active, created_by, created_at, updated_at"
