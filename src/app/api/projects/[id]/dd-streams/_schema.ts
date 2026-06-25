import { z } from "zod"

// PROJ-112 — DD-stream instance per (project, stream_key).

export const DD_STREAM_STATUSES = [
  "not_started",
  "started",
  "in_review",
  "findings_consolidated",
  "completed",
] as const

const streamKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,40}$/, "stream_key must be lowercase a-z0-9_ (2-41 chars)")

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

const levels = ["standard", "confidential", "strict"] as const

export const createDdStreamSchema = z.object({
  stream_key: streamKey,
  label: z.string().trim().min(1).max(120),
  stream_lead_user_id: z.string().uuid().nullish(),
  planned_start: dateString.nullish(),
  planned_end: dateString.nullish(),
  scope: z.string().trim().max(4000).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  confidentiality_level: z.enum(levels).optional(),
  phase_id: z.string().uuid().nullish(),
  sort_order: z.number().int().min(0).max(9999).optional(),
})

export const updateDdStreamSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    stream_lead_user_id: z.string().uuid().nullable(),
    planned_start: dateString.nullable(),
    planned_end: dateString.nullable(),
    scope: z.string().trim().max(4000).nullable(),
    notes: z.string().trim().max(4000).nullable(),
    confidentiality_level: z.enum(levels),
    phase_id: z.string().uuid().nullable(),
    sort_order: z.number().int().min(0).max(9999),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const transitionDdStreamSchema = z.object({
  to_status: z.enum(DD_STREAM_STATUSES),
  comment: z.string().trim().max(2000).nullish(),
})

export const DD_STREAM_SELECT =
  "id, tenant_id, project_id, stream_key, label, stream_lead_user_id, status, planned_start, planned_end, scope, notes, confidentiality_level, phase_id, sort_order, created_by, created_at, updated_at"
